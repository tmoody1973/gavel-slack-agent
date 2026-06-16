import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeParcelLookupSubmit } from '../../../listeners/views/parcel-lookup.js';

function makeArgs(address) {
  const acked = [];
  return {
    args: {
      ack: async (response) => acked.push(response),
      view: { state: { values: { parcel_address: { value: { value: address } } } } },
      logger: { error: () => {} },
    },
    acked,
  };
}

const RT4 = { address: '1108 W CHAMBERS ST', zoning: 'RT4', lotArea: 7626, numUnits: 2 };

test('a hit updates the modal to the property card', async () => {
  const { args, acked } = makeArgs('1108 e chambers st');
  await makeParcelLookupSubmit({ lookupParcel: async () => RT4 })(args);
  assert.equal(acked[0].response_action, 'update');
  assert.match(JSON.stringify(acked[0].view), /1108 W CHAMBERS ST/);
});

test('a miss returns an inline error on the address block (nudging direction)', async () => {
  const { args, acked } = makeArgs('9999 nowhere ave');
  await makeParcelLookupSubmit({ lookupParcel: async () => null })(args);
  assert.equal(acked[0].response_action, 'errors');
  assert.ok(acked[0].errors.parcel_address);
  assert.match(acked[0].errors.parcel_address, /N\/S\/E\/W|direction/i);
});

test('an empty address errors without calling lookup', async () => {
  let called = false;
  const { args, acked } = makeArgs('   ');
  await makeParcelLookupSubmit({
    lookupParcel: async () => {
      called = true;
      return RT4;
    },
  })(args);
  assert.equal(called, false);
  assert.equal(acked[0].response_action, 'errors');
});

test('an upstream throw degrades to an inline error, never crashes the modal', async () => {
  const { args, acked } = makeArgs('not parseable');
  await makeParcelLookupSubmit({
    lookupParcel: async () => {
      throw new Error('unrecognized address');
    },
  })(args);
  assert.equal(acked[0].response_action, 'errors');
});
