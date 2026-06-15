# Build Handoff — MOO-110 (parcel card/map) · MOO-55 (zoning RAG) · submission trio

_Clean-context handoff. Written 2026-06-15 after MOO-54 (sandbox seeding) and MOO-50 (parcel
MCP tools) both shipped and merged in one session._

**Read first, in order:** this doc → `CLAUDE.md` (per-issue loop + Linear sync protocol) →
for MOO-110: `docs/superpowers/specs/2026-06-15-moo50-parcel-mcp-tools-design.md` (the map
research is summarized in the MOO-110 issue) → re-auth Linear → `build MOO-110` (or chosen issue).

---

## Where the project stands (2026-06-15)

`main` is at **`27739db`**. Two issues shipped this session:

- **MOO-54 (sandbox seeding)** — merged (PR #18). 3 neighborhood channels seeded with staged,
  content-dated, disclosed history: `#sherman-park` (C0BARPFBGLS, en, D7), `#lindsay-heights`
  (C0BAA9FUYQ7, en, D6), `#clarke-square` (C0BAPMK6HE2, **es**, D12) incl. the bilingual
  **Punta Cana LLC / 2000 S 13th St** thread (RTS-findable, verified). **Stays In Review** — one
  open human item: the **judge-account walkthrough** (confirm a guest sees the public channels).
- **MOO-50 (parcel MCP tools)** — merged (PR #19), **Done**. 4 live CKAN tools in `mcp-server/`:
  `lookup_parcel` / `check_zoning` / `get_ownership_portfolio` / `get_permits` (all query
  `data.milwaukee.gov`; MPROP daily, buildingpermits monthly). 42/42 tests.

**The demo chain now works end-to-end:** RTS surfaces the seeded Punta Cana thread →
`lookup_parcel("2000 S 13th St")` → **SHAAN REAL ESTATE INC**, RT4, District 12 →
`get_ownership_portfolio` (`BERRADA PROPERTIES` contains → **694 parcels** = the shells beat).

## ▶ RECOMMENDED NEXT: MOO-110 — Parcel card (Block Kit) with map deep-link + watchlist button

Unblocked (MOO-50 done). Already fully spec'd in the Linear issue (Intent/Acceptance/Verification)
— it was researched + planned this session. **Presentation layer, agent-side** (an MCP tool can't
post Block Kit): a `agent/blockkit/parcel-card.js` rendered via the `render_receipt` tool (MOO-75).

- **Decisions locked:** 🗺️ Google Maps **deep-link button** first (`https://www.google.com/maps/
  search/?api=1&query=<address>` — zero key, zero cost), 👁 **real "Add to watchlist" button**
  (wired to `/gavel watch` + the `watches` table), static-map image **deferred** (stretch).
- **Research notes** (in the issue): static map would use `slack_file` to keep the Maps key
  server-side; no parcel polygon (MPROP has no geometry → pin only); link-unfurling rejected.
- **Patterns to mirror:** `agent/blockkit/` builders, `listeners/actions/alert-buttons.js`
  (button handlers + `postEphemeralSafe`), `agent/agent/receipts/` (render_receipt accumulator).
- Probably small enough to skip a written plan — TDD the card builder (pure) + the button handler.

## ALTERNATIVE A: MOO-55 — Zoning-code RAG (the last unbuilt demo hero beat)

MOO-50 unblocked it (`check_zoning`/`lookup_parcel` resolve address→district). The "what could
they build if this passes?" beat — parcel-conditioned vector RAG over the zoning code with
citations. **The one genuinely fuzzy issue left** (structure-aware chunking strategy) →
**brainstorm first**. Convex vector namespace `zoning_code`. Heavier than MOO-110.

## ALTERNATIVE B: the finish line (Phase 5, all P0/Urgent)

- **MOO-62** — record the 3-min demo video (now unblocked: RTS + parcel beats exist; zoning still pending).
- **MOO-61** — architecture diagram (three-memory model).
- **MOO-63** — Devpost submission package (Agent for Good; judge sandbox access to slackhack@salesforce.com).
- **MOO-52** (escalation ping) is labeled **protected** (can't-cut) and cheap — a `MatterHistory` diff.

## ⚠️ Worktree + deploy checklist (two real outages came from skipping this)

`git worktree add` off `origin/main`. **MOO-110 touches `agent/`** → in `agent/`: `npm ci`, copy
`.env`+`.env.local`, **`npx convex dev --once`** (gitignored `_generated` is image-baked), baseline
`node --test`. (MCP-only work like MOO-50 instead sets up `mcp-server/` — its own package.) Verify
deploys via `fly releases` / machine uptime, NOT the deploy exit code. Memory `convex-codegen-before-deploy`.

## ⚠️ Standing human items (pinned, not blockers)

1. **Rotate the chat-pasted Slack tokens** — `agent/.env` + Fly secrets on BOTH `gavel-app` and `gavel-poller`.
2. **MOO-43 ES fluency review** — `cd agent && node scripts/bilingual-verify.mjs`; native speaker signs off.
3. **MOO-54 judge-account walkthrough** — flips MOO-54 → Done.
4. **Slack is org-wide Enterprise Grid** — `conversations.list/create` need `team_id=T0B8KS540G4`;
   no `channels:manage`/`pins:write` on either token. Memory `slack-grid-scopes`.
5. **Pre-existing (MOO-47):** `mcp-server/scripts/mcp-verify.mjs` throws on a "THE CHAIR"
   (`personId: null`) sponsor — the `get_sponsors` tool itself degrades safely; only the script crashes.

## Session bookkeeping

Only the stale `moo-76-ux-d` worktree remains on disk (removable). Specs added this session:
`docs/superpowers/specs/2026-06-15-moo54-sandbox-seeding-design.md`,
`docs/superpowers/specs/2026-06-15-moo50-parcel-mcp-tools-design.md`. **Deadline: July 13, 2026.**
