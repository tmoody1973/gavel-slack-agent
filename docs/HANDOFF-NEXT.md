# Build Handoff — MOO-50 (Parcel MCP tools)

_Focused handoff to start MOO-50 in a clean context window. Written 2026-06-15, right
after MOO-54 (sandbox seeding) shipped to In Review (PR #18)._

**Read first, in order:** this doc → `CLAUDE.md` (the per-issue loop + Linear sync
protocol) → the existing MCP server you're extending: `mcp-server/src/tools.js`,
`mcp-server/src/legistar.js`, `mcp-server/src/errors.js`, `mcp-server/README.md`, and
the MOO-47 design+plan in `docs/superpowers/2026-06-08-moo-47-mcp-server-design.md` /
`docs/superpowers/plans/2026-06-08-moo-47-mcp-server.md` → PRD §"Parcel tools" +
§"Stack Summary" (the `data.milwaukee.gov` CKAN rows). Then re-auth Linear and
`build MOO-50`.

---

## Where the project stands (2026-06-15)

- **MOO-54 (sandbox seeding) → In Review, PR #18.** Three neighborhood channels live:
  `#sherman-park` (C0BARPFBGLS, en, D7), `#lindsay-heights` (C0BAA9FUYQ7, en, D6),
  `#clarke-square` (C0BAPMK6HE2, **es**, D12). 16 staged, content-dated, disclosed
  messages incl. the bilingual **Punta Cana LLC / 2000 S 13th St / File #260229**
  thread — verified RTS-findable live. New script `agent/scripts/seed-sandbox.mjs`
  (+ `agent/sandbox/` pure module, 16 tests). **243/243 tests** on the branch.
- **Two open items hanging off MOO-54:** (1) merge PR #18 then close the worktree via
  `superpowers:finishing-a-development-branch`; (2) MOO-54 stays In Review until the
  **judge-account walkthrough** human item is confirmed (public channels → any guest
  sees the history).
- Phase 0/1 closed; Phase 2 (MCP server, RTS, threads, receipts) + the UX layer
  (MOO-73/74/75/76) all shipped. Convex dev `vivid-weasel-903` is prod for both Fly
  apps (`gavel-app`, `gavel-poller`).

## The build target — extend the standalone MCP server

The `milwaukee-civic` MCP server is a **separate stdio process** at `mcp-server/`, spawned
by the Bolt agent (`agent/agent/agent.js` → `../../mcp-server/src/server.js`). It is the
shippable open-source artifact. MOO-50 adds the **parcel layer** alongside the 9 Legistar
tools:

- `mcp-server/src/tools.js` — register the new tools (mirror the existing `tool(...)` entries).
- **New `mcp-server/src/parcel.js`** — CKAN/MPROP client, mirroring `legistar.js`.
- `mcp-server/src/errors.js` — reuse the `information_unavailable` pattern (the agent prompt
  keys off that exact string; never guess when a source is empty).
- `mcp-server/test/` — add `parcel.test.js` / extend `tools.test.js` (this server has its own
  `node --test` suite + biome; **separate `package.json` from `agent/`** — run installs/tests
  in `mcp-server/`).

## Data sources (PRD §"Stack Summary" — `data.milwaukee.gov` CKAN datastore API)

| Concern | Dataset | Access | Refresh | Demo strategy |
|---|---|---|---|---|
| Property / ownership | **MPROP** | CKAN datastore API / CSV | Daily | CSV snapshot |
| Permits | Residential & Commercial Permit Work Data | CKAN API / CSV | Monthly | **Snapshot into Convex (demo-honest, disclose date)** |
| Zoning districts | Open-data zoning datasets | CKAN API | Nightly | Snapshot |

- **TAXKEY** is the parcel join key; MPROP carries the owner name → the `get_ownership_portfolio`
  join is "all rows where owner == X."
- CKAN datastore supports SQL (`/api/3/action/datastore_search_sql?sql=...`) and field search
  (`datastore_search`) — confirm the live `resource_id`s for MPROP / permits / zoning first
  (curl-before-commit, like Phase 0). The journal notes CKAN access was confirmed during
  discovery; re-verify the resource ids are still live.
- **Hero address: `2700 W. Wisconsin Avenue`** (the Denise scenario — RT4→commercial rezone,
  demolition permit filed 3 weeks prior). Acceptance verifies on this + a second real address.

## Brainstorm first (this issue is genuinely fuzzy — settle before coding)

1. **Live CKAN vs Convex snapshot per tool.** PRD says MPROP/zoning can be live-ish; permits
   are a **monthly Convex snapshot with the refresh date disclosed in the output** (acceptance
   requires the snapshot date be labeled). Decide which tools hit CKAN live vs read a snapshot,
   and where the snapshot loader lives (a `scripts/snapshot-*.mjs` like the seed/poller scripts).
2. **address → TAXKEY resolution.** MPROP keys on TAXKEY/address; addresses on agendas are
   free text. `check_zoning`/`lookup_parcel` take an address. Decide the match strategy
   (normalize + CKAN address search) — **geocoding fallback is explicitly out of scope** ("lives
   in its own concern"), so don't pull in the Census Geocoder here.
3. **"Add to watchlist?" quick-action.** The `watches` table + `/gavel watch` already exist
   (MOO-46/MOO-53 path). Decide how a parcel/owner result surfaces the action — an MCP tool can't
   post Block Kit, so this is likely a hint in the tool's text output + the agent offering it,
   or a Block Kit affordance on the agent side. Don't overbuild.
4. **Ownership-portfolio shape.** PRD shows "14 parcels" — decide the cap/format and how it reads
   in a Slack thread (the receipts tool / render_receipt may help present it).

## Acceptance (from MOO-50)

- `lookup_parcel(address)` → TAXKEY, zoning district, owner (MPROP)
- `get_permits(address|taxkey, since)` — from a Convex snapshot, **source refresh date disclosed**
- `get_ownership_portfolio(owner_name)` → all parcels for an owner/LLC (MPROP join)
- `check_zoning(address)` → current district
- "Add to watchlist?" quick-action exposed on the parcel result

**Verify (real data):** run on `2700 W. Wisconsin` + a second real address, paste results;
ownership-portfolio count checked against MPROP for a known LLC; permit snapshot date labeled.
**Out of scope:** `get_violations` (stretch, first to cut); geocoding fallback.

`blockedBy` MOO-47 ✅ (done). `blocks` MOO-55 (zoning RAG — which needs address→district, so
`check_zoning`/`lookup_parcel` here is the foundation MOO-55 builds on).

## ⚠️ Worktree + deploy checklist (two real outages came from skipping this)

`git worktree add` off `origin/main` → in **`mcp-server/`**: `npm ci` + `node --test` baseline
(this server has its OWN package.json — don't only set up `agent/`) → for anything touching the
Bolt app or Convex, also do `agent/` setup: `npm ci`, copy `.env`+`.env.local`, **`npx convex
dev --once`** (gitignored `_generated` is image-baked). Verify deploys via `fly releases` /
machine uptime — NOT the deploy exit code. See memory `convex-codegen-before-deploy`.

## ⚠️ Standing human items (pinned, not blockers)

1. **Rotate the chat-pasted Slack tokens** — `agent/.env` + Fly secrets on BOTH apps.
2. **MOO-43 ES fluency review** — `cd agent && node scripts/bilingual-verify.mjs`.
3. **MOO-54 judge-account walkthrough** — confirm a guest account sees the seeded public channels.
4. **Slack is org-wide Enterprise Grid** — `conversations.list/create` need `team_id=T0B8KS540G4`;
   no `channels:manage`/`pins:write` on either token. See memory `slack-grid-scopes`. (Only
   relevant if a parcel tool ever touches channel APIs — the MCP tools shouldn't.)

## Deadline: July 13, 2026.

After MOO-50, the demo's remaining unbuilt hero beat is **MOO-55 (zoning RAG)**; the finish line
is the P0 submission trio **MOO-62** (demo video, now unblocked by MOO-54), **MOO-61** (architecture
diagram), **MOO-63** (Devpost package). `MOO-52` (escalation ping) is labeled **protected** (can't
cut) and is cheap — a `MatterHistory` diff the poller already pulls.
