// Pure address normalizer: turn a free-text street address into the parts MPROP
// stores it as. MPROP splits the address across HOUSE_NR_LO / SDIR / STREET /
// STTYPE, all uppercase and abbreviated (verified codes from the live dataset).
// Geocoding is explicitly out of scope (its own concern) — this is string parsing.

const DIRECTIONALS = { N: 'N', S: 'S', E: 'E', W: 'W', NORTH: 'N', SOUTH: 'S', EAST: 'E', WEST: 'W' };

// Trailing tokens to drop before parsing — a ZIP ("...CHAMBERS ST 53206") or a
// state ("... WI 53206") otherwise gets swallowed into the street name.
const STATE_TOKENS = new Set(['WI', 'WISCONSIN']);

// Spelled-out / common abbreviation → the exact MPROP STTYPE code.
const STREET_TYPES = {
  STREET: 'ST',
  ST: 'ST',
  AVENUE: 'AV',
  AVE: 'AV',
  AV: 'AV',
  PLACE: 'PL',
  PL: 'PL',
  DRIVE: 'DR',
  DR: 'DR',
  ROAD: 'RD',
  RD: 'RD',
  BOULEVARD: 'BL',
  BLVD: 'BL',
  BL: 'BL',
  COURT: 'CT',
  CT: 'CT',
  TERRACE: 'TR',
  TERR: 'TR',
  TER: 'TR',
  TR: 'TR',
  LANE: 'LA',
  LN: 'LA',
  LA: 'LA',
  CIRCLE: 'CR',
  CIR: 'CR',
  CR: 'CR',
  PARKWAY: 'PK',
  PKWY: 'PK',
  PKY: 'PK',
  PK: 'PK',
  WAY: 'WA',
  WA: 'WA',
};

/**
 * @param {string} address free text, e.g. "2000 S 13th St"
 * @returns {{ houseNr: string, sdir?: string, street: string, sttype?: string } | null}
 *   null when there is no leading house number or no street name to match on.
 */
export function normalizeAddress(address) {
  if (typeof address !== 'string') return null;
  const tokens = address.toUpperCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim().split(' ');

  while (tokens.length > 1 && (/^\d{5}$/.test(tokens.at(-1)) || STATE_TOKENS.has(tokens.at(-1)))) {
    tokens.pop();
  }

  const houseNr = tokens.shift();
  if (!houseNr || !/^\d+$/.test(houseNr)) return null;

  const result = { houseNr };

  if (tokens.length > 1 && DIRECTIONALS[tokens[0]]) {
    result.sdir = DIRECTIONALS[tokens.shift()];
  }
  if (tokens.length > 1 && STREET_TYPES[tokens[tokens.length - 1]]) {
    result.sttype = STREET_TYPES[tokens.pop()];
  }

  const street = tokens.join(' ');
  if (!street) return null;
  result.street = /^\d+$/.test(street) ? ordinalize(street) : street;

  return result;
}

/** "13" → "13TH", "1" → "1ST" — MPROP stores numbered streets with the ordinal suffix. */
function ordinalize(number) {
  const n = Number(number);
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}TH`;
  const suffix = { 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] ?? 'TH';
  return `${n}${suffix}`;
}
