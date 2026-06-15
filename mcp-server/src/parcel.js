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
    assessedValue: raw.C_A_TOTAL !== '' && raw.C_A_TOTAL != null ? Number(raw.C_A_TOTAL) : null,
    razeStatus: raw.RAZE_STATUS ? raw.RAZE_STATUS.trim() : null,
    hasOpenViolation: Boolean(raw.BI_VIOL && String(raw.BI_VIOL).trim()),
  };
}

/** Normalize a raw buildingpermits row. */
export function mapPermit(raw) {
  return {
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

function parcelWhere(parts) {
  const clauses = [`"HOUSE_NR_LO" = '${sqlEscape(parts.houseNr)}'`, `"STREET" = '${sqlEscape(parts.street)}'`];
  if (parts.sdir) clauses.push(`"SDIR" = '${sqlEscape(parts.sdir)}'`);
  if (parts.sttype) clauses.push(`"STTYPE" = '${sqlEscape(parts.sttype)}'`);
  return clauses.join(' AND ');
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
    const rows = await runSql(`SELECT * FROM "${MPROP_RESOURCE}" WHERE ${parcelWhere(parts)} LIMIT 1`);
    return rows.length ? mapParcel(rows[0]) : null;
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
