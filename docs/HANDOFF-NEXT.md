# Build Handoff — next session (clean context window)

_Written **2026-06-22**. `main` @ **`0d3f168`**. Freeze **July 9**, submit **July 13**._

**Read first:** this doc → `CLAUDE.md` (per-issue loop + Linear sync) → re-auth Linear (browser flow,
verify "list my Gavel issues") → then build the **AgentMail "From the city" digest** (the immediate
work below).

---

## THE IMMEDIATE BUILD — AgentMail aggregated digest (MOO-153 core, demo-scoped)

**Why:** Tarik wants AgentMail as a demo beat — it shows Gavel watches the city's whole **email
firehose** (permits, licenses, raze orders), not just meeting agendas. Decided 2026-06-22:
**aggregate by default** (one "📬 From the city" digest), not one-card-per-email.

**Data foundation is DONE — don't redo it.** `scripts/civicmail-backfill.mjs` already re-ingested the
AgentMail inbox into Convex: **`civicNotifications` holds 100 real Milwaukee E-Notify rows** (50
neighborhood_services · 29 licenses · 6 meetings · 6 newsletter · 9 other). It's a **2026-06-10
snapshot** (the live source is dormant — see gotchas) — disclose as "sample week" in the demo. Verify:
`listPending` returns 100.

**What to build (the MOO-153 *core* only — defer the cron + watchlist-interrupt repurpose):**
1. **Pure aggregator** — input: `civicNotifications` rows (+ optionally a channel's subscription for
   geo/topic filtering). Group by **category + district + entity**; rank; **fold routine into counts**
   ("50 neighborhood-services → 12 permits · 3 raze orders · 1 dev plan @ X"). Suppress Legistar
   overlaps via existing `civicmail/dedup.js`. Pure + table-tested.
2. **One batch bilingual summary** — a single Claude call over the clustered set → a concise EN/ES
   briefing (reuse `summarizer/` + `createClaudeGenerate({schema})`; mirror `stories/angle.js`; static
   ES glossary). NOT per-email.
3. **"📬 From the city" Block Kit card** — counts + a few highlighted actionable items (licenses,
   hearings get the "How to be heard" footer) + a "see all / search" affordance. Pure builder.
4. **Post script** — `scripts/civicmail-digest-once.mjs`: read rows → aggregate → summarize → post one
   digest card to a channel (start with `#newsroom` or the hero channel). Mark rows digested
   (`markProcessed`, or add a `digestedAt` field if you want digest-vs-alert separation).
5. **Verify live:** post one real digest to a channel; paste the EN+ES card; `node --test` green;
   `biome check` clean.

**Reuse map (all on `main`):** `agent/civicmail/{notification,extract,dedup,card,process}.js` ·
`agent/convex/civicNotifications.ts` (`listPending`/`searchByDistrictDate(district,fromDate)`/
`getByTaxkey`/`markProcessed`/`insertNotification`) · `summarizer/` · digest-card pattern in
`scripts/digest-once.mjs`. Full design + acceptance: **Linear MOO-153** (In Progress).

**Do it in a worktree** off `main` (TDD like MOO-143/152) — see worktree setup at the bottom.

**After the card works:** (a) fold the "From the city" surface into the workspace IA spec; (b) add an
AgentMail "civic breadth" beat to `docs/DEMO-SCRIPT.md` (or fold into the Architecture beat).

---

## THE OTHER TWO OPEN THREADS (don't lose these)

**1. Workspace IA spec — AWAITING TARIK'S APPROVAL.** `docs/superpowers/specs/2026-06-22-demo-
workspace-ia-design.md` (rev 2). This was a `superpowers:brainstorming` session; the terminal step is
`writing-plans` once Tarik approves. It got an adversarial **Codex review** that found two *verified*
bugs (fixed in rev 2):
- The alert matcher is **OR-based** (`match.js:24` = `committeeHit || keywordHit || districtHit`), so
  "trim keywords to keep a neighborhood channel local" is false. Rev 2 scopes around it (drop
  committees from neighborhood channels; #newsroom keeps them); the real fix (gate geo) is logged.
- Rev-1 districts contradicted Gavel's own resolver (`geo/neighborhoods.js`). Verified truth: **Sherman
  Park=15, Clarke Square=8, Historic Mitchell St=12, "Lindsay Heights"=null**. Rev 2 aligns: sherman=15,
  rename hero `#clarke-square`→`#near-south-side-es` (d12 = the real 2000 S 13th St district), **add
  "Lindsay Heights"→6 to the resolver**.
- **Channel ops are Tarik-manual** (bot has no `channels:manage`/`pins:write`): create #start-here +
  #newsroom, rename the hero channel, archive #general/#zoning/#random, set topics, invite @Gavel, add
  judges. Open question for Tarik: confirm the hero rename (maybe `#historic-mitchell-st`, also d12).

**2. Demo video — MOO-62 (In Progress, P0).** Production script written: `docs/DEMO-SCRIPT.md` —
single-story on the hero (**Punta Cana liquor license #260229, 2000 S 13th St, RT4 residential, open
violation, neighbors opposed**). All beats verified real; the RTS wow needs an **opposition-framed**
question (see memory `rts-query-framing`). The cached 90s clips are in `demo-assets/`. Recording is the
human step. The AgentMail digest adds one more beat.

**Submission (human-driven):** MOO-62 (record) · MOO-63 (Devpost + judge sandbox access to
slackhack@salesforce.com + testing@devpost.com).

---

## DECISIONS LOCKED THIS SESSION (don't relitigate)
- **Demo workspace = "Clean 5":** #start-here · #sherman-park (Denise/association/EN/d15) ·
  #near-south-side-es (Marcos/hero/ES/d12) · #lindsay-heights (Marcos 2nd/organizer/EN/d6) · #newsroom
  (Rachel/reporter/citywide). **Place + Beat** spine; no district#/department channels.
- **AgentMail = aggregated "From the city" digest** (not per-email); MOO-153 core for the demo, cron +
  interrupt deferred.
- **Geography aligned to `geo/neighborhoods.js`**; add Lindsay Heights→6.

## GOTCHAS DISCOVERED (durable — don't re-derive)
- **AgentMail dormant:** inbox dry since 2026-06-10; `civicNotifications` was 0 before the backfill; no
  drain cron; the **`agentmail` SDK is missing from node_modules** (local scripts that `import
  'agentmail'` fail — use the **REST API** directly: `GET https://api.agentmail.to/v0/inboxes/<inbox>/
  messages` with `Authorization: Bearer $AGENTMAIL_API_KEY`; message GET returns `html`/`extracted_html`,
  `from`, `subject`, `timestamp`, `message_id`).
- **`insertNotification` takes `{ record }`** (wrapped), not the record directly.
- **`searchByDistrictDate` arg is `fromDate`** (not `since`); it only returns rows that HAVE a district.
- **Matcher is OR-based** (see thread 1).
- **RTS ranks by query framing** (memory `rts-query-framing`): opposition/sentiment queries surface
  opinions; fact queries surface the record. Demo wow needs an opposition-framed question.
- **Slack scopes:** bot now has `canvases:read/write` (reinstalled); still NO `channels:manage`,
  `pins:write`, `groups:read`, `files:read`. Canvas guide is live (`F0BCXBM57DE`); see memory
  `slack-canvas-publishing`.

## DEPLOYED / ENV STATE
- **`gavel-app`** (Fly, Socket Mode, machine `e8202d9a7d1078`, 4GB) — alerts/App Home/`/gavel`/help
  modal/video/dossier. Deploy from **repo root**: `fly deploy -c fly.app.toml --remote-only`; confirm
  via `fly logs -a gavel-app` → `Gavel is running!` (Fly "good state" lies for Socket Mode). Last live
  16:17Z 2026-06-21 with MOO-152.
- **`gavel-poller`** (Fly, supercronic on `agent/crontab`) — crontab on main = **poll `*/5` · digest
  `0 14 * * 0` · bridge `0 15`**. (Escalation/watch-sweep are NOT merged — open PRs #23/#24.)
- **Convex dev `vivid-weasel-903`** — shared across worktrees; `civicNotifications` now holds 100 rows.
- Commands (from `agent/`): tests `node --test` · lint `npx @biomejs/biome check .` · Convex
  `npx convex dev --once`. Full suite ~727 tests.
- **Open-PR worktrees left intact** (not cleanup): moo-52/53/61/63/112 (PRs #22-26, real unmerged work).

## WORKTREE SETUP (every new worktree)
1. `git worktree add .claude/worktrees/moo-153-digest -b tarikjmoody/moo-153-civic-mail-digest-aggregated-from-the-city-briefing-tuefri origin/main`
2. `cd agent` then: `ln -s <main>/agent/node_modules node_modules` · `rm -rf convex/_generated && cp -R <main>/agent/convex/_generated convex/_generated` · `cp <main>/agent/.env .env` + `.env.local`
3. Commit files **explicitly** (never `git add -A` — the node_modules symlink is untracked).
4. After squash-merge: advance main (`git -C <main> merge --ff-only origin/main`), `git worktree remove … --force`, `git branch -D …`.

## MEMORIES WRITTEN THIS SESSION
`demo-hero-item-260229` · `slack-canvas-publishing` · `rts-query-framing` (see `MEMORY.md`).
