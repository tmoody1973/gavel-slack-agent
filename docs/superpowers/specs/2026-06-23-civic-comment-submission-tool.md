# Spec — Civic Comment Submission ("Make my voice heard") tool

_Date: 2026-06-23 · Status: Draft for review · For: the data-center demo (DEMO-SCRIPT v2, Beat 7) and a
shippable closes-the-loop capability. Build via superpowers TDD; ready to become a MOO issue._

## Intent

Gavel's whole promise is the **"How to be heard"** footer — it tells residents when and how to comment.
This tool makes that promise **literal**: from an alert or record, a resident can have Gavel **draft a
public comment in their own words and their own language, review it, and file it with the city before the
hearing.** It closes the civic loop: alert → understand → **act**. This is the strongest Agent-for-Good
beat available and the emotional climax of the demo.

It reuses infra already in the stack: **AgentMail** (send), **Claude** (draft, bilingual), **Block Kit**
(review/edit modal), and the **matter context** Gavel already has. No new external dependency.

## The flow

1. A **"✍️ Make my voice heard"** action appears on an alert card and the civic-record modal (alongside
   the existing Watch / How-to-be-heard).
2. It opens a Block Kit **modal** pre-filled with: the **file number + item title** (read-only), a
   **position** selector (Support / Oppose / Neutral / Just a question), a **Gavel-drafted comment body**
   (editable, generated in the thread/channel language, grounded in the real item — not invented), and a
   **name** field (required) + optional address (many records request it).
3. The resident edits freely, then must **explicitly confirm** ("Send to the city").
4. On confirm, Gavel sends the comment via **AgentMail** to the **resolved recipient** for that item, and
   posts a confirmation + a copy of what was sent back to the resident (ephemeral or DM).

## Acceptance criteria

- [ ] A **"✍️ Make my voice heard"** button is present on the alert card and the record modal, carrying the file number.
- [ ] Clicking it opens a modal pre-filled with: file number + title (read-only), position selector, an **editable** Gavel-drafted comment, and a required **name** field.
- [ ] The drafted comment is **grounded in the real item** (file number, title, what's being decided) — never fabricated claims — and is generated in the **thread/channel language**; civic identifiers (file #, address, committee) stay English even in the Spanish draft.
- [ ] Nothing sends without an **explicit confirm**; there is **no auto-send path**.
- [ ] On confirm, the comment is sent via AgentMail to the **resolved recipient**, and the resident gets a confirmation + the exact text that was sent.
- [ ] **Demo/safe mode** (env-gated, e.g. `CIVIC_COMMENT_TEST_INBOX`): when set, **all** sends go to that test inbox regardless of resolved recipient, and the confirmation discloses it. Default for the demo recording.
- [ ] Recipient resolution: per-item/per-body lookup (see below); if no recipient can be resolved and not in demo mode, the tool **does not send** and tells the user where to file manually (degrade safe, never guess an address).
- [ ] A user cannot spam: at most one submission per user per file number per day (logged in Convex); a second attempt says "you already submitted on this item."

## Hard guardrails (non-negotiable — this writes to a government body in a person's name)

- **Human-in-the-loop always.** No comment is ever sent without the resident reading the final text and explicitly confirming. No "auto-advocate," no batch send.
- **Never fabricate a constituent.** The name is required and supplied by the real user; Gavel never invents a sender, signs on someone's behalf, or sends anonymously to a real official.
- **Demo never touches a real clerk.** During recording, `CIVIC_COMMENT_TEST_INBOX` forces every send to a test address, and the on-screen confirmation says so. Submitting AI-drafted testimony to a real government inbox for a demo is out of bounds.
- **Honest drafting.** The draft states the resident's *position* and *questions*; it does not assert facts Gavel can't source. Claude is instructed to write a personal comment, not a fake-evidence brief.
- **Logged + rate-limited.** Every send is recorded (user, file #, timestamp, recipient, demo-mode flag) for the per-day cap and an audit trail.

## Recipient resolution (the main real unknown)

Milwaukee has no public "submit comment" API, so a real send is an **email to the right clerk**. Order of
resolution:
1. **Per-item contact** extracted from the agenda / E-Notify body when present (the civic-mail data already
   carries lines like *"email chduke@milwaukee.gov with questions"* / *"RACMInfo@milwaukee.gov"*).
2. **Per-body lookup table** (curated): Plan Commission → DCD/Plan Commission secretary; a Common Council
   committee → the committee clerk / Legislative Reference Bureau. Small, hand-maintained map.
3. **No match + not demo mode** → do not send; surface the manual path ("file in person / email X") instead.
- For the demo, recipient for #260030 is curated, but demo mode overrides it to the test inbox anyway.

## Architecture / reuse

- **Action + modal:** new `action_id` (e.g. `civic_comment_open`) on the alert/record card → `views.open` a
  modal (`civic_comment_modal`) → `view_submission` handler. Mirrors the existing record-modal / parcel-modal patterns.
- **Draft:** one Claude call via the existing summarizer/generation boundary; bilingual per the channel rule; injected for tests.
- **Send:** the existing AgentMail client; recipient + demo-mode gating in a thin pure resolver (unit-testable).
- **State:** a Convex `civicComments` row per send (user, file #, recipient, ts, demoMode) for the cap + audit.
- All boundaries injected; handlers thin; pure builders for the modal + the resolver — TDD throughout.

## Verification

- `node --test` green; the resolver + modal builder + draft prompt have unit tests, incl. the guardrails (no-send-without-confirm, demo-mode forces test inbox, no-recipient degrades safe, per-day cap).
- Live: in the sandbox, trigger from a real alert, draft a bilingual comment, confirm, and see it arrive in the **test inbox** with the file number — disclosed on screen.
- The drafted Spanish comment keeps the file number / committee / address in English.

## Out of scope (YAGNI before freeze)

- Real-time submission to any official portal/API (none exists); email is the channel.
- Mass / organized-campaign sending, petitions, signature collection.
- Auto-advocacy or sending without per-comment human confirm.
- A general per-body clerk directory beyond the few bodies the demo + early channels need.

## Demo integration

Lands as **Beat 7** of DEMO-SCRIPT v2 (1:42–2:08): a resident asks in Spanish → Gavel answers in Spanish →
drafts her public comment for #260030 → she confirms → "✅ filed" (to the test inbox, disclosed) + a 📅
add-to-calendar deep link for the June 29 hearing. If not built by record day, Beat 7 falls back to the
bilingual thread answer + footer + calendar link.

## Time-box

≤ 2 days. If it slips, the demo's fallback Beat 7 holds, and the packaging work (video/Devpost/sandbox)
takes priority — that's where the score actually moves before freeze.
