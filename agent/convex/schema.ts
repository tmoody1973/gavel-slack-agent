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

  // Per-channel watch terms (MOO-46): an entity (file number, address, LLC,
  // person) the channel wants flagged whenever it appears in the official
  // record. Config only — intentional user input, never message content.
  watches: defineTable({
    channelId: v.string(),
    client: v.union(v.literal('milwaukee'), v.literal('milwaukeecounty')),
    entity: v.string(),
    createdAt: v.number(),
  })
    .index('by_channel', ['channelId'])
    .index('by_channel_entity', ['channelId', 'entity']),

  // Detection ledger AND alert queue in one (MOO-41). One row per genuinely-new
  // Final agenda item: its presence guarantees idempotency (never re-detected),
  // its alertStatus drives MOO-44's summarize+post. Civic-record keys only —
  // never any Slack message content (the ToS guardrail).
  detectedAgendaItems: defineTable({
    client: v.union(v.literal('milwaukee'), v.literal('milwaukeecounty')),
    eventItemId: v.number(),
    eventId: v.number(),
    matterId: v.optional(v.number()),
    title: v.string(),
    agendaNumber: v.optional(v.string()),
    eventBodyName: v.string(),
    eventDate: v.optional(v.string()),
    agendaPublishedUTC: v.optional(v.string()),
    detectedAt: v.number(),
    alertStatus: v.union(v.literal('pending'), v.literal('sent')),
  })
    .index('by_client_item', ['client', 'eventItemId'])
    .index('by_client_status', ['client', 'alertStatus']),
});
