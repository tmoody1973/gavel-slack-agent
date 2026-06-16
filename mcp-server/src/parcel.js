// CKAN parcel client for data.milwaukee.gov — the parcel layer of the Civic MCP
// server. MPROP (daily, ~160k properties) is queried live, like the Legistar
// tools; permits come from the buildingpermits dataset (monthly) and the output
// discloses that refresh cadence. `fetch` is injected so query/mapping logic is
// unit-tested and only the verify script touches the network.

import { normalizeAddress } from './address.js';

export const MPROP_RESOURCE = '0a2c7f31-cd15-4151-8222-09dd57d5f16d';
export const PERMITS_RESOURCE = '828e9630-d7cb-42e4-960e-964eae916397';
const CKAN_BASE = 'https://data.milwaukee.gov/api/3/action';
const PERMITS_REFRESH = 'monthly';
const PORTFOLIO_DEFAULT_LIMIT = 25;
const PERMITS_LIMIT = 50;

/**
 * Double single quotes. CKAN's datastore_search_sql is read-only (SELECT-only,
 * over public open data), but interpolated owner/address strings must not be able
 * to break out of the string literal.
 */
export function sqlEscape(value) {
  return String(value).replace(/'/g, "''");
}

/**
 * Escape LIKE/ILIKE metacharacters (`%` `_` and the `\` escape char) so user
 * input matches literally — the surrounding `%` wildcards we add stay active.
 * Postgres treats `\` as the default LIKE escape. Compose with sqlEscape.
 */
export function escapeLike(value) {
  return String(value).replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** Parse an MPROP numeric column ("3628.00000", "5") to a Number, or null when empty/absent. */
function numericOrNull(value) {
  return value !== '' && value != null ? Number(value) : null;
}

/** Normalize a raw MPROP row to the fields the agent reads. */
export function mapParcel(raw) {
  const owners = [raw.OWNER_NAME_1, raw.OWNER_NAME_2, raw.OWNER_NAME_3].map((n) => (n ? n.trim() : '')).filter(Boolean);
  return {
    taxkey: raw.TAXKEY,
    address: parcelAddress(raw),
    zoning: raw.ZONING || null,
    landUse: raw.LAND_USE_GP || null,
    district: raw.GEO_ALDER || null,
    owner: owners.join(' / ') || null,
    assessedValue: numericOrNull(raw.C_A_TOTAL),
    // Lot/building/density fields — MPROP carries these; they feed the
    // "what can be built here?" reasoning (lot area vs. zoning's min-lot-per-unit).
    // Width/depth/frontage are NOT in MPROP (plat-only); CORNER_LOT is unpopulated.
    lotArea: numericOrNull(raw.LOT_AREA),
    buildingArea: numericOrNull(raw.BLDG_AREA),
    numUnits: numericOrNull(raw.NR_UNITS),
    yearBuilt: numericOrNull(raw.YR_BUILT),
    stories: numericOrNull(raw.NR_STORIES),
    razeStatus: raw.RAZE_STATUS ? raw.RAZE_STATUS.trim() : null,
    hasOpenViolation: Boolean(raw.BI_VIOL && String(raw.BI_VIOL).trim()),
  };
}

/** Normalize a raw buildingpermits row. recordId + address feed the watch sweep. */
export function mapPermit(raw) {
  return {
    recordId: raw['Record ID'] ?? null,
    address: raw.Address ?? null,
    date: raw['Date Opened'] ?? null,
    type: raw['Permit Type'] ?? null,
    status: raw.Status ?? null,
    cost: raw['Construction Total Cost'] ?? null,
    use: raw['Use of Building'] ?? null,
  };
}

function parcelAddress(raw) {
  return [raw.HOUSE_NR_LO, raw.SDIR, raw.STREET, raw.STTYPE].filter(Boolean).join(' ');
}

/** The "HOUSE SDIR STREET STTYPE" prefix permits index their free-text Address by. */
function addressPrefix(parts) {
  return [parts.houseNr, parts.sdir, parts.street, parts.sttype].filter(Boolean).join(' ');
}

// Match on house number + street only. Directional (SDIR) and street type
// (STTYPE) are NOT hard filters — residents routinely get Milwaukee's N/S/E/W
// wrong (e.g. "E Chambers" when it's "W Chambers"), and a wrong directional
// shouldn't return zero results. They become ranking hints in pickBest instead.
// `fuzzy` switches the street to a prefix ILIKE to tolerate singular/plural and
// minor spelling ("Chamber" → "CHAMBERS").
function candidateWhere(parts, { fuzzy = false } = {}) {
  const house = `"HOUSE_NR_LO" = '${sqlEscape(parts.houseNr)}'`;
  const street = fuzzy
    ? `"STREET" ILIKE '${sqlEscape(escapeLike(parts.street))}%'`
    : `"STREET" = '${sqlEscape(parts.street)}'`;
  return `${house} AND ${street}`;
}

/**
 * Choose the best parcel among same-house-number candidates: prefer the one
 * matching the requested directional, then street type; otherwise return the
 * first (so a wrong/omitted directional still resolves — the mapped `address`
 * shows the canonical one, e.g. "1108 W CHAMBERS ST").
 */
export function pickBest(rows, parts) {
  if (rows.length <= 1) return rows[0];
  let pool = rows;
  if (parts.sdir) {
    const byDir = pool.filter((r) => (r.SDIR || '') === parts.sdir);
    if (byDir.length) pool = byDir;
  }
  if (parts.sttype) {
    const byType = pool.filter((r) => (r.STTYPE || '') === parts.sttype);
    if (byType.length) pool = byType;
  }
  return pool[0];
}

export function createParcelClient({ fetch, userAgent, baseUrl = CKAN_BASE }) {
  const headers = { 'User-Agent': userAgent, Accept: 'application/json' };

  async function runSql(sql) {
    const res = await fetch(`${baseUrl}/datastore_search_sql?sql=${encodeURIComponent(sql)}`, { headers });
    if (!res.ok) throw new Error(`CKAN request failed: ${res.status}`);
    const body = await res.json();
    return body.result?.records ?? [];
  }

  function partsOrThrow(address) {
    const parts = normalizeAddress(address);
    if (!parts) throw new Error(`unrecognized address: ${address}`);
    return parts;
  }

  async function lookupParcel(address) {
    const parts = partsOrThrow(address);
    let rows = await runSql(`SELECT * FROM "${MPROP_RESOURCE}" WHERE ${candidateWhere(parts)} LIMIT 25`);
    if (rows.length === 0) {
      rows = await runSql(`SELECT * FROM "${MPROP_RESOURCE}" WHERE ${candidateWhere(parts, { fuzzy: true })} LIMIT 25`);
    }
    return rows.length ? mapParcel(pickBest(rows, parts)) : null;
  }

  async function checkZoning(address) {
    const parcel = await lookupParcel(address);
    return parcel ? { address: parcel.address, zoning: parcel.zoning, district: parcel.district } : null;
  }

  async function getOwnershipPortfolio(ownerName, { limit = PORTFOLIO_DEFAULT_LIMIT, match = 'exact' } = {}) {
    const predicate =
      match === 'contains'
        ? `"OWNER_NAME_1" ILIKE '%${sqlEscape(escapeLike(ownerName))}%'`
        : `"OWNER_NAME_1" = '${sqlEscape(ownerName)}'`;
    const countRows = await runSql(`SELECT COUNT(*) AS n FROM "${MPROP_RESOURCE}" WHERE ${predicate}`);
    const rows = await runSql(
      `SELECT "TAXKEY","HOUSE_NR_LO","SDIR","STREET","STTYPE","ZONING" FROM "${MPROP_RESOURCE}" WHERE ${predicate} ORDER BY "STREET","HOUSE_NR_LO" LIMIT ${Number(limit)}`,
    );
    return {
      owner: ownerName,
      totalParcels: Number(countRows[0]?.n ?? 0),
      shown: rows.length,
      parcels: rows.map((r) => ({ taxkey: r.TAXKEY, address: parcelAddress(r), zoning: r.ZONING || null })),
    };
  }

  async function getPermits(address, { since } = {}) {
    const parts = partsOrThrow(address);
    const clauses = [`"Address" ILIKE '${sqlEscape(escapeLike(addressPrefix(parts)))}%'`];
    if (since) clauses.push(`"Date Opened" >= '${sqlEscape(since)}'`);
    const rows = await runSql(
      `SELECT * FROM "${PERMITS_RESOURCE}" WHERE ${clauses.join(' AND ')} ORDER BY "Date Opened" DESC LIMIT ${PERMITS_LIMIT}`,
    );
    return {
      address: addressPrefix(parts),
      source: `Milwaukee buildingpermits (${PERMITS_REFRESH} refresh)`,
      permits: rows.map(mapPermit),
    };
  }

  return { lookupParcel, checkZoning, getOwnershipPortfolio, getPermits };
}
