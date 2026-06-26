// agent/convex/newsCache.ts
// Read-through cache for civic news. Keyed by file number (alert path) or normalized query
// (search path). 24h TTL — a stale row reads as a miss so the caller refetches.
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const TTL_MS = 24 * 60 * 60 * 1000;

const articleValidator = v.object({
  title: v.string(),
  url: v.string(),
  source: v.optional(v.string()),
  publishedAt: v.optional(v.string()),
});

export const getCached = query({
  args: { key: v.string() },
  handler: async (ctx, { key }) => {
    const row = await ctx.db
      .query('newsCache')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (!row) return null;
    if (row.expiresAt < Date.now()) return null;
    return row.articles;
  },
});

export const upsertCache = mutation({
  args: { key: v.string(), articles: v.array(articleValidator) },
  handler: async (ctx, { key, articles }) => {
    const now = Date.now();
    const patch = { key, articles, fetchedAt: now, expiresAt: now + TTL_MS };
    const existing = await ctx.db
      .query('newsCache')
      .withIndex('by_key', (q) => q.eq('key', key))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      return existing._id;
    }
    return ctx.db.insert('newsCache', patch);
  },
});
