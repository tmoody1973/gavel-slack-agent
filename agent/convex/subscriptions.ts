import { v } from 'convex/values';

import { normalizeSubscription } from '../subscriptions/normalize.js';
import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));
const languageValidator = v.union(v.literal('en'), v.literal('es'));
const boundaryValidator = v.object({ type: v.literal('district'), value: v.string() });

/**
 * Create or update a channel's subscription. Input is run through
 * normalizeSubscription, which enforces the minimal-PII whitelist, defaults,
 * and dedup before anything touches the database.
 */
export const upsertSubscription = mutation({
  args: {
    channelId: v.string(),
    client: v.optional(clientValidator),
    committees: v.optional(v.array(v.string())),
    keywords: v.optional(v.array(v.string())),
    language: v.optional(languageValidator),
    boundary: v.optional(boundaryValidator),
    // Front Door onboarding fields (MOO-118) — normalizeSubscription passes them
    // through, so the spread-persist below carries them into the row unchanged.
    role: v.optional(v.union(v.literal('association'), v.literal('organizer'), v.literal('reporter'))),
    configured: v.optional(v.boolean()),
    onboardedAt: v.optional(v.number()),
    welcomePostedAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const sub = normalizeSubscription(args);
    const now = Date.now();
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_channel', (q) => q.eq('channelId', sub.channelId))
      .unique();

    if (existing) {
      await ctx.db.patch(existing._id, { ...sub, updatedAt: now });
      return existing._id;
    }
    return ctx.db.insert('subscriptions', { ...sub, createdAt: now, updatedAt: now });
  },
});

/** Read one channel's subscription (the poller's target + language lookup). */
export const getSubscription = query({
  args: { channelId: v.string() },
  handler: (ctx, { channelId }) =>
    ctx.db
      .query('subscriptions')
      .withIndex('by_channel', (q) => q.eq('channelId', channelId))
      .unique(),
});

/** List subscriptions, optionally scoped to one Legistar client (poller fan-out). */
export const listSubscriptions = query({
  args: { client: v.optional(clientValidator) },
  handler: (ctx, { client }) =>
    client
      ? ctx.db
          .query('subscriptions')
          .withIndex('by_client', (q) => q.eq('client', client))
          .collect()
      : ctx.db.query('subscriptions').collect(),
});

/** Switch a channel between English and Spanish alerts. */
export const setLanguage = mutation({
  args: { channelId: v.string(), language: languageValidator },
  handler: async (ctx, { channelId, language }) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_channel', (q) => q.eq('channelId', channelId))
      .unique();
    if (!existing) {
      throw new Error(`setLanguage: no subscription for channel ${channelId}`);
    }
    await ctx.db.patch(existing._id, { language, updatedAt: Date.now() });
    return existing._id;
  },
});

/** Remove a channel's subscription. Returns the deleted id, or null if none. */
export const removeSubscription = mutation({
  args: { channelId: v.string() },
  handler: async (ctx, { channelId }) => {
    const existing = await ctx.db
      .query('subscriptions')
      .withIndex('by_channel', (q) => q.eq('channelId', channelId))
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
    }
    return existing?._id ?? null;
  },
});
