# Build Handoff — next: MOO-52 escalation ping (or MOO-53 watch sweep) · finish-line

_Clean-context handoff. Written 2026-06-16 after consolidating MOO-110 + MOO-55 to main,
shipping MOO-112 (parcel-lookup modal), and a live-hardening pass on the agent._

**Read first, in order:** this doc → `CLAUDE.md` (per-issue loop + Linear sync) → re-auth Linear
(`linear auth`) → `build MOO-52` (recommended) or the chosen issue.

---

## Where the project stands (2026-06-16)

`main` is at **`31459fa`** + (pending) the MOO-112 merge. **gavel-app is deployed at v21.** Recent work:

- **MOO-110 (parcel card)** — merged (PR #20), **Done**. Block Kit card via `render_receipt` `parcel` type: Maps deep-link + watchlist button.
- **MOO-55 (zoning RAG)** — merged (PR #21), **Done**. `ask_zoning_code` over Ch.295 (116 chunks in Convex `zoningChunks`, 31/31 in-scope retrieval). Rode along: **Sonnet 4.6 pin, 4GB VM, MPROP lot/unit fields, robust address matching, no-fabricated-URLs prompt guard.**
- **MOO-112 (parcel-lookup modal + property-card field grid)** — **In Review (PR #22)**, deployed v21. App Home "🔎 Look up a property" button + `/gavel parcel`; in-modal result; 2-col field grid.

**The demo chain now works end-to-end:** RTS surfaces a seeded thread → `lookup_parcel`/parcel card (owner, zoning, **lot size, units**) → `ask_zoning_code` ("what could they build on this 7,626 sq ft RT4 lot?") with `§295-NNN` citations → walk-on/agenda-change detectors → bilingual alerts.

## ⚠️ Open verification (human, quick — do these first)

Against deployed **gavel-app v21**:
1. **MOO-112 modal** — App Home → "🔎 Look up a property" → `1108 e chambers st` → property card renders in the modal (**1108 W CHAMBERS ST · RT4 · 7,626 sq ft · 2 units**); "Look up another" loops; a bad address shows the inline error. `/gavel parcel 1108 e chambers st` posts the card. → then **merge PR #22** and close MOO-112.
2. **MOO-55 ES path** — one Spanish zoning DM (`¿qué puedo construir en 2000 S 13th St?`) → accurate ES answer with EN `§295-NNN` citations.
3. **MOO-43 ES fluency** — native-speaker review (`cd agent && node scripts/bilingual-verify.mjs`) — standing item.

## ▶ RECOMMENDED NEXT: MOO-52 — Escalation ping (committee → Council)

**`protected` (can't-cut), P1, Phase 3, unblocked.** Poller diffs `MatterHistory` for a watched
matter's committee→full-Council transition → posts an escalation ping (link back to the original
alert + new hearing). Strengthens the insider-knowledge beat next to the MOO-51 walk-on detector.
Poller-side (builds on the MOO-41 spine; runs on **gavel-poller**, not gavel-app). See the data
reference for `MatterHistory` shape. Out of scope: watchlist sweeps (MOO-53), agenda-change (MOO-51, done).

## ALTERNATIVE A: MOO-53 — Watchlists daily sweep (`cuttable`, high synergy)

Closes the loop on the watch buttons we just shipped: today `/gavel watch`, the parcel card, and the
App Home all write to Convex `watches`, but **nothing sweeps them** → no alert ever fires. MOO-53 adds
a daily poller pass diffing new matters/permits against watched names → alert the watching channel.
Makes the watch UX actually do something. Also poller-side.

## ALTERNATIVE B: the finish line (Phase 5, all P0/Urgent)

- **MOO-61** — architecture diagram (three-memory model) — agent-buildable.
- **MOO-62** — record the 3-min demo video (hero beats now exist; gate on the open verification above).
- **MOO-63** — Devpost submission package (Agent for Good; judge sandbox to slackhack@salesforce.com).

## ⚠️ Deploy + ops facts (learned the hard way this session)

- **gavel-app (interactive agent) deploys from the REPO ROOT:** `fly deploy -c fly.app.toml -a gavel-app --remote-only`. **Do NOT** `fly deploy` from `agent/` — `agent/fly.toml` is the **gavel-poller** config (supercronic), and deploying it to gavel-app turns the agent into a cron runner (happened once; caught via boot logs).
- **gavel-app runs `node app.js` (Socket Mode) as the non-root `node` user, on `shared-cpu-2x` / 4GB.** The Claude Code CLI subprocess heap hit ~1.6GB and OOM-killed at 512MB **and** 2GB — 4GB is required. Verify deploys via `fly logs -a gavel-app` showing `bolt-app Gavel is running!` + a Socket Mode `hello`, NOT the deploy exit code ("good state" lies for Socket Mode).
- **Agent model is pinned to `claude-sonnet-4-6`** in `agent/agent/agent.js` (the SDK defaulted to slow Opus). Override with the `GAVEL_AGENT_MODEL` env/secret — no code change.
- **Secrets on gavel-app:** `ANTHROPIC_API_KEY`, `OPENAI_API_KEY` (zoning embeddings), `CONVEX_URL`, `SLACK_BOT/APP/USER_TOKEN`.
- **gavel-poller** (cron): `fly deploy --remote-only` from `agent/`; supercronic `*/5` poll + Sunday digest.

## Parcel/address facts (MOO-50 robustness, this session)

- `lookup_parcel` now tolerates wrong N/S/E/W directional, trailing ZIP, and singular/plural — matches house+street, ranks by directional/type (`pickBest`), prefix-ILIKE fallback. `1108 e chambers st` → **1108 W CHAMBERS ST**.
- `mapParcel` exposes `lotArea`, `buildingArea`, `numUnits`, `yearBuilt`, `stories` (MPROP has them; width/depth/frontage are plat-only; `CORNER_LOT` is unpopulated).
- Zoning re-ingest if Ch.295 changes: `cd agent && node scripts/ingest-zoning.mjs` (needs local PDFs in `agent/data/zoning/` — gitignored; the city WAF blocks automated fetch, so use browser-downloaded copies). Eval: `node scripts/zoning-eval.mjs`.

## Session bookkeeping

Stale worktrees on disk (removable once their PRs are merged): `moo-76-ux-d`, `moo-110-parcel-card`,
`moo-55-zoning-rag`, `moo-112-parcel-modal`. Standing item: **rotate the chat-pasted Slack tokens**
(`agent/.env` + Fly secrets on both apps). **Deadline: July 13, 2026.**
