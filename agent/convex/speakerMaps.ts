import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const entryValidator = v.object({
  speaker: v.number(),
  name: v.union(v.string(), v.null()),
  title: v.union(v.string(), v.null()),
  role: v.string(),
  confidence: v.number(),
});

/**
 * Upsert one meeting's gated speaker map (MOO-143). Idempotent per eventId so the
 * mapper can re-run on an already-ingested meeting without duplicating rows.
 */
export const upsertByEvent = mutation({
  args: {
    eventId: v.number(),
    eventBodyName: v.optional(v.string()),
    entries: v.array(entryValidator),
  },
  handler: async (ctx, { eventId, eventBodyName, entries }) => {
    const row = { eventId, eventBodyName, entries, updatedAt: Date.now() };
    const existing = await ctx.db
      .query('speakerMaps')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert('speakerMaps', row);
  },
});

/**
 * The speaker map for one meeting as a `{ [speaker]: {name,title,role,confidence} }`
 * lookup — the shape `formatSpeakerLabel` consumes. Returns null when unmapped, so a
 * receipt degrades to a generic label rather than blocking the quote.
 */
export const getByEvent = query({
  args: { eventId: v.number() },
  handler: async (ctx, { eventId }) => {
    const row = await ctx.db
      .query('speakerMaps')
      .withIndex('by_event', (q) => q.eq('eventId', eventId))
      .unique();
    if (!row) return null;
    return Object.fromEntries(
      row.entries.map((e) => [e.speaker, { name: e.name, title: e.title, role: e.role, confidence: e.confidence }]),
    );
  },
});
