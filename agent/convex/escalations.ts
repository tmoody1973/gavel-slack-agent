import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

/** matterIds already escalated for a client — the sweep's idempotency input. */
export const listEscalatedMatterIds = query({
  args: { client: clientValidator },
  handler: async (ctx, { client }) => {
    const rows = await ctx.db
      .query('matterEscalations')
      .withIndex('by_client_matter', (q) => q.eq('client', client))
      .collect();
    return rows.map((r) => r.matterId);
  },
});

/** Record one matter's escalation. Idempotent per (client, matterId). */
export const recordEscalation = mutation({
  args: {
    client: clientValidator,
    matterId: v.number(),
    fileNumber: v.optional(v.string()),
    committee: v.optional(v.string()),
    recommendedDate: v.optional(v.string()),
    channelsPinged: v.number(),
    escalatedAt: v.number(),
  },
  handler: async (ctx, rec) => {
    const existing = await ctx.db
      .query('matterEscalations')
      .withIndex('by_client_matter', (q) => q.eq('client', rec.client).eq('matterId', rec.matterId))
      .unique();
    if (existing) return existing._id;
    return ctx.db.insert('matterEscalations', rec);
  },
});

/** Delete an escalation row — verify-script only, to keep the run repeatable. */
export const removeEscalation = mutation({
  args: { client: clientValidator, matterId: v.number() },
  handler: async (ctx, { client, matterId }) => {
    const existing = await ctx.db
      .query('matterEscalations')
      .withIndex('by_client_matter', (q) => q.eq('client', client).eq('matterId', matterId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return existing?._id ?? null;
  },
});
