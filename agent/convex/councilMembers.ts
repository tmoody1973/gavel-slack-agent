import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const clientValidator = v.union(v.literal('milwaukee'), v.literal('milwaukeecounty'));

/** Upsert one council member. Idempotent per client+district (the seed key). */
export const upsertMember = mutation({
  args: {
    client: v.optional(clientValidator),
    district: v.number(),
    name: v.string(),
    nameKey: v.string(),
    title: v.string(),
    imageUrl: v.string(),
    email: v.string(),
    phone: v.string(),
    webpage: v.string(),
  },
  handler: async (ctx, args) => {
    const client = args.client ?? 'milwaukee';
    const row = { ...args, client, updatedAt: Date.now() };
    const existing = await ctx.db
      .query('councilMembers')
      .withIndex('by_client_district', (q) => q.eq('client', client).eq('district', args.district))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, row);
      return existing._id;
    }
    return ctx.db.insert('councilMembers', row);
  },
});

/** Full directory for one client — the alert drain's per-run read. */
export const listMembers = query({
  args: { client: v.optional(clientValidator) },
  handler: (ctx, { client }) =>
    ctx.db
      .query('councilMembers')
      .withIndex('by_client_district', (q) => q.eq('client', client ?? 'milwaukee'))
      .collect(),
});

/** One member by district (Phase 3 address→district geo lookups). */
export const getByDistrict = query({
  args: { client: v.optional(clientValidator), district: v.number() },
  handler: (ctx, { client, district }) =>
    ctx.db
      .query('councilMembers')
      .withIndex('by_client_district', (q) => q.eq('client', client ?? 'milwaukee').eq('district', district))
      .unique(),
});

/** One member by normalized last-name key (see alerts/council.js lastNameKey). */
export const getByName = query({
  args: { client: v.optional(clientValidator), nameKey: v.string() },
  handler: (ctx, { client, nameKey }) =>
    ctx.db
      .query('councilMembers')
      .withIndex('by_client_name_key', (q) => q.eq('client', client ?? 'milwaukee').eq('nameKey', nameKey))
      .unique(),
});
