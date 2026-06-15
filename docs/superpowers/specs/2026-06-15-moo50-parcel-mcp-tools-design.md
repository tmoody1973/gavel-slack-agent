# MOO-50 — Parcel MCP Tools Design

_Design spec · 2026-06-15 · Linear MOO-50 (High, Phase 3; blockedBy MOO-47 ✅; blocks MOO-55)._

## Intent

The "who's behind this?" layer: join an agenda address → owner → full portfolio → permits →
zoning, as four tools on the standalone Milwaukee Civic MCP server (`mcp-server/`).

## Curl-before-commit findings (verified against the live CKAN API, 2026-06-15)

`data.milwaukee.gov` runs **CKAN**; `datastore_search_sql` works for every query below.

- **MPROP** (Master Property Record) — resource `0a2c7f31-cd15-4151-8222-09dd57d5f16d`, **daily**,
  ~160k rows. One table carries everything three tools need:
  - Address is split: `HOUSE_NR_LO` (text), `SDIR` (N/S/E/W), `STREET` (e.g. `13TH`, `WISCONSIN`),
    `STTYPE` (e.g. `ST`, `AV`). All uppercase/abbreviated. `HOUSE_NR_LO` is **text** → CAST for ranges.
  - `TAXKEY`, `ZONING` (e.g. RT4), `LAND_USE_GP`, `GEO_ALDER` (aldermanic district), `OWNER_NAME_1..3`,
    `OWNER_MAIL_ADDR`, `C_A_TOTAL` (assessed value), `BI_VIOL`, `RAZE_STATUS`.
- **buildingpermits** — resource `828e9630-d7cb-42e4-960e-964eae916397`, **monthly**, datastore_active.
  Fields: `Date Opened`, `Address` (free text), `Record ID`, `Permit Type`, `Status`, `Date Issued`,
  `Construction Total Cost`, `Use of Building`, `Dwelling units impact`. Joins by the `Address` string.
- **Ownership portfolio works**: `GROUP BY "OWNER_NAME_1"` returns real counts — VB ONE LLC → 186,
  **BERRADA PROPERTIES 24/36/134 LLC** (a serial-shell landlord → the "shells" demo beat).
- **Hero address 2700 W Wisconsin is NOT a parcel** (2701 is a state office). Real demo anchors:
  - **`2000 S 13th St`** → TAXKEY `4680453000`, owner **SHAAN REAL ESTATE INC**, ZONING RT4,
    GEO_ALDER **12** — the same entity seeded into `#clarke-square` (Punta Cana thread), so the
    demo chains community-memory → `lookup_parcel` → `get_ownership_portfolio`.
  - a **BERRADA PROPERTIES** address for the multi-shell portfolio showcase.

## Decisions (locked with the user, 2026-06-15)

1. **MPROP queried live** (daily, fast SQL) — no Convex snapshot. Consistent with the live Legistar tools.
2. **`get_permits` queries buildingpermits live too** and **discloses the monthly refresh cadence** in
   output — a documented deviation from the acceptance's "served from a Convex snapshot." Same outcome
   (disclosed staleness), simpler, keeps the MCP server **decoupled from Convex**. Linear acceptance
   to be updated on close.
3. **Demo anchors:** `2000 S 13th St` (primary, ties to the seeded thread) + a BERRADA address (portfolio).
4. **"Add to watchlist?"** = a text hint in the tool output (`To track this owner citywide: /gavel watch
   "SHAAN REAL ESTATE INC"`). An MCP tool can't post Block Kit; the agent offers it via the existing watch path.

## Architecture (mirror the existing MCP server: pure fns + injected-fetch client + registrar)

- **`mcp-server/src/address.js`** — pure normalizer (the TDD core). `normalizeAddress("2000 S 13th St")`
  → `{ houseNr:'2000', sdir:'S', street:'13TH', sttype:'ST' }`. Uppercases; maps directionals
  (N/S/E/W, NORTH→N…); street types (AVENUE/AVE→AV, STREET/ST→ST, BLVD→BL, etc.); ordinals
  (`13th`→`13TH`). Returns `null`/throws-handled for unparseable input.
- **`mcp-server/src/parcel.js`** — `createParcelClient({ fetch, userAgent, baseUrl })` over CKAN
  `datastore_search_sql`. Methods: `lookupParcel(address)`, `checkZoning(address)`,
  `getOwnershipPortfolio(ownerName, {limit, match})`, `getPermits(address, {since})`. Pure mappers
  `mapParcel`/`mapPermit`. **`sqlEscape(s)` doubles single quotes** (the endpoint is read-only SELECT
  over public data, but user-supplied owner/address strings are interpolated → escape, and unit-test it).
  Resource ids as named constants.
- **`mcp-server/src/parcel-tools.js`** — `registerParcelTools(server, parcel)`; four `tool(...)` entries
  mirroring `tools.js` (zod `inputSchema`, `safeCall`+`text` wrapper, `information_unavailable` on miss).
- **`mcp-server/src/server.js`** — create the parcel client + `registerParcelTools(server, parcel)`
  alongside the Legistar registration.

## Tool contracts

| Tool | Input | Returns |
|---|---|---|
| `lookup_parcel` | `address` | `{ taxkey, address, zoning, landUse, district (GEO_ALDER), owner, assessedValue, razeStatus, hasOpenViolation, watchHint }` or `information_unavailable` |
| `check_zoning` | `address` | `{ address, zoning, district }` |
| `get_ownership_portfolio` | `owner_name`, `limit?`, `match?('exact'\|'contains')` | `{ owner, totalParcels, shown, parcels:[{taxkey,address,zoning}], watchHint }` (capped; total reported) |
| `get_permits` | `address`, `since?` | `{ address, source:'Milwaukee buildingpermits (monthly refresh)', permits:[{date,type,status,cost,use}] }` |

## Testing (TDD, `mcp-server/test/`, `node --test`)

- `test/address.test.js` — the normalizer: directionals, street-type abbreviations, ordinals, casing,
  `2000 S 13th St`/`2616 W Wisconsin Ave` → correct parts; junk input handled.
- `test/parcel.test.js` — `sqlEscape` doubles quotes (injection guard); `mapParcel`/`mapPermit` shape;
  client builds the expected SQL and parses `{result:{records}}` (fake `fetch`); empty result →
  `information_unavailable`-friendly null.
- `test/parcel-tools.test.js` — registers the 4 tools; success returns JSON text; client throw degrades
  to `information_unavailable` (mirror `tools.test.js` harness).

## Verification (against reality — the Linear checklist)

- Run `lookup_parcel` + `get_ownership_portfolio` on **`2000 S 13th St`** (→ SHAAN REAL ESTATE INC) and a
  **BERRADA** address; paste real output. Portfolio count cross-checked against a direct MPROP `GROUP BY`.
- `get_permits` output labels the **monthly** refresh source.
- `mcp-server` `node --test` green; biome clean; `scripts/mcp-verify.mjs` still passes.

## Out of scope (held)

`get_violations` (stretch — though `BI_VIOL`/`RAZE_STATUS` ride along in `lookup_parcel` for free);
geocoding fallback (its own concern — no Census Geocoder here); Convex snapshotting.
