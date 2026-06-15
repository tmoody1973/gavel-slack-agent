// MOO-110 live verify: real lookup_parcel (MOO-50, live CKAN) → parcelCard render.
// Proves the card surfaces the real owner/zoning/district + a working Maps deep
// link. Run: node scripts/parcel-card-verify.mjs "2000 S 13th St"
import { createParcelClient } from '../../mcp-server/src/parcel.js';
import { parcelCard } from '../blockkit/parcel-card.js';

const address = process.argv[2] ?? '2000 S 13th St';
const client = createParcelClient({
  fetch: globalThis.fetch,
  userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
});

const parcel = await client.lookupParcel(address);
if (!parcel) {
  console.error(`No parcel found for "${address}"`);
  process.exit(1);
}

console.log('=== live MPROP parcel ===');
console.log(JSON.stringify(parcel, null, 2));

const blocks = parcelCard(parcel);
const mapButton = blocks.find((b) => b.type === 'actions').elements.find((e) => e.action_id === 'parcel_open_map');
const watchButton = blocks.find((b) => b.type === 'actions').elements.find((e) => e.action_id === 'parcel_watch');

console.log('\n=== rendered parcel card (Block Kit) ===');
console.log(JSON.stringify(blocks, null, 2));
console.log('\n=== map deep link ===\n' + mapButton.url);
console.log('=== watch entity ===\n' + watchButton.value);
