import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Channel subscription state — the spine's routing backbone. One row per Slack
// channel: which committees/keywords it watches, on which Legistar client, in
// which language. Deliberately minimal PII — no Slack user IDs, no message
// content (the ToS guardrail; community memory is queried live via RTS, never
// stored).
export default defineSchema({
  subscriptions: defineTable({
    channelId: v.string(),
    client: v.union(v.literal('milwaukee'), v.literal('milwaukeecounty')),
    committees: v.array(v.string()),
    keywords: v.array(v.string()),
    language: v.union(v.literal('en'), v.literal('es')),
    // Geo filter placeholder — present so the poller can read it later; actual
    // geo-matching is Phase 3 (out of scope here).
    boundary: v.optional(v.object({ type: v.literal('district'), value: v.string() })),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index('by_channel', ['channelId'])
    .index('by_client', ['client']),
});
