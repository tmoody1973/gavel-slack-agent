# Build Handoff — MOO-69: AgentMail civic-notification ingestion

_Clean-context handoff. Written 2026-06-16. **Goal:** build MOO-69 end-to-end in a fresh session.
The prerequisite is satisfied — **`mke-alerts@agentmail.to` is live and receiving City/County
E-Notify mail** (confirmed by Tarik). AgentMail SDK specifics below are Context7-verified
(`/agentmail-to/agentmail-node`, `/agentmail-to/agentmail-skills`)._

**Read first, in order:** this doc → `docs/agentmail-civic-ingestion.md` (the architecture) →
`CLAUDE.md` (per-issue loop + Linear sync) → the MOO-69 issue (the contract) → re-auth Linear →
`build MOO-69`.

---

## What & why (30 seconds)

A **second civic-data source** feeding the *existing* alert pipeline. The AgentMail inbox subscribes
to Milwaukee's **E-Notify firehose** — per-alder news, police bulletins, property sales, development
plans, transit/health alerts, agenda notices. Inbound emails → stored as **public-record
`civicNotifications`** in Convex (hybrid: indexed + full-text + optional vector) → PDF attachments
read natively by Claude → routed through the **existing subscriptions + summarizer + alert card** →
**deduped against Legistar** by fileNumber/address.

It is a **source adapter, not a new product.** Legistar (the poller) = *depth*; E-Notify = *breadth*.

**Compliance — the load-bearing check (already cleared in design):** E-Notify emails are official
government broadcasts = **public record**, so storing + indexing them IS the intended "index the
public record" path — *not* the Slack-ToS problem and *not* the mem0-style persistence the PRD
rejected. **Guardrail:** the inbox must stay a dedicated civic-alerts inbox — no private
correspondence; ingestion stores civic notifications only, never Slack content.

## What the human must provide (env / secrets)

Tarik set up the inbox, so these exist — get them before building:
- `AGENTMAIL_API_KEY` — the AgentMail API key.
- `AGENTMAIL_INBOX_ID` — the inbox id for `mke-alerts@agentmail.to` (e.g. `inbox_…`).
- `AGENTMAIL_WEBHOOK_SECRET` — **generated when you create the webhook** (`webhook.secret`, a
  `whsec_…` string); store it as a Convex env var for signature verification.

Add `agentmail` to `agent/package.json` deps (`npm i agentmail`).

---

## The contract (restate before building)

**Acceptance criteria (from MOO-69):**
1. Inbound listener ingests AgentMail `message.received` for the inbox, **idempotent on
   `message_id`** (webhook → Convex `httpAction` preferred; WebSocket worker the alternative).
2. `civicNotifications` Convex table — **hybrid store, no new infra**: indexed fields
   (`by_received`, `by_district`, `by_category`, `by_fileNumber`) + **full-text search index** on
   subject+body + **optional vector index** for "find similar". Stores raw email + derived fields.
3. **PDF attachments** fetched via `getAttachment` and read by **Claude as a document block** (native
   PDF, no `pdf-parse`), with a page/size cap. Summarizer (MOO-42) generalized to accept document
   attachments through the Claude boundary.
4. Notifications routed to channels via existing **subscriptions (MOO-45)** + summarized via the
   existing **summarizer (MOO-42)**, in the channel's language.
5. **Fusion/dedup vs Legistar:** key by extracted `fileNumber`/address so an item already alerted by
   the poller (MOO-41) is not double-alerted.

**Verification (prove against reality):**
- A real E-Notify email (incl. one with a PDF) ingested end-to-end — show the stored record,
  extracted fields, and the generated summary (paste the run log).
- Historical search proven **filter-first**: query by district + date range, by `fileNumber`; plus
  one semantic "find similar".
- Show an email overlapping a Legistar item is deduped (not double-alerted).
- Confirm only public civic mail is stored — the public-record guardrail.

**Out of scope:** replacing the Legistar poller (complementary); sending email (inbound only);
agenda-change/walk-on (MOO-51); embedding-model selection beyond a sane default.

---

## Recommended decisions for the design doc's open questions

1. **Ingestion transport → webhook → Convex `httpAction`.** Convex gives a durable public URL
   (`https://<deployment>.convex.site/agentmail`) co-located with the store — no extra infra, fits
   the serverless model better than a long-lived WebSocket. (WebSocket worker on gavel-poller is the
   fallback if webhook setup fights you.)
   - ⚠️ **Convex runtime gotcha:** `httpAction`s run in Convex's V8 runtime (Web APIs), **not**
     Node — verify the `X-AgentMail-Signature` HMAC with **Web Crypto** (`crypto.subtle`), not
     `node:crypto`. See the Web Crypto snippet below.
2. **Category/district derivation → heuristic first, Claude classifier as fallback.** Map
   sender/subject/AgentMail `labels` → `category` + `district` with simple rules; only call a small
   Claude tag (reuse the MOO-37 topic-tag approach) when the heuristic is ambiguous. Keep v1 cheap.
3. **Embedding → deferred / behind a flag.** Ship **filter-first + full-text** (covers the dominant
   temporal/categorical/entity-exact queries). Add the optional `embedding` vector field + index but
   only populate it behind `AGENTMAIL_EMBED=1` — the "find similar" path is the minority case.
4. **PDF → base64 document block, capped.** Only pull the PDF when the email body is thin (the
   summarizer's title→body→attachment fallback). Cap size/pages (civic notices are small; a full
   agenda packet would blow the budget). Files API only if you need reuse.
5. **Dedup → `fileNumber` exact for v1**, 14-day window; address-fuzzy is a documented enhancement.

---

## AgentMail integration — Context7-verified specifics

```ts
import { AgentMailClient } from "agentmail";
const client = new AgentMailClient({ apiKey: process.env.AGENTMAIL_API_KEY });

// One-time setup script: register the webhook, store the returned secret.
const webhook = await client.webhooks.create({
  url: "https://<deployment>.convex.site/agentmail",
  eventTypes: ["message.received"],
  inboxIds: [process.env.AGENTMAIL_INBOX_ID],
});
// → { id, url, eventTypes, secret: "whsec_..." }  ← store secret as Convex env AGENTMAIL_WEBHOOK_SECRET

// Fetch a full message / an attachment (for PDF parsing + backfill)
await client.inboxes.messages.get(inboxId, messageId);
await client.inboxes.messages.getAttachment(inboxId, messageId, attachmentId);
await client.inboxes.messages.list(inboxId /* … */); // historical backfill/replay
```

**Webhook payload (POST body):**
```json
{ "type": "event", "event_type": "message.received", "event_id": "evt_…",
  "message": {
    "inbox_id": "inbox_…", "thread_id": "thd_…", "message_id": "msg_…",
    "from": "City of Milwaukee <enotify@…>", "to": ["mke-alerts@agentmail.to"],
    "subject": "…", "text": "…", "html": "…", "extracted_text": "cleaned body",
    "labels": ["received"],
    "attachments": [{ "attachment_id": "att_…", "filename": "notice.pdf", "content_type": "application/pdf", "size": 12345 }],
    "created_at": "2026-…Z" }, "thread": {} }
```

**Signature verification.** Header `X-AgentMail-Signature`, HMAC-SHA256 of the **raw** body with the
webhook secret. Node example (Fly worker path):
```ts
import crypto from "crypto";
function verify(payload: Buffer, sig: string, secret: string) {
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  const a = Buffer.from(expected, "hex"), b = Buffer.from(sig, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```
**In a Convex `httpAction` use Web Crypto instead:**
```ts
const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret),
  { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
const mac = await crypto.subtle.sign("HMAC", key, rawBodyBytes);
const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, "0")).join("");
// constant-time compare expected vs the header
```
Return 200 fast; do the heavy work (PDF fetch, summarize, post) async — don't block the webhook ack.

---

## Build plan (phased, TDD — the acceptance criteria ARE the tests)

Reuse, don't fork. Map (current paths on `main`):
- **Summarizer:** `agent/summarizer/` — `source.js` (`buildSourceContext`, pure, stays text-based),
  `client.js` (the Claude `generate` boundary — append the PDF `document` block HERE), `bilingual.js`
  /`summarize.js`. Generalize naming "matter" → "civic item"; PDFs ride through `generate`, not the
  pure source builder (keeps the test seam — documents are the non-deterministic boundary, verified
  live, not unit-tested).
- **Subscriptions:** `agent/convex/subscriptions.ts` → `listSubscriptions`. E-Notify
  category/district maps onto `committees`/`keywords`/`boundary(district)`. Reuse the match logic in
  `agent/alerts/match.js` (`matchSubscriptions`) — generalize it to accept a civic-notification row
  shaped like `{ eventBodyName?/category, title/subject, district }`.
- **Alert card:** `agent/alerts/card.js` → `buildAlertCard({ row, matter, event, summary, footer,
  language, member })`. Feed it a notification-shaped `row` + the bilingual `summary`; reuse the
  "how to be heard" footer.
- **Dedup pattern mirror:** the poller's idempotency (`agent/convex/detectedItems.ts`,
  `enqueueDetected` by `(client, eventItemId)`; `watchAlerts`/`matterEscalations` ledgers this
  session) — copy the shape for `civicNotifications` keyed on `messageId`.

**Tasks:**
1. **`civicNotifications` Convex table + functions** (`agent/convex/schema.ts` +
   `agent/convex/civicNotifications.ts`). Fields per the design doc table. Indexes: `by_message`
   (dedup), `by_received`, `by_category`, `by_district`, `by_fileNumber`. **Full-text search index**
   (Convex `searchIndex('search_body', { searchField: 'bodyText', filterFields: ['district','category'] })`
   — verify exact syntax via Context7 `/get-convex/convex`). Optional `vectorIndex` like the existing
   `zoningChunks` (`agent/convex/schema.ts:94`). Mutations: `insertNotification` (idempotent on
   `messageId`), queries: `searchByDistrictDate`, `getByFileNumber`, `findSimilar` (vector, optional).
2. **Field extraction** (`agent/civicmail/extract.js`, pure + unit-tested): subject/body →
   `category`, `district`, `fileNumbers[]`, `addresses[]`. Reuse the address-from-title approach
   Claude already does for matters; `fileNumber` regex.
3. **Ingestion endpoint** — `agent/convex/http.ts` (NEW: `httpRouter()` + `httpAction` at
   `/agentmail`): verify signature (Web Crypto), parse, call `insertNotification`, enqueue async
   processing. Plus a one-time `agent/scripts/agentmail-setup.mjs` to register the webhook and print
   the secret.
4. **PDF → Claude document block** — in `agent/summarizer/client.js` `generate`, accept an optional
   `documents: [{ base64, mediaType: 'application/pdf' }]` and append an Anthropic `document` content
   block. Read the **claude-api skill** + Context7 `/anthropics/anthropic-sdk-typescript` for the
   exact document-block shape. Cap size/pages; only fetch the PDF when the body is thin.
5. **Route + summarize + post** (`agent/scripts/agentmail-process.mjs` or inside the httpAction's
   async tail): notification → `matchSubscriptions` → `summarize` (bilingual, with optional PDF) →
   `buildAlertCard` → post to channel in its language → mark processed.
6. **Fusion/dedup vs Legistar:** before posting, look up `detectedAgendaItems` /`watchAlerts` by the
   extracted `fileNumber`; if the poller already alerted that matter to the same channel within the
   window, suppress (or post a lighter "also via E-Notify" note). Add a small dedup query.
7. **Live verify script** `agent/scripts/agentmail-verify.mjs` — replay a real stored email (use
   `messages.list`/`get` to pull a genuine E-Notify message), run the full pipeline dry, paste the
   record + extracted fields + summary; run the three search shapes; demonstrate the Legistar dedup.

Commands (from `agent/`): tests `node --test` · lint `npx @biomejs/biome check .` · Convex
`npx convex dev --once` (deployment `vivid-weasel-903`).

---

## Verification plan (maps 1:1 to the issue)

1. **Real email e2e (incl. PDF):** `node scripts/agentmail-verify.mjs` against a genuine stored
   E-Notify message → paste stored record + extracted district/fileNumber/addresses + bilingual
   summary. (PDF: pick a message whose body is thin so the PDF path actually fires.)
2. **Filter-first search:** query `by_district` + date range, and `by_fileNumber`; then one vector
   "find similar". Paste results — show the relational filters return exact, fast.
3. **Dedup:** ingest an E-Notify zoning notice whose `fileNumber` matches a Legistar-detected item →
   show it is NOT double-alerted to the channel.
4. **Public-record guardrail:** confirm the table stores only civic mail (no Slack content); grep the
   module for any Slack-content persistence (there must be none).

---

## Per-issue loop + Linear sync (non-negotiable)

- Pickup → move MOO-69 **In Progress**; one **worktree** off `main`
  (`tarikjmoody/moo-69-agentmail-…`). Copy `agent/.env` + `.env.local` in; `npm i` (+ `npm i
  agentmail`); `npx convex codegen`; baseline `node --test`.
- TDD each task RED→GREEN, commit per task referencing **(MOO-69)**.
- Verify against **real** AgentMail data (not mocks) — the live gate caught real bugs in MOO-52/53;
  expect the same here (messy real emails, sparse fields).
- PR → move **In Review**, attach PR, post evidence comment (pasted run logs). Stay In Review until
  the verification checklist passes against reality.

## Risks / gotchas

- **Convex httpAction = Web Crypto, not node:crypto** (signature verify). Biggest footgun.
- **Webhook needs a public URL** — the Convex `.convex.site` URL is it; register once via the setup
  script and keep the secret in Convex env.
- **Return 200 fast**, process async — AgentMail retries on non-200/timeouts → duplicate deliveries;
  the `messageId` idempotency guard absorbs them.
- **Real E-Notify shape is unknown until you read one** — pull a few via `messages.list` first and
  let the actual sender/subject/labels drive the category/district heuristic (don't over-design it).
- **PDF token budget** — cap pages/size; civic notices are small but a full agenda packet isn't.
- **Don't double-alert** — the Legistar poller and E-Notify will overlap heavily on zoning; the
  fileNumber dedup is load-bearing for trust.

---

_Prereqs all done: MOO-42 summarizer ✅, MOO-45 subscriptions ✅, MOO-44 alert card ✅ (blocker
cleared). P3 — this is a stretch/post-spine feature; **finish the submission (MOO-62/63) first if the
July 13 deadline is tight.** Design doc: `docs/agentmail-civic-ingestion.md`. Deadline: July 13, 2026._
