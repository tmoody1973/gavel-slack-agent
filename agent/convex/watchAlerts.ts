import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

const kindValidator = v.union(v.literal('matter'), v.literal('permit'));

const alertKey = v.object({
  channelId: v.string(),
  entity: v.string(),
  kind: kindValidator,
  refId: v.string(),
});

// The insert payload — the 4-field key plus the caller-stamped alert time. The
// sweep stamps alertedAt via an injected clock (so the orchestration is unit-
// testable); Convex stores that value rather than re-stamping its own.
const alertRecord = v.object({
  channelId: v.string(),
  entity: v.string(),
  kind: kindValidator,
  refId: v.string(),
  alertedAt: v.number(),
});

/** Every (channel, entity, kind, refId) already alerted — the sweep's dedup input. */
export const listAlertedKeys = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query('watchAlerts').collect();
    return rows.map((r) => ({ channelId: r.channelId, entity: r.entity, kind: r.kind, refId: r.refId }));
  },
});

/**
 * Record fired alerts. DB-level idempotency guard: skips any tuple already
 * present (so a crash mid-sweep, or an overlapping run, never double-records).
 * Returns the count inserted.
 */
export const recordAlerts = mutation({
  args: { alerts: v.array(alertRecord) },
  handler: async (ctx, { alerts }) => {
    let inserted = 0;
    for (const a of alerts) {
      const existing = await ctx.db
        .query('watchAlerts')
        .withIndex('by_dedup', (q) =>
          q.eq('channelId', a.channelId).eq('entity', a.entity).eq('kind', a.kind).eq('refId', a.refId),
        )
        .unique();
      if (existing) continue;
      await ctx.db.insert('watchAlerts', a);
      inserted += 1;
    }
    return inserted;
  },
});

/**
 * Delete a ledger row by tuple — verify-script only, to keep the acceptance run
 * repeatable (re-fire the same match on a second run). Returns the deleted id or null.
 */
export const removeAlert = mutation({
  args: alertKey,
  handler: async (ctx, a) => {
    const existing = await ctx.db
      .query('watchAlerts')
      .withIndex('by_dedup', (q) =>
        q.eq('channelId', a.channelId).eq('entity', a.entity).eq('kind', a.kind).eq('refId', a.refId),
      )
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return existing?._id ?? null;
  },
});
