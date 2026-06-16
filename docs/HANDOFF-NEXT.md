# Build Handoff — next: MOO-52 escalation ping · then the finish line

_Clean-context handoff. Written 2026-06-16 after shipping **MOO-53 (watchlist daily sweep —
matters + permits)** to PR #23 (In Review) and rescoping MOO-68._

**Read first, in order:** this doc → `CLAUDE.md` (per-issue loop + Linear sync) → re-auth Linear
(`linear auth`) → `build MOO-52` (recommended) or the chosen issue.

---

## Where the project stands (2026-06-16)

`main` is at **`282d268`** (journal commit). **gavel-app is deployed at v21; gavel-poller runs
the `*/5` poll + Sunday digest.** Recent work:

- **MOO-53 (watchlist daily sweep)** — **In Review (PR #23)**, branch
  `tarikjmoody/moo-53-watchlists-gavel-watch-daily-sweep`. The watch buttons finally do
  something: a daily cron (`0 13 * * *`, 8am CT) diffs new **Legistar matters** + **CKAN
  permits** against every channel's `watches` and posts a bilingual `watchCard`, deduped via a
  new Convex `watchAlerts` ledger. Built as the **unified** sweep — folds in MOO-68's permit
  source, incl. the **owner→MPROP→permits ownership join** for LLC watches. agent 292/292 +
  mcp-server 47/47; verified live (7 real matters for "Maintenance", 0 on re-run; real permit
  `COM-ALT-26-00297` rendered; 3,903-parcel portfolio join). **Not yet deployed** (see below).
- **MOO-68** — **rescoped** (still Backlog, P1): the watchlist→buildingpermits slice is now
  MOO-53's; MOO-68 keeps `liquorlicenses` + `accelavacantbuilding`, **subscription/district**
  matching, the MOO-41-style stateful global diff, summarizer alerts, and digest/briefing feeds.
- **MOO-110 / MOO-55 / MOO-112** — see git log; MOO-112 (parcel modal) was **PR #22, In Review**.

**The demo chain works end-to-end:** RTS thread → parcel card (owner, zoning, lot, units) →
`ask_zoning_code` with `§295-NNN` citations → walk-on/agenda-change detectors → bilingual alerts
→ **now**: `/gavel watch "XYZ LLC"` fires when that LLC hits a new matter or a permit citywide.

## ⚠️ Open verification (human, quick — do these first)

1. **MOO-53 watch card** — eyeball a posted `watchCard` in a real Slack channel. Then **deploy
   to go live** (below) and **merge PR #23** → MOO-53 Done. (To force a real post for the
   eyeball: seed a watch whose term you know is in a recent matter, run `WATCH_DRY_RUN=` unset
   `node scripts/watch-sweep-once.mjs` once.)
2. **MOO-112 modal** — App Home → "🔎 Look up a property" → `1108 e chambers st` renders the
   property card; then merge **PR #22** → close MOO-112. _(carried from the prior handoff)_
3. **MOO-55 ES path** — one Spanish zoning DM → accurate ES answer with EN `§295-NNN` citations.
4. **MOO-43 ES fluency** — native-speaker review (`cd agent && node scripts/bilingual-verify.mjs`).

## ▶ RECOMMENDED NEXT: MOO-52 — Escalation ping (committee → Council)

**`protected` (can't-cut), P1, Phase 3, unblocked.** Poller diffs `MatterHistory` for a watched
matter's committee→full-Council transition → posts an escalation ping (link back to the original
alert + new hearing). Strengthens the insider-knowledge beat next to the MOO-51 walk-on detector.
Poller-side (builds on the MOO-41 spine; runs on **gavel-poller**, not gavel-app). `getMatterHistory`
already exists in `agent/poller/legistar.js`. Out of scope: watchlist sweeps (MOO-53, done),
agenda-change (MOO-51, done).

## ALTERNATIVE: the finish line (Phase 5, all P0/Urgent)

- **MOO-61** — architecture diagram (three-memory model) — agent-buildable.
- **MOO-62** — record the 3-min demo video (hero beats now exist; gate on the open verification above).
- **MOO-63** — Devpost submission package (Agent for Good; judge sandbox to slackhack@salesforce.com).

## ⚠️ MOO-53 go-live (when ready to deploy the sweep)

- Push the Convex schema/functions to **prod** (`watchAlerts` table only ran on dev
  `vivid-weasel-903`): `cd agent && npx convex deploy` (or the prod-push step the project uses).
- Deploy **gavel-poller** from `agent/`: `fly deploy --remote-only` — picks up the new crontab
  line. Verify: `fly logs -a gavel-poller` shows the `0 13` watch-sweep entry running.
- **First prod sweep does a one-time catch-up** over the lookback window (`WATCH_LOOKBACK_DAYS`,
  default 7) — it may post a burst of matches for existing watches. Expected; the dedup ledger
  makes every later run quiet.

## ⚠️ Deploy + ops facts (still true)

- **gavel-app (interactive agent) deploys from the REPO ROOT:** `fly deploy -c fly.app.toml -a
  gavel-app --remote-only`. **Do NOT** `fly deploy` from `agent/` — `agent/fly.toml` is the
  **gavel-poller** config (supercronic); deploying it to gavel-app turns the agent into a cron runner.
- **gavel-app runs `node app.js` (Socket Mode) as non-root on `shared-cpu-2x` / 4GB.** The Claude
  Code CLI subprocess needs 4GB (OOM-killed at 512MB & 2GB). Verify via `fly logs -a gavel-app`
  showing `bolt-app Gavel is running!` + a Socket Mode `hello`, NOT the deploy exit code.
- **Agent model pinned to `claude-sonnet-4-6`** in `agent/agent/agent.js`. Override via `GAVEL_AGENT_MODEL`.
- **Secrets on gavel-app:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `CONVEX_URL`, `SLACK_BOT/APP/USER_TOKEN`.
- **gavel-poller** (cron): `fly deploy --remote-only` from `agent/`; supercronic `*/5` poll +
  `0 14 * * 0` Sunday digest + **`0 13 * * *` watch sweep (new)**.

## Parcel / data facts (for MOO-68 + MOO-52)

- CKAN client lives in `mcp-server/src/parcel.js` (`createParcelClient`): `getPermits(address,
  {since})`, `getOwnershipPortfolio(owner, {match,limit})`, `mapPermit` (now incl. `recordId`+
  `address`). agent scripts import it via `../../mcp-server/src/parcel.js`.
- **Permits dataset `828e9630…` has NO owner column** — only Address. That's why LLC→permit
  needs the MPROP ownership join. `liquorlicenses` (TRADE_NAME, EFF_DATE) + `accelavacantbuilding`
  (DATEOPENED) are the MOO-68 datasets, each with a date field for daily diffing.
- `mapParcel` exposes `lotArea`, `buildingArea`, `numUnits`, `yearBuilt`, `stories`.
- Watch-sweep verify: `cd agent && node scripts/watch-sweep-verify.mjs` (real Legistar + Convex).

## Session bookkeeping

Stale worktrees removable once their PRs merge: `moo-110-parcel-card`, `moo-55-zoning-rag`,
`moo-112-parcel-modal`, `moo-53-watch-sweep`. (`moo-76-ux-d` already removed.) Standing item:
**rotate the chat-pasted Slack tokens**. **Deadline: July 13, 2026.**
