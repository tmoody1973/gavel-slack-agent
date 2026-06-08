# AgentMail civic-notification ingestion — design

_Status: **design captured, tracked, parked behind the spine** (build MOO-41 → MOO-44 first). Tracked as a Linear issue in the Gavel project. This doc is the architecture; the issue is the contract._

## Why this exists

`mke-alerts@agentmail.to` (an [AgentMail](https://agentmail.to) inbox) is subscribed to the City of Milwaukee / Milwaukee County **E-Notify** firehose — per-alder news releases, police/crime bulletins by district, property-sale listings, development plans, transit/health/service alerts, plus committee + agenda notices. This is a **second, broader notification source** that complements the Legistar poller:

```
Legistar poller (MOO-41)  ─┐   structured, authoritative, legislative depth
                           ├─→ extract entities → match subscriptions (MOO-45)
AgentMail inbound emails  ─┘   broad civic breadth, push-based, near-zero scraping
        → summarize (MOO-42) → alert card (MOO-44), in the channel's language
```

AgentMail is a **new source adapter into the existing pipeline**, not a new product. Legistar is the *depth* anchor (hearing date, alderperson, "how to be heard"); E-Notify is the *breadth* multiplier (the long tail Legistar's API doesn't expose as alert-ready).

## Compliance (the load-bearing check)

Gavel's central rule: **index the public record, query the private record live** (Slack messages → RTS only, never stored). E-Notify emails are **official government broadcasts → public record**, so storing and indexing them is the *intended* "index the public record" path — **not** a Slack-ToS issue, and **not** the mem0-style private-memory persistence the PRD rejected.

**Guardrail:** keep `mke-alerts@agentmail.to` a dedicated civic-alerts inbox. The "everything stored here is public record" guarantee depends on no private correspondence landing in it. Ingestion stores civic notifications only — never Slack content.

## Ingestion

AgentMail delivers inbound two ways (docs verified via Context7):
- **WebSocket** `message.received` — recommended by AgentMail, no public URL needed.
- **Webhook** — needs a public endpoint (Fly.io worker or a Convex HTTP action). Payload: `type`, `event_type`, `event_id`, `message`.

Message object fields: `message_id`, `thread_id`, `from`, `to`, `subject`, `text`, `html`, **`extracted_text`** (cleaned body), `attachments` (metadata), `labels`, timestamps. `inboxes.messages.list/get` allows backfill/replay of history.

- **Idempotency:** key on `message_id` (same discipline as the poller's `EventItemId`).
- **Open decision:** WebSocket (simple, but a long-lived connection sits awkwardly in a serverless/cron model) vs. webhook → Convex `httpAction` (fits Convex's model, gives durable ingestion). Lean **webhook → Convex httpAction** so ingestion is durable and co-located with the store.

## Storage — hybrid in Convex (no new infra)

**Decision: structured-first in Convex, full-text search, embeddings as a secondary modality. No separate vector DB.** (Consistent with the PRD's "zero new infra beyond Convex.")

Rationale — the dominant civic search shapes are **temporal + categorical + entity-exact**, where relational filters beat vectors; vector search only wins the fuzzy "find similar" minority:

| Query | Best retrieval |
|---|---|
| "everything about 234 S Water St" | exact entity filter |
| "what did the 12th district send last month" | category + date range |
| "all rezoning notices this quarter" | keyword/category + time |
| "notices *similar to* this displacement pattern" | semantic (vector) |

These emails are **short, metadata-rich, time-series records** — a different shape from the PRD's `zoning_code` / `transcripts` vector namespaces (long docs chunked for RAG Q&A). Treat them as **records, not RAG passages.** Store the raw email + derived fields so we can re-extract if the classifier improves.

**`civicNotifications` table (proposed):**
| field | purpose |
|---|---|
| `messageId` | AgentMail id — dedup key, index `by_message` |
| `receivedAt` | timestamp — index `by_received` (date-range queries) |
| `source` / `category` | derived from sender + subject + AgentMail `labels` — index `by_category` |
| `subject`, `bodyText` | from `subject` + `extracted_text`; **full-text search index** on both |
| `district`, `committee` | extracted — index `by_district` (maps to subscription `boundary`/`committees`) |
| `fileNumbers[]`, `addresses[]` | extracted — index `by_fileNumber` (Legistar fusion key) |
| `attachments[]` | `{ filename, contentType, attachmentId, extractedSummary? }` |
| `embedding` (optional) | **vector index** for "find similar" — secondary |
| `rawRef` | pointer/copy of the raw email for provenance + reprocessing |

Convex provides indexed queries **+ full-text search indexes + vector indexes in one table** → hybrid retrieval, single store. (Confirm exact `searchIndex` / `vectorIndex` syntax via Context7 at build time.)

## PDF attachment parsing

Most civic notices carry PDFs (staff reports, hearing notices, site plans). Flow:
1. On `message.received`, for each attachment with `contentType: application/pdf`, fetch bytes via `client.inboxes.messages.getAttachment(inboxId, messageId, attachmentId)`.
2. **Read the PDF with Claude as a document block** (Anthropic Messages API `document` content block, base64 PDF source — or the Files API for reuse). **Sonnet 4.6 reads PDFs natively**, including scanned/complex layouts — no `pdf-parse`/`pdfjs` dependency, more robust than text extraction.
3. **Generalize the summarizer** (MOO-42) to accept optional document attachments: the pure `buildSourceContext` stays text-based; the PDF rides through the Claude boundary in `generate` as an appended `document` block alongside the text prompt. Keeps the test seam intact (documents are part of the non-deterministic boundary, verified live, not unit-tested).
4. **Guards:** cap pages/size (civic notices are small; a full agenda packet could blow the token budget). The summarizer's fallback chain (title → body → attachment) means the PDF is only pulled when the email body is thin — so most emails never incur PDF cost.

## Reuse, don't fork

- **Subscriptions (MOO-45):** E-Notify categories map directly onto `committees` / `keywords` / `boundary(district)`. A channel subscribed to district 12 + housing gets matching mail. No new routing model.
- **Summarizer (MOO-42):** `subject → title`, `extracted_text → matterText`, PDFs → document blocks. Generalize the name from "matter" to "civic item."
- **Alert card (MOO-44):** same Block Kit card + "how to be heard" footer.

## Fusion / dedup vs Legistar

An E-Notify zoning notice is often the *same matter* the poller also finds. Key notifications by extracted **fileNumber / address** and dedup against Legistar-detected items so a channel isn't double-alerted across the two heartbeats. The structured store makes this a simple index lookup; a vector-only store could not.

## Open decisions to settle at build time
1. Ingestion transport: webhook → Convex `httpAction` (leaning) vs. WebSocket worker on Fly.io.
2. Category derivation: how reliably can sender/subject/`labels` map an email to its E-Notify category? May need a small Claude classifier (reusing the topic-tag approach from MOO-37).
3. Embedding model + when to embed (every notification vs. on demand).
4. PDF page/size cap and Files-API-vs-base64 for document input.
5. Dedup window + match precision (fileNumber exact vs. address fuzzy).

## Out of scope
- **Not** a replacement for the Legistar poller (complementary).
- Inbound only — no sending email.
- Agenda-change / walk-on detector (Phase 3, MOO-51).

---
*Prereqs: MOO-42 (summarizer) ✅, MOO-45 (subscriptions) ✅. Build after the spine posts its first Legistar-sourced card (MOO-41 → MOO-44).*
