# Build Handoff — next: MOO-63 Devpost package + MOO-62 demo video + ship the open PRs

_Clean-context handoff. Written 2026-06-16 after shipping **MOO-53 (watchlist sweep, PR #23)**,
**MOO-52 (escalation ping, PR #24)**, and **MOO-61 (architecture diagram, PR #25)** — all three In
Review — and rescoping MOO-68._

**Read first, in order:** this doc → `CLAUDE.md` (per-issue loop + Linear sync) → re-auth Linear
(`linear auth`) → `build MOO-63` (recommended — now unblocked by MOO-61) or help ship the 3 open PRs.

---

## Where the project stands (2026-06-16)

`main` is at the latest **journal commit**. **gavel-app deployed at v21; gavel-poller runs the
`*/5` poll + Sunday digest.** Phase 3 monitoring is feature-complete and the Phase 5 diagram is done
(all pending review/merge — **3 open PRs: #23, #24, #25**):

- **MOO-61 (architecture diagram)** — **In Review (PR #25)**, branch
  `tarikjmoody/moo-61-architecture-diagram-three-memory-model`. Three-memory model in
  `docs/architecture/` (SVG + 2× PNG + Mermaid + README). Grounded against shipped code (no
  aspirational boxes), rendered + verified legible. **Unblocks MOO-63.**

- **MOO-52 (escalation ping)** — **In Review (PR #24)**, branch
  `tarikjmoody/moo-52-escalation-ping-matterhistory-committee-council-diff`. A 6-hourly cron
  (`0 */6 * * *`) diffs `MatterHistory`: when a matter we alerted on clears its committee
  (`RECOMMENDED FOR ADOPTION/PASSAGE`) and hasn't been voted yet, it pings the channels that got
  the original alert that it's **headed to the full Common Council**, with a Legistar deep-link.
  Fire-once via `matterEscalations` Convex ledger. agent 293/293; verified live (matter 74074 →
  1 ping, idempotent). **The live gate caught two real bugs** (already-voted matters escalating;
  stale 2023 recommendations) — both fixed. **Not yet deployed.**
- **MOO-53 (watchlist daily sweep)** — **In Review (PR #23)**, branch
  `tarikjmoody/moo-53-watchlists-gavel-watch-daily-sweep`. Daily cron (`0 13 * * *`) diffs new
  **Legistar matters + CKAN permits** against `watches`, posts a bilingual `watchCard`, deduped
  via `watchAlerts`. Unified sweep — folds in MOO-68's permit source incl. the owner→MPROP→permits
  ownership join. agent 292/292 + mcp-server 47/47; verified live. **Not yet deployed.**
- **MOO-68** — **rescoped** (Backlog, P1): watchlist→buildingpermits is MOO-53's now; MOO-68 keeps
  `liquorlicenses` + `accelavacantbuilding`, **subscription/district** matching, the MOO-41-style
  stateful global diff, summarizer alerts, and digest/briefing feeds.
- **MOO-112** (parcel modal) — **PR #22, In Review** (carried).

**The demo chain works end-to-end:** RTS thread → parcel card (owner, zoning, lot, units) →
`ask_zoning_code` with `§295-NNN` citations → walk-on/agenda-change detectors → bilingual alerts →
`/gavel watch "XYZ LLC"` fires on a new matter/permit citywide → **escalation ping** when a tracked
matter is headed to the full Council vote.

## ⚠️ Open verification + ship (human, quick — clears the path to demo)

The three poller features (MOO-53, MOO-52, and the earlier ones) are code-complete and unit+live
verified; what remains is an eyeball in real Slack + deploy + merge:

1. **MOO-53 watch card** — eyeball a posted `watchCard` in a real channel (seed a watch whose term
   is in a recent matter, run `node scripts/watch-sweep-once.mjs` once). Then deploy + merge **PR #23** → MOO-53 Done.
2. **MOO-52 escalation ping** — eyeball a posted escalation card. Then deploy + merge **PR #24** → MOO-52 Done.
3. **MOO-112 modal** — App Home → "🔎 Look up a property" → `1108 e chambers st` renders; merge **PR #22**.
4. **MOO-61 diagram** — eyeball `docs/architecture/three-memory-architecture.svg` reads well for the
   slide; merge **PR #25** → Done. (Wording/colour tweaks are one-line SVG edits.)
5. **MOO-55 ES path** — one Spanish zoning DM → accurate ES answer with EN `§295-NNN` citations.
6. **MOO-43 ES fluency** — native-speaker review (`cd agent && node scripts/bilingual-verify.mjs`).

## ▶ RECOMMENDED NEXT: MOO-63 — Devpost submission package (now unblocked by MOO-61)

The finish line. **Largely agent-buildable** (impact-led writeup, feature list, tech/sponsor mapping,
"real vs cached for demo" honesty table — pull from `docs/gavel-project-brief.md` + the three-memory
diagram). The human-only parts: granting judge sandbox access (to slackhack@salesforce.com) and the
actual Devpost submit. Then:

- **MOO-62** — record the 3-min demo video (every hero beat now exists: RTS thread → parcel card →
  zoning RAG → walk-on/agenda-change → bilingual alert → watch hit → escalation ping). Gate on the
  open verification above (eyeball the new cards) + deploy.

## ⚠️ Go-live deploy (both new crons live on the same gavel-poller)

When ready to deploy MOO-53 + MOO-52 together:

- Push Convex schema/functions to **prod** (`watchAlerts` + `matterEscalations` only ran on dev
  `vivid-weasel-903`): `cd agent && npx convex deploy` (or the project's prod-push step).
- Deploy **gavel-poller** from `agent/`: `fly deploy --remote-only` — picks up both new crontab
  lines (`0 13 * * *` watch sweep, `0 */6 * * *` escalation). Verify via `fly logs -a gavel-poller`.
- **Both do a one-time first-run catch-up burst:**
  - MOO-53: matches for existing watches over `WATCH_LOOKBACK_DAYS` (default 7).
  - MOO-52: ~42 currently-mid-flight matters escalate at once. Suppress with a low
    `ESCALATION_REC_MAX_AGE_DAYS` on the first run, or pre-seed the `matterEscalations` ledger.
  - Both ledgers make every later run quiet.

## ⚠️ Deploy + ops facts (still true)

- **gavel-app (interactive agent) deploys from the REPO ROOT:** `fly deploy -c fly.app.toml -a
  gavel-app --remote-only`. **Do NOT** `fly deploy` from `agent/` — `agent/fly.toml` is the
  **gavel-poller** config (supercronic); deploying it to gavel-app turns the agent into a cron runner.
- **gavel-app runs `node app.js` (Socket Mode) as non-root on `shared-cpu-2x` / 4GB** (4GB required;
  OOM-killed at 512MB & 2GB). Verify via `fly logs -a gavel-app` showing `bolt-app Gavel is running!`
  + a Socket Mode `hello`, NOT the deploy exit code.
- **Agent model pinned to `claude-sonnet-4-6`** in `agent/agent/agent.js`. Override via `GAVEL_AGENT_MODEL`.
- **Secrets on gavel-app:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CONVEX_URL`, `SLACK_BOT/APP/USER_TOKEN`.
- **gavel-poller** (cron): `fly deploy --remote-only` from `agent/`; supercronic `*/5` poll +
  `0 14 * * 0` Sunday digest + **`0 13 * * *` watch sweep + `0 */6 * * *` escalation** (both new).

## Data / code facts (for MOO-68 + the finish line)

- CKAN client: `mcp-server/src/parcel.js` (`createParcelClient`) — `getPermits`, `getOwnershipPortfolio`,
  `mapPermit` (incl. `recordId`+`address`). agent scripts import via `../../mcp-server/src/parcel.js`.
- **Permits dataset `828e9630…` has NO owner column** — only Address → LLC→permit needs the MPROP join.
  `liquorlicenses` (TRADE_NAME, EFF_DATE) + `accelavacantbuilding` (DATEOPENED) are MOO-68's datasets.
- **Escalation:** `MatterHistory` flow is `COMMON COUNCIL ASSIGNED TO` (intro) → `[COMMITTEE]
  RECOMMENDED FOR ADOPTION` → `COMMON COUNCIL ADOPTED` → `MAYOR SIGNED`. `matterDetailUrl(id, guid)`
  builds the Legistar deep-link. Verify scripts: `node scripts/watch-sweep-verify.mjs`,
  `node scripts/escalation-verify.mjs` (both real Legistar/CKAN/Convex).

## Session bookkeeping

Stale worktrees removable once their PRs merge: `moo-110-parcel-card`, `moo-55-zoning-rag`,
`moo-112-parcel-modal`, `moo-53-watch-sweep`, `moo-52-escalation-ping`, `moo-61-arch-diagram`.
(`moo-76-ux-d` removed.) Standing item: **rotate the chat-pasted Slack tokens**.
**Deadline: July 13, 2026.**
