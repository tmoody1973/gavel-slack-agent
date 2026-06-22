# Build Handoff — next session (clean context window)

_Written **2026-06-22**. `main` @ **`45d7015`**. Freeze ~**July 9**, submit **July 13**._

**Read first:** this doc → `CLAUDE.md` (per-issue loop + commands) → the plan + spec linked below → re-auth Linear (browser flow; verify "list my Gavel issues") → then execute the UX plan **subagent-driven**.

---

## THE IMMEDIATE BUILD — "Win the Last Mile: UX Mastery Curve"

**Goal:** lift the main-track **Design** score (Agent for Good) + contest **Best UX**, and double-score **Impact** via bilingual completeness — all UX polish, **no new features**. The build is over-built for a 3-min judging window; remaining points are won in **legibility**, not code.

**Execute this plan (subagent-driven, chosen 2026-06-22):**
- **Plan:** `docs/superpowers/plans/2026-06-22-win-the-last-mile-ux-mastery-curve.md` — 4 tasks, each TDD with exact code + commits.
- **Spec (the why):** `docs/superpowers/specs/2026-06-22-win-the-last-mile-ux-design.md`.
- **Run with:** `superpowers:subagent-driven-development` — fresh subagent per task, two-stage review between tasks.

**Key discovery that shaped the plan (don't re-derive):**
- **U1 (first-contact card) already exists** — `agent/blockkit/onboarding.js` `memberWelcomeCard(language)`, posted once per channel via `markWelcomePosted` (FD-C). Task 3 *verifies* it, doesn't build it.
- **The real centerpiece is U3+U4 merged** = a **bilingual command-copy module** (Task 1) + wiring `/gavel` help/usage/status/errors to the channel language (Task 2). That's the actual English cliff on the Spanish ramp. Reuse the `COPY = {en, es}` + required-keys pattern from `agent/onboarding/copy.js`.
- **U2** (one-next-step audit) is mostly satisfied already (this session's affordances on digest/modal/search) — Task 3 locks it in as a guard test. **U5/U6** are clearly **stretch** (verify/tighten, don't rebuild).
- Sequence **Task 1 → Task 2 first** (the bilingual surface — double-scores Design+Impact, most demo-visible).

**Worktree (one per effort — the moo-153 worktree is gone, cleaned up):**
1. `git worktree add .claude/worktrees/ux-curve -b tarikjmoody/ux-mastery-curve origin/main`
2. `cd agent` then: `ln -s <main>/agent/node_modules node_modules` · `rm -rf convex/_generated && cp -R <main>/agent/convex/_generated convex/_generated` · `cp <main>/agent/.env .env` + `.env.local`
3. Commit files **explicitly** (never `git add -A` — the node_modules symlink is untracked).
4. After merge: advance main (`git -C <main> merge --ff-only origin/main`), `git worktree remove … --force`, `git branch -D …`.
5. **Deploy after merge:** `fly deploy -c fly.app.toml --remote-only` (UX changes are app code — gavel-app needs a redeploy to go live); confirm via `fly logs -a gavel-app` (Fly "good state" lies for Socket Mode). Optionally make a MOO issue to track this if you want it in Linear.

---

## WHY THIS — the judge's frame (don't lose the strategy)

Judged a mock review against the real rubric (4 equal axes: Tech Impl · Design · Impact · Quality of Idea; must use ≥1 of Slack AI / MCP / RTS — **Gavel uses all three**; Agent for Good track; $8k/$4k per track + three $2k cross-cutting prizes; 3-min video + arch diagram + sandbox; first 60s decide engagement).

**Scorecard:** Tech Impl **9** · Impact **9** · Idea **8.5** · Design **7.5** → overall ~**8.5**, a top-tier Agent-for-Good contender. **Most winnable prizes: Best Technological Implementation (~30–40%)** and an **Agent for Good track placement (~30–45%)**. Design is the softest axis → hence this UX work.

**The biggest swing factors (the OTHER half of "win the last mile" — not yet spec'd):**
1. **The first-60s RTS wow must be legible to a stranger** (the Punta Cana #260229 opposition-framed query). #1 risk.
2. **Front-load the tech story** — "all three eligible Slack techs + three-memory model" in the first 30s, not at 2:00.
3. **Airtight Devpost packaging** — honest real-vs-cached table + the open-source MCP repo + the Plan-Commissioner credibility.
4. **A bulletproof seeded judge sandbox** (slackhack@salesforce.com + testing@devpost.com).
→ **Next spec to write:** "Win the Last Mile — Demo & Packaging" (the legibility half). Pairs with this UX plan.

---

## OTHER OPEN THREADS (don't lose these)

- **MOO-153 — In Review, one item left for Done:** the **watchlist-interrupt path** (a single E-Notify posts its own card only on a watch hit; everything else flows to the digest). The "From the city" digest + federated `/gavel search` + record modal + OCR + hybrid/semantic search all shipped this session (PR #48, merged → `main` `d013cd9`). Cron is built but the crontab line is **disabled** — enable post-demo.
- **MOO-62 (demo video, P0, In Progress):** `docs/DEMO-SCRIPT.md` — single-story on the hero (Punta Cana liquor license #260229, #clarke-square ES). All beats verified real; RTS wow needs an opposition-framed question (memory `rts-query-framing`). Recording is the human step.
- **MOO-63 (submission):** Devpost text + judge sandbox access. Fold the AgentMail civic-breadth + federated-search beats in.
- **Workspace IA spec** (`docs/superpowers/specs/2026-06-22-demo-workspace-ia-design.md`, rev 2) — channel ops are **Tarik-manual** (bot has no `channels:manage`).

---

## DEPLOYED / ENV STATE

- **`gavel-app`** (Fly, Socket Mode, machine `e8202d9a7d1078`) — **v44**, runs the merged MOO-153 code. Secrets incl. AGENTMAIL_API_KEY/INBOX, OPENAI_API_KEY, ANTHROPIC, CONVEX_URL, SLACK_*. Deploy from **repo root**: `fly deploy -c fly.app.toml --remote-only`.
- **`gavel-poller`** (Fly, supercronic on `agent/crontab`) — poll `*/5` · digest `0 14 Sun` · bridge `0 15`. The civic-mail Tue/Fri line is committed **disabled**.
- **Convex dev `vivid-weasel-903`** — `civicNotifications` holds **135** rows (subject+body+PDF/OCR text), **all 135 embedded** (1536-dim, `by_embedding`). `detectedAgendaItems` has a new `search_title` index. Push with `npx convex dev --once`.
- Commands (from `agent/`): tests `node --test` (**825 green**) · lint `npx @biomejs/biome check .` · Convex `npx convex dev --once`.

## DECISIONS LOCKED / GOTCHAS (durable)

- **Don't narrow the build** — the research's "narrow or don't submit" is greenfield advice; Gavel's breadth (three-memory + bilingual + civic mail) is the moat. Narrow the **demo/pitch**, not the build.
- **AgentMail inbox = 135 messages** (paginate via `page_token`, not `last_key`). The "3 raze orders" demo line is **not in the data** — use **recurring applicants** (Foley & Lardner ×3) for the civic-breadth beat (memory `civicmail-digest-recurring-not-raze`).
- **`/gavel search` is federated** (mail keyword+semantic · agendas keyword · minutes+zoning vector); quotes = exact phrase, unquoted = hybrid. OCR + PDF text via Claude (no pdf-parse/tesseract dep).
- **Civic identifiers stay English in the ES block** (committee names, file #s, addresses, channel handles, slash syntax) — only prose is translated.

## MEMORIES WRITTEN (see `MEMORY.md`)
`civicmail-digest-recurring-not-raze`, `agentmail-enotify-real-shape` (updated: page_token/135), plus prior `demo-hero-item-260229`, `rts-query-framing`, `slack-canvas-publishing`.
