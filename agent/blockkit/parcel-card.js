/**
 * Parcel receipt: the "who's behind this?" card for a single property, built
 * from the MOO-50 MCP parcel result (mapParcel shape). Glanceable owner/zoning/
 * district + a keyless Google Maps deep-link and a real "Add to watchlist"
 * button. No API key leaves the server (the map is a public search URL), and no
 * per-user data is stored — the watch button carries only the address.
 * @param {{
 *   address: string, owner?: string|null, zoning?: string|null,
 *   district?: string|null, assessedValue?: number|null,
 *   razeStatus?: string|null, hasOpenViolation?: boolean
 * }} parcel
 * @returns {object[]}
 */
export function parcelCard(parcel) {
  const heading = parcel.owner ? `*${parcel.address}*\n🏢 Owner: ${parcel.owner}` : `*${parcel.address}*`;
  const blocks = [{ type: 'section', text: { type: 'mrkdwn', text: heading } }];

  const meta = [
    parcel.zoning && `Zoning: ${parcel.zoning}`,
    parcel.district && `District ${parcel.district}`,
    parcel.assessedValue != null && `Assessed: $${Number(parcel.assessedValue).toLocaleString('en-US')}`,
  ]
    .filter(Boolean)
    .join(' · ');
  if (meta) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: meta }] });
  }

  const flags = [
    parcel.hasOpenViolation && '⚠️ Open building violation',
    parcel.razeStatus && `🚧 Raze: ${parcel.razeStatus}`,
  ].filter(Boolean);
  if (flags.length > 0) {
    blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: flags.join(' · ') }] });
  }

  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: 'parcel_open_map',
        text: { type: 'plain_text', text: '🗺️ Open in Google Maps', emoji: true },
        url: googleMapsSearchUrl(parcel.address),
      },
      {
        type: 'button',
        action_id: 'parcel_watch',
        text: { type: 'plain_text', text: '👁 Add to watchlist', emoji: true },
        value: parcel.address,
        style: 'primary',
      },
    ],
  });

  return blocks;
}

/** Keyless Maps deep link; ", Milwaukee, WI" disambiguates the bare MPROP address. */
function googleMapsSearchUrl(address) {
  const query = encodeURIComponent(`${address}, Milwaukee, WI`);
  return `https://www.google.com/maps/search/?api=1&query=${query}`;
}
