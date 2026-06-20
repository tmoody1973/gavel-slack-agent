// Plain-language geography (MOO-131 · Discovery 2). People know their neighborhood
// ("Riverwest", "Bay View", "Clarke Square"), not their aldermanic district number.
// This is the legibility layer over the existing `boundary:{type:'district'}` mechanic
// — the geo sibling of MOO-121's topic chips: a citizen picks a neighborhood and Gavel
// resolves the district behind the scenes.
//
// Pure and deterministic (no I/O, no Slack/Convex) so it's the testable seam the
// onboarding picker and later display surfaces consume. The neighborhood↔district map
// is the only new data; the alderperson + contact JOIN the canonical council directory
// by district number (single source of truth — it carries email/phone/headshot/webpage).
//
// INVARIANT: matching stays district-level. This does NOT classify agenda items by
// neighborhood (titles rarely name a neighborhood); it powers the INPUT side (how a user
// expresses their area) and the DISPLAY side (humanizing district numbers). Per-address
// classification is the Census Geocoder path — deliberately out of scope.

import councilMembers from '../data/milwaukee-council-members.json' with { type: 'json' };
import districtNeighborhoods from '../data/milwaukee-neighborhoods.json' with { type: 'json' };

/** Lowercase, strip diacritics, drop apostrophes, collapse other punctuation → a
 * forgiving lookup key. Apostrophes are removed (not spaced) so "brewers hill"
 * matches "Brewer's Hill". */
function normalize(name) {
  return (name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

// Built once at module load: normalized neighborhood name → district number, and the
// ordered choice list. The source map is keyed by district-number string.
const districtByNeighborhood = new Map();
const choices = [];
for (const [districtKey, names] of Object.entries(districtNeighborhoods)) {
  const district = Number(districtKey);
  for (const name of names) {
    districtByNeighborhood.set(normalize(name), district);
    choices.push({ name, district });
  }
}
choices.sort((a, b) => a.name.localeCompare(b.name));

const alderpersonByDistrict = new Map(councilMembers.map((member) => [member.district, member]));

/**
 * The aldermanic district for a neighborhood name, or null. Case/diacritic/
 * punctuation-insensitive, so both the picker's exact value and free text resolve.
 * @param {string} [name]
 * @returns {number | null}
 */
export function districtForNeighborhood(name) {
  return districtByNeighborhood.get(normalize(name)) ?? null;
}

/**
 * The neighborhoods in a district (the data's exact strings), or []. Accepts a
 * number or a numeric string.
 * @param {number | string} district
 * @returns {string[]}
 */
export function neighborhoodsForDistrict(district) {
  return districtNeighborhoods[String(district)] ?? [];
}

/**
 * The council member for a district, joined from the canonical council directory
 * (name, title, email, phone_number, image_url, webpage), or null.
 * @param {number | string} district
 * @returns {object | null}
 */
export function alderpersonForDistrict(district) {
  return alderpersonByDistrict.get(Number(district)) ?? null;
}

/**
 * Every neighborhood with its district, sorted by name — the picker's option source.
 * Returns fresh objects so callers can't mutate the module's state.
 * @returns {Array<{ name: string, district: number }>}
 */
export function neighborhoodChoices() {
  return choices.map((choice) => ({ ...choice }));
}
