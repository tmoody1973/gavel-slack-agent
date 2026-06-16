import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parcelLookupModal, propertyResultModal } from '../../blockkit/parcel-lookup-modal.js';

test('parcelLookupModal is a modal with a required address input', () => {
  const modal = parcelLookupModal();
  assert.equal(modal.type, 'modal');
  assert.equal(modal.callback_id, 'parcel_lookup_modal');
  assert.ok(modal.title.text.length <= 24, 'title within Slack 24-char cap');
  const input = modal.blocks.find((b) => b.type === 'input' && b.block_id === 'parcel_address');
  assert.ok(input, 'expected an address input block');
  assert.equal(input.element.type, 'plain_text_input');
  assert.ok(!input.optional, 'address is required');
});

test('propertyResultModal embeds the property card + a "look up another" button, no watch', () => {
  const modal = propertyResultModal({ address: '1108 W CHAMBERS ST', zoning: 'RT4', lotArea: 7626, numUnits: 2 });
  const all = JSON.stringify(modal);
  assert.equal(modal.type, 'modal');
  assert.match(all, /1108 W CHAMBERS ST/);
  assert.match(all, /RT4/);
  assert.match(all, /7,626 sq ft/);
  assert.match(all, /parcel_lookup_again/);
  assert.ok(!/parcel_watch/.test(all), 'no channel here → no watch button');
});
