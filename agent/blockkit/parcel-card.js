/**
 * Property card: the "who's behind this / what's here?" card for one parcel,
 * built from the MOO-50 MCP parcel result (mapParcel shape). A header + owner
 * line + a two-column field grid (lot size, building, units, year, assessed) +
 * violation/raze flags + a keyless Google Maps deep-link and a real "Add to
 * watchlist" button. No API key leaves the server (the map is a public search
 * URL); the watch button carries only the address (no per-user data).
 * @param {{
 *   address: string, owner?: string|null, zoning?: string|null, district?: string|null,
 *   assessedValue?: number|null, lotArea?: number|null, buildingArea?: number|null,
 *   numUnits?: number|null, yearBuilt?: number|null, stories?: number|null,
 *   razeStatus?: string|null, hasOpenViolation?: boolean, taxkey?: string|null
 * }} parcel
 * @param {{ includeWatch?: boolean }} [options] watch is channel-scoped; omit it
 *   in channel-less surfaces (e.g. the App Home lookup modal).
 * @returns {object[]}
 */
export function parcelCard(parcel, { includeWatch = true } = {}) {
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `🏠 ${parcel.address}`.slice(0, 150), emoji: true } },
  ];

  const zoningLine = [parcel.zoning, parcel.district && `District ${parcel.district}`].filter(Boolean).join(' · ');
  const summary = [parcel.owner && `🏢 *${parcel.owner}*`, zoningLine].filter(Boolean).join('\n');
  if (summary) {
    blocks.push({ type: 'section', text: { type: 'mrkdwn', text: summary } });
  }

  const fields = [
    parcel.lotArea != null && field('Lot size', `${fmt(parcel.lotArea)} sq ft`),
    parcel.buildingArea != null && field('Building', `${fmt(parcel.buildingArea)} sq ft`),
    parcel.numUnits != null && field('Units', String(parcel.numUnits)),
    parcel.yearBuilt != null && field('Built', builtText(parcel)),
    parcel.assessedValue != null && field('Assessed value', `$${fmt(parcel.assessedValue)}`),
  ].filter(Boolean);
  if (fields.length > 0) {
    blocks.push({ type: 'section', fields: fields.slice(0, 10) });
  }

  const flags = [
    parcel.hasOpenViolation && '⚠️ Open building violation',
    parcel.razeStatus && `🚧 Raze: ${parcel.razeStatus}`,
  ].filter(Boolean);
  if (flags.length > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: flags.join(' · ') }] });
  }

  const actions = [
    {
      type: 'button',
      action_id: 'parcel_open_map',
      text: { type: 'plain_text', text: '🗺️ Open in Google Maps', emoji: true },
      url: googleMapsSearchUrl(parcel.address),
    },
  ];
  if (includeWatch) {
    actions.push({
      type: 'button',
      action_id: 'parcel_watch',
      text: { type: 'plain_text', text: '👁 Add to watchlist', emoji: true },
      value: parcel.address,
      style: 'primary',
    });
  }
  blocks.push({ type: 'actions', elements: actions });

  const source = parcel.taxkey
    ? `Source: City of Milwaukee property records (MPROP) · live · tax key ${parcel.taxkey}`
    : 'Source: City of Milwaukee property records (MPROP) · live';
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: source }] });

  return blocks;
}

/** A two-column grid cell. */
function field(label, value) {
  return { type: 'mrkdwn', text: `*${label}*\n${value}` };
}

function builtText(parcel) {
  if (parcel.stories == null) return String(parcel.yearBuilt);
  const stories = `${parcel.stories} ${parcel.stories === 1 ? 'story' : 'stories'}`;
  return `${parcel.yearBuilt} · ${stories}`;
}

/** US-grouped integer, e.g. 3628 → "3,628". */
function fmt(number) {
  return Number(number).toLocaleString('en-US');
}

/** Keyless Maps deep link; ", Milwaukee, WI" disambiguates the bare MPROP address. */
function googleMapsSearchUrl(address) {
  const query = encodeURIComponent(`${address}, Milwaukee, WI`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
