# UX Build Handoff — persona-driven Block Kit layer (UX-A…E)

_Focused handoff to start the UX work in a clean context window. Written 2026-06-09,
end of a 6-session day._

**Read first, in order:** this doc → `docs/superpowers/specs/2026-06-09-ux-blockkit-design.md`
(**the approved spec — the source of truth for this work**) → `docs/gavel-personas-features.md`
(Denise/Marcos/Rachel — the design is persona-driven) → `CLAUDE.md` (loop + Linear sync
protocol). Then re-auth Linear and start at "Next actions" below.

---

## Where the project stands (2026-06-09 EOD)

Five issues shipped to production today — all Done in Linear with evidence:

- **MOO-49** RTS community memory (`agent/agent/community-memory/`, `search_community_memory`
  tool, slack-mcp fallback, `GAVEL_DISABLE_RTS=1` switch). `buildAgentOptions()` in
  `agent/agent/agent.js` threads `deps.userToken ?? process.env.SLACK_USER_TOKEN`.
- **MOO-43** bilingual cards (per-channel language gate in `alerts/process.js`; glossary in
  `summarizer/prompt.js`). **In Review** — pending only the native-ES-speaker fluency
  review (`node scripts/bilingual-verify.mjs` prints 3 real cards).
- **MOO-46** `/gavel` slash commands (`listeners/commands/`, Convex `watches` table —
  `addWatch` idempotent, `listWatches`; `unwatch`/`digest` are stubs). Phase 1 closed.
- **MOO-72** council directory (`agent/data/milwaukee-council-members.json` → Convex
  `councilMembers`, seed script, last-name matcher in `alerts/council.js`, headshot block
  in `alerts/card.js`). Legistar sponsor formats: `ALD. STAMPER` / `Russell Stamper, II`.
- **MOO-51** walk-on + consent flags (`poller/flags.js`, detection-time rule, card warnings).

Apps: `gavel-poller` + `gavel-app` live on Fly, current with main. Convex dev deployment
`vivid-weasel-903` is prod for both. Demo channel `C0B8KS5VCCC` (#general): language `es`,
committees ZND/City Plan/Licenses/CED, watch "Punta Cana LLC". 157/157 tests on main.

## The approved UX design (already brainstormed — do NOT re-brainstorm)

Spec: `docs/superpowers/specs/2026-06-09-ux-blockkit-design.md`. Decisions made with
Tarik via visual companion (mockups persist in `.superpowers/brainstorm/7543-1781041747/`):

1. **App Home = Hybrid** — status strip (Denise) + watches & per-channel config with
   edit modals (Marcos). Supersedes MOO-59.
2. **Thread answers = prose + structured receipts** — vote table, sponsor card,
   timeline, agent-decided. (Rachel)
3. **Card buttons all wired**: Watch → real `addWatch`; History → `MatterHistory`
   timeline in thread; Ask Gavel → primed thread.
4. **Architecture = renderer library + render tool**: pure `agent/blockkit/` builders
   shared by all surfaces; agent passes typed data through a Zod-validated
   `render_receipt` in-process SDK tool (MOO-49's tool pattern); blocks attach via
   `streamer.stop({blocks})` like feedback buttons. Claude never writes raw Block Kit.
5. Extras in scope: persona prompts + error states (absorbs MOO-60), Sunday Digest card
   (cron stays MOO-58), Mobilize/RSVP (UX-E — explicit cut-line, anonymous counts ONLY,
   no Slack user IDs — the minimal-PII rule).

## Next actions (in order)

1. **Create the Linear issues** UX-A…E from spec §6 (linear-build "create issue from
   intent"; team Moodyco, project Gavel, with Intent/Acceptance/Verification each):
   - **UX-A** Block Kit foundation + wired card buttons (+ new-blocks spike + `removeWatch`
     mutation — which also un-stubs `/gavel unwatch`)
   - **UX-B** Hybrid App Home → then mark **MOO-59 superseded** (cancel w/ comment or link)
   - **UX-C** Thread receipts + persona prompts + error states → absorbs **MOO-60**
   - **UX-D** Sunday Digest card + cron → re-scope **MOO-58**
   - **UX-E** Mobilize/RSVP (stretch)
2. **Build UX-A** via the standard loop (worktree → writing-plans → TDD → live verify →
   PR → deploy `gavel-app` for buttons; poller untouched).
3. **First task inside UX-A: the new-blocks spike** (curl-before-commit, ~30 min): can app
   A0B8GP68PLJ post Slack's new agent blocks (Card / Data Table / Alert) via Bolt 4.7.3?
   Pass → `voteTable` uses Data Table. Fail → aligned monospace fallback
   (**Slack mrkdwn has NO native tables** — this fallback is load-bearing).

## Gotchas you'd otherwise re-derive

- Card buttons carry only `eventItemId` as value — Watch/History handlers resolve
  matter/file via the `detectedAgendaItems` row (or extend the button value at card-build
  time; decide in the plan).
- MCP tool results: text-only content, no `structuredContent` (-32602). The
  `render_receipt` tool returns text confirmation; the BLOCKS travel via deps
  accumulation, not the tool result.
- App Home edit modals: `view_submission` handlers; validation errors via
  `response_action: 'errors'`. Re-publish the Home after every mutation.
- 50 blocks/message cap — truncate receipts with a "full record →" Legistar link.
- Deploys: buttons/Home/threads live in `gavel-app` (`fly deploy -c fly.app.toml
  --remote-only` from repo root); digest cron joins `gavel-poller` (`cd agent && fly
  deploy --remote-only`). Manifest changes need the interactive `slack run` sync (human).
- Worktrees: one per issue, `npm ci` in `agent/`, copy `.env` + `.env.local` from the
  main checkout. cwd drifts — use absolute paths in compound commands.

## Standing human items

1. **Rotate the chat-pasted Slack tokens** (also pinned in `.remember/remember.md`) —
   update `agent/.env` AND Fly secrets on `gavel-app`; verify with `node scripts/rts-smoke.mjs`.
2. **MOO-43 ES fluency review** (≥3 real cards) → then close MOO-43 Done.

## Other open roadmap (after UX, or interleaved)

MOO-54 sandbox seeding (demo-video blocker; brainstorm the no-backdating wrinkle first),
MOO-50 parcel tools, MOO-52 escalation ping, MOO-53 watchlist sweep (the `watches` table
is live and waiting), MOO-69 AgentMail (P3, design doc exists). Deadline: **July 13**.
