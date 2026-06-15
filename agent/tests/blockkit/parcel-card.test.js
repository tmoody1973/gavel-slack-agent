import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parcelCard } from '../../blockkit/parcel-card.js';

/** Shape mirrors mapParcel() from the MOO-50 MCP parcel client. */
const parcel = {
  taxkey: '3960512000',
  address: '2000 S 13TH ST',
  zoning: 'RT4',
  district: '12',
  owner: 'SHAAN REAL ESTATE INC',
  assessedValue: 168000,
  razeStatus: null,
  hasOpenViolation: false,
};

function buttonsOf(blocks) {
  const actions = blocks.find((b) => b.type === 'actions');
  return actions ? actions.elements : [];
}

test('parcelCard renders address, owner, zoning, district, and assessed value', () => {
  const blocks = parcelCard(parcel);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('2000 S 13TH ST'));
  assert.ok(all.includes('SHAAN REAL ESTATE INC'));
  assert.ok(all.includes('RT4'));
  assert.ok(all.includes('12'));
  assert.ok(all.includes('168,000'));
});

test('parcelCard adds an "Open in Google Maps" deep-link button (no API key)', () => {
  const buttons = buttonsOf(parcelCard(parcel));
  const map = buttons.find((b) => b.action_id === 'parcel_open_map');
  assert.ok(map, 'expected a parcel_open_map button');
  assert.ok(map.url.startsWith('https://www.google.com/maps/search/?api=1&query='));
  assert.ok(decodeURIComponent(map.url).includes('2000 S 13TH ST'));
  assert.equal(map.value, undefined, 'a url button must not also carry a value');
});

test('parcelCard adds an "Add to watchlist" button carrying the address as its value', () => {
  const buttons = buttonsOf(parcelCard(parcel));
  const watch = buttons.find((b) => b.action_id === 'parcel_watch');
  assert.ok(watch, 'expected a parcel_watch button');
  assert.equal(watch.value, '2000 S 13TH ST');
  assert.match(JSON.stringify(watch.text), /watchlist/i);
});

test('parcelCard surfaces open-violation and raze flags when set', () => {
  const blocks = parcelCard({ ...parcel, hasOpenViolation: true, razeStatus: 'RAZE ORDERED' });
  const all = JSON.stringify(blocks);
  assert.match(all, /violation/i);
  assert.match(all, /RAZE ORDERED/);
});

test('parcelCard omits flags and tolerates missing optional fields without printing null/undefined', () => {
  const blocks = parcelCard({ address: '123 W SOMEWHERE AVE' });
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('123 W SOMEWHERE AVE'));
  assert.ok(!all.includes('undefined'));
  assert.ok(!all.includes('null'));
  assert.ok(!/violation/i.test(all));
  assert.ok(!/raze/i.test(all));
});
