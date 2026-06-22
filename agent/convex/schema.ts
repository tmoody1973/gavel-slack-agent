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
    // Front Door onboarding state (MOO-118 FD-B). All optional so existing rows
    // (poller-written, pre-onboarding) stay valid; absence = "not yet onboarded".
    configured: v.optional(v.boolean()),
    role: v.optional(v.union(v.literal('association'), v.literal('organizer'), v.literal('reporter'))),
    onboardedAt: v.optional(v.number()),
    welcomePostedAt: v.optional(v.number()), // reserved for FD-C member-welcome dedup
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

  // Council-member directory (MOO-72): public city.milwaukee.gov contact data
  // (headshot, phone, email, webpage) keyed by district + normalized last name,
  // joined to Legistar sponsor names at alert time. Public officials only.
  councilMembers: defineTable({
    client: v.union(v.literal('milwaukee'), v.literal('milwaukeecounty')),
    district: v.number(),
    name: v.string(),
    nameKey: v.string(),
    title: v.string(),
    imageUrl: v.string(),
    email: v.string(),
    phone: v.string(),
    webpage: v.string(),
    updatedAt: v.number(),
  })
    .index('by_client_district', ['client', 'district'])
    .index('by_client_name_key', ['client', 'nameKey']),

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
    // MOO-51 insider-knowledge flags, set at detection time: <48h notice and
    // consent-calendar placement. Present only when true.
    walkOnFlag: v.optional(v.boolean()),
    consentFlag: v.optional(v.boolean()),
    detectedAt: v.number(),
    alertStatus: v.union(v.literal('pending'), v.literal('sent')),
  })
    .index('by_client_item', ['client', 'eventItemId'])
    .index('by_client_status', ['client', 'alertStatus']),

  // Zoning-code semantic layer (MOO-55). One row per Ch.295 code section (or an
  // intact district/use table). PUBLIC RECORD ONLY — the city's published zoning
  // code; no Slack content. `family` groups zoning classes the way the code's own
  // subchapters do (residential/commercial/...); `scope` separates district-
  // specific sections from general/definitions that apply everywhere.
  // Civic-notification ingestion (MOO-69). One row per inbound Milwaukee E-Notify
  // email (mke-alerts@agentmail.to) — official government broadcasts = PUBLIC
  // RECORD, so storing + indexing them is the intended "index the public record"
  // path (never Slack content — the ToS guardrail still holds). Hybrid store:
  // relational indexes for the dominant temporal/categorical/entity-exact queries,
  // a full-text search index over subject+body, and an optional vector index for
  // "find similar" (populated only behind AGENTMAIL_EMBED). Fields are derived by
  // the deterministic E-Notify template parser (civicmail/extract.js).
  civicNotifications: defineTable({
    messageId: v.string(), // RFC822 Message-ID — the dedup key
    receivedAt: v.string(), // ISO timestamp (sortable for date-range queries)
    from: v.string(),
    subject: v.string(),
    bodyText: v.string(), // HTML-stripped body (agentmail has no extracted_text)
    searchText: v.string(), // subject + bodyText, the full-text search field
    category: v.string(), // curated bucket: meetings | neighborhood_services | licenses | newsletter | other
    categoryRaw: v.optional(v.string()),
    subType: v.optional(v.string()),
    district: v.optional(v.string()), // aldermanic (licenses); maps to subscription boundary
    bid: v.optional(v.string()), // Business Improvement District (Neighborhood Services)
    addresses: v.array(v.string()),
    taxkeys: v.array(v.string()),
    taxkey: v.optional(v.string()), // taxkeys[0], scalar for the by_taxkey parcel lookup
    recordNumber: v.optional(v.string()), // Accela record (#COM-ALT-26-..., #ENF-...)
    legistarMeetingId: v.optional(v.string()), // the Legistar fusion/dedup key (meetings)
    business: v.optional(v.string()),
    detailUrl: v.optional(v.string()),
    description: v.optional(v.string()),
    attachments: v.array(
      v.object({
        filename: v.string(),
        contentType: v.string(),
        attachmentId: v.string(),
        size: v.optional(v.number()),
      }),
    ),
    // Cached bilingual summary, written once after processing (re-render is free).
    summary: v.optional(
      v.object({
        en: v.object({ summary: v.string(), whyItMatters: v.string() }),
        es: v.object({ summary: v.string(), whyItMatters: v.string() }),
      }),
    ),
    embedding: v.optional(v.array(v.float64())), // 1536-dim, only behind AGENTMAIL_EMBED
    alertStatus: v.union(v.literal('pending'), v.literal('processed')),
    detectedAt: v.number(),
    // When this row was rolled into a "From the city" digest. Orthogonal to
    // alertStatus (the interrupt/alert path) — a row can be alert-pending yet already
    // digested. Unset = not yet digested; the twice-weekly cron sets it for idempotency.
    digestedAt: v.optional(v.number()),
  })
    .index('by_message', ['messageId'])
    .index('by_received', ['receivedAt'])
    .index('by_category', ['category'])
    .index('by_district', ['district'])
    .index('by_taxkey', ['taxkey'])
    .index('by_record', ['recordNumber'])
    .index('by_legistar_meeting', ['legistarMeetingId'])
    .index('by_status', ['alertStatus'])
    .searchIndex('search_text', {
      searchField: 'searchText',
      filterFields: ['district', 'category'],
    })
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['category', 'district'],
    }),

  zoningChunks: defineTable({
    section: v.string(), // "295-505" or "295-Table"
    text: v.string(),
    embedding: v.array(v.float64()), // text-embedding-3-small → 1536
    family: v.string(), // "residential" | "commercial" | "downtown" | "industrial" | "special" | "overlay" | "general"
    scope: v.string(), // "district" | "general"
    parent: v.string(), // "Subchapter 5 — Residential Districts"
    sourceUrl: v.string(),
  })
    .index('by_section', ['section'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['family', 'scope'],
    }),

  // Meeting-transcript semantic layer (MOO-113). One row per 30-60s speaker-turn
  // window of a committee webcast, sliced to its agenda item by EventItemVideoIndex.
  // PUBLIC RECORD ONLY — the city's public Granicus webcast; never Slack content.
  // Every chunk carries the metadata a "receipt" needs: speaker, agenda item,
  // matter, and the timestamp that builds a deep link back into the video.
  transcriptChunks: defineTable({
    eventId: v.number(),
    eventDate: v.string(),
    eventBodyName: v.optional(v.string()), // committee, for filtering
    eventMedia: v.optional(v.number()), // Granicus clip id → deep link / clip
    eventItemId: v.number(),
    agendaNumber: v.optional(v.string()),
    matterId: v.optional(v.number()),
    text: v.string(),
    speakers: v.array(v.number()), // Deepgram speaker labels in the window
    startTime: v.number(), // seconds into the webcast
    endTime: v.number(),
    embedding: v.array(v.float64()), // text-embedding-3-small → 1536
  })
    .index('by_event', ['eventId'])
    .index('by_event_item', ['eventId', 'eventItemId'])
    .vectorIndex('by_embedding', {
      vectorField: 'embedding',
      dimensions: 1536,
      filterFields: ['eventId', 'eventBodyName'],
    }),

  // Minutes / vote-record layer (MOO-113 task D): the structured "what was DECIDED"
  // companion to transcriptChunks' "what was SAID". One row per acted-on agenda item,
  // from Legistar's post-meeting fields + the official minutes PDF. PUBLIC RECORD ONLY.
  // Milwaukee committee votes are voice votes — seconder/tally are usually absent, so
  // the outcome is actionName + passedFlag + mover. Keyed for the matter/event join.
  matterOutcomes: defineTable({
    eventItemId: v.number(),
    eventId: v.number(),
    matterId: v.optional(v.number()),
    matterFile: v.optional(v.string()), // Legistar file number, e.g. "260176"
    agendaNumber: v.optional(v.string()),
    actionName: v.string(), // "RECOMMENDED FOR ADOPTION"
    actionText: v.optional(v.string()), // the full motion sentence
    passedFlag: v.optional(v.string()), // "Pass" | "Fail"
    mover: v.optional(v.string()),
    seconder: v.optional(v.string()),
    tally: v.optional(v.string()), // roll-call count when present (voice votes: absent)
    eventDate: v.optional(v.string()),
    minutesFile: v.optional(v.string()), // the meeting's official minutes PDF
    recordedAt: v.number(),
  })
    .index('by_event', ['eventId'])
    .index('by_event_item', ['eventId', 'eventItemId'])
    .index('by_matter', ['matterId']),

  // Community-memory bridge dedup ledger (MOO-125). One row per proposal already made
  // ("you've been discussing X — it's on the agenda this week"), so the bridge never
  // re-surfaces the same (channel, item) pair. OFFICIAL IDS + TIMESTAMP ONLY — never any
  // Slack message content (the RTS guardrail: community memory is queried live, never
  // stored). The live match that produced the proposal is computed each sweep and discarded.
  bridgeProposals: defineTable({
    channelId: v.string(),
    client: v.union(v.literal('milwaukee'), v.literal('milwaukeecounty')),
    eventItemId: v.number(),
    proposedAt: v.number(),
  }).index('by_channel_item', ['channelId', 'eventItemId']),

  // Speaker naming map (MOO-143). One row per meeting: the gated mapping from Deepgram's
  // anonymous diarization labels (Speaker 0,1,2…) to the council member who spoke, so
  // transcript receipts read "Alderman Stamper said…" instead of "Speaker 2." PUBLIC-RECORD
  // OFFICIALS ONLY — names come from the councilMembers directory; never any Slack content.
  // `name` is null for anyone not confidently a named official (degrades to the role label).
  speakerMaps: defineTable({
    eventId: v.number(),
    eventBodyName: v.optional(v.string()),
    entries: v.array(
      v.object({
        speaker: v.number(),
        name: v.union(v.string(), v.null()),
        title: v.union(v.string(), v.null()),
        role: v.string(), // member | chair | staff | applicant | public | unknown
        confidence: v.number(),
      }),
    ),
    updatedAt: v.number(),
  }).index('by_event', ['eventId']),
});
