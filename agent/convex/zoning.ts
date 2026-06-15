import { v } from 'convex/values';

import { internal } from './_generated/api';
import { action, internalQuery, mutation, query } from './_generated/server';

const chunkFields = {
  section: v.string(),
  text: v.string(),
  embedding: v.array(v.float64()),
  family: v.string(),
  scope: v.string(),
  parent: v.string(),
  sourceUrl: v.string(),
};

/** Idempotent ingest: replace any existing chunk with the same section. */
export const upsertChunk = mutation({
  args: chunkFields,
  handler: async (ctx, chunk) => {
    const existing = await ctx.db
      .query('zoningChunks')
      .withIndex('by_section', (q) => q.eq('section', chunk.section))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, chunk);
      return existing._id;
    }
    return ctx.db.insert('zoningChunks', chunk);
  },
});

/** Count rows — the ingest script's sanity check. */
export const count = query({
  args: {},
  handler: async (ctx) => (await ctx.db.query('zoningChunks').collect()).length,
});

/** Load chunk docs by id (vector search returns ids only, from an action). */
export const fetchChunks = internalQuery({
  args: { ids: v.array(v.id('zoningChunks')) },
  handler: async (ctx, { ids }) => {
    const docs = await Promise.all(ids.map((id) => ctx.db.get(id)));
    return docs
      .filter((d) => d !== null)
      .map((d) => ({ section: d.section, text: d.text, parent: d.parent, sourceUrl: d.sourceUrl }));
  },
});

/**
 * Parcel-conditioned vector search: top-k chunks where family = the parcel's
 * family OR family = "general". Both the citywide subchapters (1-4) AND the
 * dimensional/use table carry family "general", so this single-field OR pulls
 * district-specific sections + general provisions + the table in one filter
 * (overlay zones are excluded by design — they apply by location, not base
 * zoning). Runs in an action (the only place ctx.vectorSearch is available),
 * then hydrates docs.
 */
export const search = action({
  args: { embedding: v.array(v.float64()), family: v.string(), limit: v.optional(v.number()) },
  handler: async (ctx, { embedding, family, limit }) => {
    const results = await ctx.vectorSearch('zoningChunks', 'by_embedding', {
      vector: embedding,
      limit: limit ?? 8,
      filter: (q) => q.or(q.eq('family', family), q.eq('family', 'general')),
    });
    const ids = results.map((r) => r._id);
    return ctx.runQuery(internal.zoning.fetchChunks, { ids });
  },
});
