import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerParcelTools } from '../src/parcel-tools.js';

function harness(clientOverrides) {
  const registered = new Map();
  const server = {
    registerTool(name, config, handler) {
      registered.set(name, { config, handler });
    },
  };
  registerParcelTools(server, clientOverrides);
  return registered;
}

const payload = (res) => JSON.parse(res.content[0].text);

test('registers the four parcel tools', () => {
  const tools = harness({});
  for (const name of ['lookup_parcel', 'check_zoning', 'get_ownership_portfolio', 'get_permits']) {
    assert.ok(tools.has(name), `missing ${name}`);
  }
});

test('lookup_parcel returns the parcel + a watch hint on success', async () => {
  const tools = harness({
    lookupParcel: async () => ({ taxkey: '468', owner: 'SHAAN REAL ESTATE INC', zoning: 'RT4' }),
  });
  const res = await tools.get('lookup_parcel').handler({ address: '2000 S 13th St' });
  assert.equal(payload(res).owner, 'SHAAN REAL ESTATE INC');
  assert.match(payload(res).watchHint, /\/gavel watch "SHAAN REAL ESTATE INC"/);
});

test('lookup_parcel degrades to information_unavailable when the address is not found', async () => {
  const tools = harness({ lookupParcel: async () => null });
  const res = await tools.get('lookup_parcel').handler({ address: 'nowhere' });
  assert.equal(payload(res).status, 'information_unavailable');
});

test('lookup_parcel degrades to information_unavailable when the client throws', async () => {
  const tools = harness({
    lookupParcel: async () => {
      throw new Error('CKAN request failed: 500');
    },
  });
  const res = await tools.get('lookup_parcel').handler({ address: '2000 S 13th St' });
  assert.equal(payload(res).status, 'information_unavailable');
});

test('get_ownership_portfolio attaches a watch hint for the owner', async () => {
  const tools = harness({
    getOwnershipPortfolio: async (owner) => ({ owner, totalParcels: 186, shown: 25, parcels: [] }),
  });
  const res = await tools.get('get_ownership_portfolio').handler({ owner_name: 'VB ONE LLC', match: 'contains' });
  assert.equal(payload(res).totalParcels, 186);
  assert.match(payload(res).watchHint, /VB ONE LLC/);
});

test('get_permits passes through the dataset payload (source label preserved)', async () => {
  const tools = harness({
    getPermits: async () => ({
      address: '2000 S 13TH ST',
      source: 'Milwaukee buildingpermits (monthly refresh)',
      permits: [],
    }),
  });
  const res = await tools.get('get_permits').handler({ address: '2000 S 13th St' });
  assert.match(payload(res).source, /monthly refresh/);
});
