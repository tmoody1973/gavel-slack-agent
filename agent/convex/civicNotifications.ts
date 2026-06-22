import { v } from 'convex/values';

import { action, mutation, query } from './_generated/server';

// The webhook/verify-script-supplied portion of a row. detectedAt + alertStatus
// are stamped server-side so ingestion time is the DB's own clock. Mirrors the
// shape produced by civicmail/notification.js buildNotificationRecord.
const notificationInput = v.object({
  messageId: v.string(),
  receivedAt: v.string(),
  from: v.string(),
  subject: v.string(),
  bodyText: v.string(),
  searchText: v.string(),
  category: v.string(),
  categoryRaw: v.optional(v.string()),
  subType: v.optional(v.string()),
  district: v.optional(v.string()),
  bid: v.optional(v.string()),
  addresses: v.array(v.string()),
  taxkeys: v.array(v.string()),
  taxkey: v.optional(v.string()),
  recordNumber: v.optional(v.string()),
  legistarMeetingId: v.optional(v.string()),
  business: v.optional(v.string()),
  detailUrl: v.optional(v.string()),
  description: v.optional(v.string()),
  attachments: v.array(
    v.object({
      filename: v.string(),
      contentType: v.string(),
      attachmentId: v.string(),
      size: v.optional(v.number()),
    }),
  ),
});

const summaryValidator = v.object({
  en: v.object({ summary: v.string(), whyItMatters: v.string() }),
  es: v.object({ summary: v.string(), whyItMatters: v.string() }),
});

/**
 * Ingest one E-Notify notification. DB-level idempotency guard on the RFC822
 * messageId absorbs AgentMail's at-least-once webhook retries. Returns the new
 * row id, or null if the message was already stored.
 */
export const insertNotification = mutation({
  args: { record: notificationInput },
  handler: async (ctx, { record }) => {
    const existing = await ctx.db
      .query('civicNotifications')
      .withIndex('by_message', (q) => q.eq('messageId', record.messageId))
      .unique();
    if (existing) return null;
    return ctx.db.insert('civicNotifications', { ...record, alertStatus: 'pending', detectedAt: Date.now() });
  },
});

/** Flag a notification processed, caching its bilingual summary + optional embedding. */
export const markProcessed = mutation({
  args: { messageId: v.string(), summary: v.optional(summaryValidator), embedding: v.optional(v.array(v.float64())) },
  handler: async (ctx, { messageId, summary, embedding }) => {
    const row = await ctx.db
      .query('civicNotifications')
      .withIndex('by_message', (q) => q.eq('messageId', messageId))
      .unique();
    if (!row) return null;
    const patch: Record<string, unknown> = { alertStatus: 'processed' };
    if (summary) patch.summary = summary;
    if (embedding) patch.embedding = embedding;
    await ctx.db.patch(row._id, patch);
    return row._id;
  },
});

/** Remove one notification by messageId — keeps the verify run repeatable. */
export const removeNotification = mutation({
  args: { messageId: v.string() },
  handler: async (ctx, { messageId }) => {
    const row = await ctx.db
      .query('civicNotifications')
      .withIndex('by_message', (q) => q.eq('messageId', messageId))
      .unique();
    if (row) await ctx.db.delete(row._id);
    return row?._id ?? null;
  },
});

export const getByMessageId = query({
  args: { messageId: v.string() },
  handler: (ctx, { messageId }) =>
    ctx.db
      .query('civicNotifications')
      .withIndex('by_message', (q) => q.eq('messageId', messageId))
      .unique(),
});

/** Notifications awaiting summarize+route+post (the processor's queue). */
export const listPending = query({
  args: {},
  handler: (ctx) =>
    ctx.db
      .query('civicNotifications')
      .withIndex('by_status', (q) => q.eq('alertStatus', 'pending'))
      .collect(),
});

/**
 * The digest queue: notifications not yet rolled into a "From the city" digest.
 * Orthogonal to listPending (the alert/interrupt queue) — the twice-weekly cron
 * drains this, marking each row via markDigested for idempotency. Filtered in the
 * handler (digestedAt is optional, so there's no dedicated index).
 */
export const listUndigested = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('civicNotifications').collect();
    return rows.filter((row) => row.digestedAt === undefined);
  },
});

/** Stamp a set of notifications as digested (by messageId) so the next cron skips them. */
export const markDigested = mutation({
  args: { messageIds: v.array(v.string()), at: v.optional(v.number()) },
  handler: async (ctx, { messageIds, at }) => {
    const stamp = at ?? Date.now();
    let marked = 0;
    for (const messageId of messageIds) {
      const row = await ctx.db
        .query('civicNotifications')
        .withIndex('by_message', (q) => q.eq('messageId', messageId))
        .unique();
      if (row && row.digestedAt === undefined) {
        await ctx.db.patch(row._id, { digestedAt: stamp });
        marked += 1;
      }
    }
    return marked;
  },
});

/**
 * Store extracted attachment text and the rebuilt search field (MOO-153). The
 * caller (the attachment-index script) composes searchText from subject + body +
 * attachment text via the shared pure builder, so the fold logic lives in one place.
 */
export const setAttachmentText = mutation({
  args: { messageId: v.string(), attachmentText: v.string(), searchText: v.string() },
  handler: async (ctx, { messageId, attachmentText, searchText }) => {
    const row = await ctx.db
      .query('civicNotifications')
      .withIndex('by_message', (q) => q.eq('messageId', messageId))
      .unique();
    if (!row) return null;
    await ctx.db.patch(row._id, { attachmentText, searchText });
    return row._id;
  },
});

/** Clear the digested flag (all rows, or a given set) — keeps the demo repeatable. */
export const resetDigested = mutation({
  args: { messageIds: v.optional(v.array(v.string())) },
  handler: async (ctx, { messageIds }) => {
    const rows = messageIds
      ? await Promise.all(
          messageIds.map((messageId) =>
            ctx.db
              .query('civicNotifications')
              .withIndex('by_message', (q) => q.eq('messageId', messageId))
              .unique(),
          ),
        )
      : await ctx.db.query('civicNotifications').collect();
    let cleared = 0;
    for (const row of rows) {
      if (row && row.digestedAt !== undefined) {
        await ctx.db.patch(row._id, { digestedAt: undefined });
        cleared += 1;
      }
    }
    return cleared;
  },
});

/**
 * Filter-first historical query: a district's notifications within a date range,
 * newest first. The dominant civic search shape ("what did District 3 get last
 * month") — a relational index scan, not a vector search.
 */
export const searchByDistrictDate = query({
  args: { district: v.string(), fromDate: v.string(), toDate: v.optional(v.string()) },
  handler: (ctx, { district, fromDate, toDate }) =>
    ctx.db
      .query('civicNotifications')
      .withIndex('by_district', (q) => q.eq('district', district))
      .filter((q) =>
        toDate
          ? q.and(q.gte(q.field('receivedAt'), fromDate), q.lte(q.field('receivedAt'), toDate))
          : q.gte(q.field('receivedAt'), fromDate),
      )
      .order('desc')
      .collect(),
});

/** Entity-exact lookups — the parcel / record / Legistar fusion keys. */
export const getByTaxkey = query({
  args: { taxkey: v.string() },
  handler: (ctx, { taxkey }) =>
    ctx.db
      .query('civicNotifications')
      .withIndex('by_taxkey', (q) => q.eq('taxkey', taxkey))
      .collect(),
});

export const getByRecordNumber = query({
  args: { recordNumber: v.string() },
  handler: (ctx, { recordNumber }) =>
    ctx.db
      .query('civicNotifications')
      .withIndex('by_record', (q) => q.eq('recordNumber', recordNumber))
      .unique(),
});

/** Meetings carrying a given Legistar meeting id — the dedup-vs-poller lookup. */
export const getByLegistarMeeting = query({
  args: { legistarMeetingId: v.string() },
  handler: (ctx, { legistarMeetingId }) =>
    ctx.db
      .query('civicNotifications')
      .withIndex('by_legistar_meeting', (q) => q.eq('legistarMeetingId', legistarMeetingId))
      .collect(),
});

/** Resolve a set of ids (e.g. vector-search hits) back to their rows, in order. */
export const getByIds = query({
  args: { ids: v.array(v.id('civicNotifications')) },
  handler: async (ctx, { ids }) => {
    const rows = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return rows.filter((row) => row !== null);
  },
});

/** Full-text search over subject+body, optionally narrowed by district/category. */
export const searchText = query({
  args: {
    term: v.string(),
    district: v.optional(v.string()),
    category: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: (ctx, { term, district, category, limit }) =>
    ctx.db
      .query('civicNotifications')
      .withSearchIndex('search_text', (q) => {
        let search = q.search('searchText', term);
        if (district) search = search.eq('district', district);
        if (category) search = search.eq('category', category);
        return search;
      })
      .take(limit ?? 20),
});

/**
 * Semantic "find similar" — vectorSearch lives in an action (not a query). Takes
 * a pre-computed 1536-dim query embedding so the OpenAI dependency stays at the
 * caller (only populated behind AGENTMAIL_EMBED). Returns nearest notifications.
 */
export const findSimilar = action({
  args: { embedding: v.array(v.float64()), category: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, { embedding, category, limit }) => {
    const results = await ctx.vectorSearch('civicNotifications', 'by_embedding', {
      vector: embedding,
      limit: limit ?? 10,
      ...(category ? { filter: (q) => q.eq('category', category) } : {}),
    });
    return results;
  },
});
