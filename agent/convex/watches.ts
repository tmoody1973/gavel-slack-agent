import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

/** Register a watch for this channel. Idempotent per channel+entity. */
export const addWatch = mutation({
  args: { channelId: v.string(), entity: v.string(), client: v.optional(clientValidator) },
  handler: async (ctx, { channelId, entity, client }) => {
    const trimmed = entity.trim();
    if (!trimmed) {
      throw new Error('addWatch: entity is required');
    }
    const existing = await ctx.db
      .query('watches')
      .withIndex('by_channel_entity', (q) => q.eq('channelId', channelId).eq('entity', trimmed))
      .unique();
    if (existing) {
      return existing._id;
    }
    return ctx.db.insert('watches', {
      channelId,
      client: client ?? 'milwaukee',
      entity: trimmed,
      createdAt: Date.now(),
    });
  },
});

/** All watches for one channel (the `/gavel status` read + Phase 3 sweep input). */
export const listWatches = query({
  args: { channelId: v.string() },
  handler: (ctx, { channelId }) =>
    ctx.db
      .query('watches')
      .withIndex('by_channel', (q) => q.eq('channelId', channelId))
      .collect(),
});
