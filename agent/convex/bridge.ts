import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const client = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

/**
 * Every (channel, item) the community-memory bridge has already proposed — the dedup set
 * (MOO-125). Official ids only; the bridge never persists message content.
 */
export const listProposed = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('bridgeProposals').collect();
    return rows.map((row) => ({ channelId: row.channelId, eventItemId: row.eventItemId }));
  },
});

/**
 * Record a proposal so the same (channel, item) is never re-surfaced. Idempotent — ids +
 * timestamp only, never any Slack message content.
 */
export const recordProposal = mutation({
  args: { channelId: v.string(), client, eventItemId: v.number(), proposedAt: v.number() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query('bridgeProposals')
      .withIndex('by_channel_item', (q) => q.eq('channelId', args.channelId).eq('eventItemId', args.eventItemId))
      .first();
    if (existing) return existing._id;
    return await ctx.db.insert('bridgeProposals', args);
  },
});
