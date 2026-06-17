import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const outcomeInput = v.object({
  eventItemId: v.number(),
  eventId: v.number(),
  matterId: v.optional(v.number()),
  matterFile: v.optional(v.string()),
  agendaNumber: v.optional(v.string()),
  actionName: v.string(),
  actionText: v.optional(v.string()),
  passedFlag: v.optional(v.string()),
  mover: v.optional(v.string()),
  seconder: v.optional(v.string()),
  tally: v.optional(v.string()),
  eventDate: v.optional(v.string()),
  minutesFile: v.optional(v.string()),
});

/** Remove every outcome for one event — makes re-ingest idempotent. */
export const clearEvent = mutation({
  args: { eventId: v.number() },
  handler: async (ctx, { eventId }) => {
    const rows = await ctx.db
      .query('matterOutcomes')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .collect();
    for (const row of rows) await ctx.db.delete(row._id);
    return rows.length;
  },
});

/** Batch-insert a meeting's per-item outcomes (the ingest clears the event first). */
export const insertOutcomes = mutation({
  args: { outcomes: v.array(outcomeInput), recordedAt: v.number() },
  handler: async (ctx, { outcomes, recordedAt }) => {
    for (const outcome of outcomes) await ctx.db.insert('matterOutcomes', { ...outcome, recordedAt });
    return outcomes.length;
  },
});

/** Outcome count for an event — the ingest script's sanity check. */
export const countByEvent = query({
  args: { eventId: v.number() },
  handler: async (ctx, { eventId }) =>
    (
      await ctx.db
        .query('matterOutcomes')
        .withIndex('by_event', (q) => q.eq('eventId', eventId))
        .collect()
    ).length,
});

/** The recorded outcomes for a matter across meetings — "what was decided" for a file. */
export const byMatter = query({
  args: { matterId: v.number() },
  handler: async (ctx, { matterId }) =>
    ctx.db
      .query('matterOutcomes')
      .withIndex('by_matter', (q) => q.eq('matterId', matterId))
      .collect(),
});
