import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

// The poller-supplied portion of a queue row; detectedAt + alertStatus are
// stamped server-side so detection time is the DB's own clock.
const detectedItem = v.object({
  client: clientValidator,
  eventItemId: v.number(),
  eventId: v.number(),
  matterId: v.optional(v.number()),
  title: v.string(),
  agendaNumber: v.optional(v.string()),
  eventBodyName: v.string(),
  eventDate: v.optional(v.string()),
  agendaPublishedUTC: v.optional(v.string()),
});

/** The seen EventItemIds for a client — the poller's idempotency input. */
export const listSeenKeys = query({
  args: { client: clientValidator },
  handler: async (ctx, { client }) => {
    const rows = await ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_item', (q) => q.eq('client', client))
      .collect();
    return rows.map((r) => r.eventItemId);
  },
});

/**
 * Insert genuinely-new items as pending alerts. DB-level idempotency guard:
 * skips any (client, eventItemId) already present. Returns the count inserted.
 */
export const enqueueDetected = mutation({
  args: { items: v.array(detectedItem) },
  handler: async (ctx, { items }) => {
    let inserted = 0;
    for (const item of items) {
      const existing = await ctx.db
        .query('detectedAgendaItems')
        .withIndex('by_client_item', (q) => q.eq('client', item.client).eq('eventItemId', item.eventItemId))
        .unique();
      if (existing) continue;
      await ctx.db.insert('detectedAgendaItems', { ...item, detectedAt: Date.now(), alertStatus: 'pending' });
      inserted += 1;
    }
    return inserted;
  },
});

/** Pending alerts awaiting summarize+post (MOO-44's consumer). */
export const listPending = query({
  args: { client: v.optional(clientValidator) },
  handler: (ctx, { client }) =>
    client
      ? ctx.db
          .query('detectedAgendaItems')
          .withIndex('by_client_status', (q) => q.eq('client', client).eq('alertStatus', 'pending'))
          .collect()
      : ctx.db
          .query('detectedAgendaItems')
          .filter((q) => q.eq(q.field('alertStatus'), 'pending'))
          .collect(),
});

/**
 * Remove one detected row by key — used only by the verify script to keep the
 * acceptance run repeatable. Returns the deleted id, or null.
 */
export const removeDetected = mutation({
  args: { client: clientValidator, eventItemId: v.number() },
  handler: async (ctx, { client, eventItemId }) => {
    const existing = await ctx.db
      .query('detectedAgendaItems')
      .withIndex('by_client_item', (q) => q.eq('client', client).eq('eventItemId', eventItemId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return existing?._id ?? null;
  },
});
