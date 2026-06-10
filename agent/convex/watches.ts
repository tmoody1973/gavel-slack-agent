import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

/** Every watch across all channels — the App Home's watches section. */
export const listAllWatches = query({
  args: {},
  handler: (ctx) => ctx.db.query('watches').collect(),
});

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

/** Remove one watch by channel + entity. Returns the deleted id, or null. */
export const removeWatch = mutation({
  args: { channelId: v.string(), entity: v.string() },
  handler: async (ctx, { channelId, entity }) => {
    const trimmed = entity.trim();
    const existing = await ctx.db
      .query('watches')
      .withIndex('by_channel_entity', (q) => q.eq('channelId', channelId).eq('entity', trimmed))
      .unique();
    if (!existing) return null;
    await ctx.db.delete(existing._id);
    return existing._id;
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
