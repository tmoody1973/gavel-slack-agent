import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery, mutation, query } from './_generated/server';

const chunkInput = v.object({
  eventId: v.number(),
  eventDate: v.string(),
  eventBodyName: v.optional(v.string()),
  eventMedia: v.optional(v.number()),
  eventItemId: v.number(),
  agendaNumber: v.optional(v.string()),
  matterId: v.optional(v.number()),
  text: v.string(),
  speakers: v.array(v.number()),
  startTime: v.number(),
  endTime: v.number(),
  embedding: v.array(v.float64()),
});

/** Batch-insert a meeting's transcript chunks. The ingest clears the event first. */
export const insertChunks = mutation({
  args: { chunks: v.array(chunkInput) },
  handler: async (ctx, { chunks }) => {
    for (const chunk of chunks) await ctx.db.insert('transcriptChunks', chunk);
    return chunks.length;
  },
});

/** Remove every chunk for one event — makes re-ingest idempotent. */
export const clearEvent = mutation({
  args: { eventId: v.number() },
  handler: async (ctx, { eventId }) => {
    const rows = await ctx.db
      .query('transcriptChunks')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

/** Chunk count for an event — the ingest script's sanity check. */
export const countByEvent = query({
  args: { eventId: v.number() },
  handler: async (ctx, { eventId }) =>
    (
      await ctx.db
        .query('transcriptChunks')
        .withIndex('by_event', (q) => q.eq('eventId', eventId))
        .collect()
    ).length,
});

/**
 * Distinct eventIds that have transcript chunks — the "🔍 Searchable" set behind
 * video discovery (MOO-142). One query the caller tags meetings against in memory,
 * instead of an N-round-trip `countByEvent` per meeting.
 */
export const listIngestedEventIds = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('transcriptChunks').collect();
    return [...new Set(rows.map((row) => row.eventId))];
  },
});

/** Hydrate vector-search hits into full receipts (search runs in an action). */
export const fetchChunks = internalQuery({
  args: { ids: v.array(v.id('transcriptChunks')) },
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return docs
      .filter((d) => d !== null)
      .map((d) => ({
        _id: d._id,
        text: d.text,
        speakers: d.speakers,
        startTime: d.startTime,
        endTime: d.endTime,
        eventId: d.eventId,
        eventDate: d.eventDate,
        eventBodyName: d.eventBodyName,
        eventMedia: d.eventMedia,
        eventItemId: d.eventItemId,
        agendaNumber: d.agendaNumber,
        matterId: d.matterId,
      }));
  },
});

/**
 * Semantic search over meeting transcripts — the heart of `search_transcripts`.
 * Vector search (the only place ctx.vectorSearch is available), optionally scoped
 * to one event or committee, then hydrated into receipts the caller turns into
 * "speaker said X at HH:MM:SS → watch" with a timestamped video deep link.
 */
export const search = action({
  args: {
    embedding: v.array(v.float64()),
    eventId: v.optional(v.number()),
    eventBodyName: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, { embedding, eventId, eventBodyName, limit }) => {
    const results = await ctx.vectorSearch('transcriptChunks', 'by_embedding', {
      vector: embedding,
      limit: limit ?? 6,
      ...(eventId != null || eventBodyName != null
        ? {
            filter: (q) =>
              eventId != null && eventBodyName != null
                ? q.and(q.eq('eventId', eventId), q.eq('eventBodyName', eventBodyName))
                : eventId != null
                  ? q.eq('eventId', eventId)
                  : q.eq('eventBodyName', eventBodyName),
          }
        : {}),
    });
    const scoreById = new Map(results.map((r) => [r._id, r._score]));
    const docs = await ctx.runQuery(internal.transcripts.fetchChunks, { ids: results.map((r) => r._id) });
    return docs
      .map(({ _id, ...doc }) => ({ ...doc, score: scoreById.get(_id) ?? 0 }))
      .sort((a, b) => b.score - a.score);
  },
});
