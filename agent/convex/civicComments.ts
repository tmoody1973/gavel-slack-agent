import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

/** Record a filed civic comment (MOO-171) — audit trail + input to the daily cap. */
export const logComment = mutation({
  args: {
    fileNumber: v.string(),
    userId: v.string(),
    recipient: v.string(),
    demoMode: v.boolean(),
    createdAt: v.number(),
  },
  handler: (ctx, row) => ctx.db.insert('civicComments', row),
});

/** Prior submission timestamps for one user + file — feeds exceedsDailyCap. */
export const recentByUserFile = query({
  args: { userId: v.string(), fileNumber: v.string() },
  handler: async (ctx, { userId, fileNumber }) => {
    const rows = await ctx.db
      .query('civicComments')
      .withIndex('by_user_file', (q) => q.eq('userId', userId).eq('fileNumber', fileNumber))
      .collect();
    return rows.map((row) => row.createdAt);
  },
});
