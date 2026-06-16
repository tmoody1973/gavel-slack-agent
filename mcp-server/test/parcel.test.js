import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createParcelClient, escapeLike, mapParcel, mapPermit, pickBest, sqlEscape } from '../src/parcel.js';

test('sqlEscape doubles single quotes (literal-injection guard)', () => {
  assert.equal(sqlEscape("O'BRIEN LLC"), "O''BRIEN LLC");
  assert.equal(sqlEscape("'; DROP--"), "''; DROP--");
});

test('escapeLike escapes LIKE wildcards and the escape char', () => {
  assert.equal(escapeLike('50% _ \\x'), '50\\% \\_ \\\\x');
  assert.equal(escapeLike('PLAIN LLC'), 'PLAIN LLC');
});

test('mapParcel keeps a $0 assessed value (exempt) but nulls an empty string', () => {
  assert.equal(mapParcel({ C_A_TOTAL: '0' }).assessedValue, 0);
  assert.equal(mapParcel({ C_A_TOTAL: '' }).assessedValue, null);
  assert.equal(mapParcel({}).assessedValue, null);
});

test('mapParcel pulls the useful MPROP fields', () => {
  const p = mapParcel({
    TAXKEY: '4680453000',
    HOUSE_NR_LO: '2000',
    SDIR: 'S',
    STREET: '13TH',
    STTYPE: 'ST',
    ZONING: 'RT4',
    LAND_USE_GP: '4',
    GEO_ALDER: '12',
    OWNER_NAME_1: 'SHAAN REAL ESTATE INC',
    C_A_TOTAL: '289400',
    BI_VIOL: '',
    RAZE_STATUS: '',
  });
  assert.equal(p.taxkey, '4680453000');
  assert.equal(p.address, '2000 S 13TH ST');
  assert.equal(p.zoning, 'RT4');
  assert.equal(p.district, '12');
  assert.equal(p.owner, 'SHAAN REAL ESTATE INC');
  assert.equal(p.assessedValue, 289400);
  assert.equal(p.hasOpenViolation, false);
});

test('mapParcel exposes lot/building/unit fields (numeric, or null when empty)', () => {
  const p = mapParcel({
    LOT_AREA: '3628.00000',
    BLDG_AREA: '4310.00000',
    NR_UNITS: '5',
    YR_BUILT: '1884',
    NR_STORIES: '2.0',
  });
  assert.equal(p.lotArea, 3628);
  assert.equal(p.buildingArea, 4310);
  assert.equal(p.numUnits, 5);
  assert.equal(p.yearBuilt, 1884);
  assert.equal(p.stories, 2);

  const empty = mapParcel({ LOT_AREA: '', NR_UNITS: undefined });
  assert.equal(empty.lotArea, null);
  assert.equal(empty.numUnits, null);
});

test('mapPermit maps the buildingpermits columns', () => {
  const r = mapPermit({
    'Date Opened': '2026-05-01',
    'Permit Type': 'Commercial Alteration Permit',
    Status: 'Issued',
    'Construction Total Cost': '12000',
    'Use of Building': 'Tavern',
  });
  assert.deepEqual(r, {
    date: '2026-05-01',
    type: 'Commercial Alteration Permit',
    status: 'Issued',
    cost: '12000',
    use: 'Tavern',
  });
});

// Fake fetch: records the decoded SQL it was asked to run, and returns canned
// records (a COUNT row when the SQL aggregates, else the parcel rows).
function fakeClient(rows, sqlLog) {
  const fetch = async (url) => {
    const sql = decodeURIComponent(url.split('sql=')[1]);
    sqlLog?.push(sql);
    const records = /COUNT\(\*\)/.test(sql) ? [{ n: rows.length }] : rows;
    return { ok: true, json: async () => ({ result: { records } }) };
  };
  return createParcelClient({ fetch, userAgent: 'test' });
}

test('lookupParcel matches on house + street; directional/type are NOT hard filters', async () => {
  const sql = [];
  const client = fakeClient([], sql);
  const result = await client.lookupParcel('2000 S 13th St');
  assert.equal(result, null);
  assert.match(sql[0], /"HOUSE_NR_LO" = '2000'/);
  assert.match(sql[0], /"STREET" = '13TH'/);
  assert.ok(!/"SDIR"/.test(sql[0]), 'directional must not be a hard WHERE filter');
  assert.ok(!/"STTYPE"/.test(sql[0]), 'street type must not be a hard WHERE filter');
});

test('lookupParcel falls back to a prefix ILIKE when the exact street finds nothing', async () => {
  const sql = [];
  // First (exact) query returns [], so the client should issue a fuzzy fallback.
  let call = 0;
  const fetch = async (url) => {
    const decoded = decodeURIComponent(url.split('sql=')[1]);
    sql.push(decoded);
    const rows = call++ === 0 ? [] : [{ HOUSE_NR_LO: '1108', SDIR: 'W', STREET: 'CHAMBERS', STTYPE: 'ST', ZONING: 'RT4' }];
    return { ok: true, json: async () => ({ result: { records: rows } }) };
  };
  const client = createParcelClient({ fetch, userAgent: 'test' });
  const p = await client.lookupParcel('1108 e chamber st 53206'); // singular + wrong dir + zip
  assert.equal(p.zoning, 'RT4');
  assert.equal(p.address, '1108 W CHAMBERS ST'); // canonical address surfaces the W
  assert.match(sql[1], /ILIKE 'CHAMBER%'/);
});

test('pickBest resolves a wrong directional to the only real parcel', () => {
  const rows = [{ HOUSE_NR_LO: '1108', SDIR: 'W', STREET: 'CHAMBERS', STTYPE: 'ST', ZONING: 'RT4' }];
  // user asked for "E" but only "W" exists → still resolves
  assert.equal(pickBest(rows, { houseNr: '1108', sdir: 'E', sttype: 'ST', street: 'CHAMBERS' }).SDIR, 'W');
});

test('pickBest prefers the requested directional when several match', () => {
  const rows = [
    { SDIR: 'E', STREET: 'CHAMBERS', STTYPE: 'ST' },
    { SDIR: 'W', STREET: 'CHAMBERS', STTYPE: 'ST' },
  ];
  assert.equal(pickBest(rows, { sdir: 'W', sttype: 'ST' }).SDIR, 'W');
});

test('lookupParcel maps a found row', async () => {
  const client = fakeClient([
    {
      TAXKEY: '468',
      HOUSE_NR_LO: '2000',
      SDIR: 'S',
      STREET: '13TH',
      STTYPE: 'ST',
      ZONING: 'RT4',
      OWNER_NAME_1: 'SHAAN REAL ESTATE INC',
    },
  ]);
  const p = await client.lookupParcel('2000 S 13th St');
  assert.equal(p.owner, 'SHAAN REAL ESTATE INC');
  assert.equal(p.zoning, 'RT4');
});

test('lookupParcel throws on an unparseable address (→ tool layer degrades)', async () => {
  const client = fakeClient([]);
  await assert.rejects(() => client.lookupParcel('not an address'), /unrecognized address/);
});

test('getOwnershipPortfolio reports total + capped parcels; contains uses ILIKE', async () => {
  const sql = [];
  const rows = [
    { TAXKEY: '1', HOUSE_NR_LO: '2616', SDIR: 'W', STREET: 'WISCONSIN', STTYPE: 'AV', ZONING: 'LB2' },
    { TAXKEY: '2', HOUSE_NR_LO: '2829', SDIR: 'W', STREET: 'WISCONSIN', STTYPE: 'AV', ZONING: 'RM7' },
  ];
  const client = fakeClient(rows, sql);
  const out = await client.getOwnershipPortfolio('BERRADA PROPERTIES', { match: 'contains', limit: 25 });
  assert.equal(out.owner, 'BERRADA PROPERTIES');
  assert.equal(out.totalParcels, 2);
  assert.equal(out.shown, 2);
  assert.equal(out.parcels[0].address, '2616 W WISCONSIN AV');
  assert.ok(sql.some((s) => /ILIKE '%BERRADA PROPERTIES%'/.test(s)));
});

test('getPermits prefix-matches Address and labels the monthly source', async () => {
  const sql = [];
  const client = fakeClient(
    [{ 'Date Opened': '2026-05-01', 'Permit Type': 'Commercial Alteration Permit', Status: 'Issued' }],
    sql,
  );
  const out = await client.getPermits('2000 S 13th St', { since: '2024-01-01' });
  assert.match(out.source, /monthly/);
  assert.equal(out.permits[0].type, 'Commercial Alteration Permit');
  assert.match(sql[0], /"Address" ILIKE '2000 S 13TH ST%'/);
  assert.match(sql[0], /"Date Opened" >= '2024-01-01'/);
});
