// agent/tests/news/query.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildNewsQuery } from '../../news/query.js';

describe('buildNewsQuery', () => {
  it('uses the address plus a distinctive term, scoped to Milwaukee', () => {
    const q = buildNewsQuery({
      title: 'Conditional use for a data center at 5825 W Hope Ave',
      addresses: ['5825 W Hope Ave'],
    });
    assert.ok(q);
    assert.equal(q.address, '5825 W Hope Ave');
    assert.match(q.query, /5825 W Hope Ave/);
    assert.match(q.query, /Milwaukee/);
    assert.ok(q.terms.includes('data center'));
  });

  it('returns a query from a distinctive entity even with no address', () => {
    const q = buildNewsQuery({ title: 'Liquor license for Punta Cana Restaurant', addresses: [] });
    assert.ok(q);
    assert.equal(q.address, null);
    assert.match(q.query, /Punta Cana/);
  });

  it('returns null for a routine item with no address and no distinctive entity', () => {
    assert.equal(buildNewsQuery({ title: 'Appointment of a member to the board', addresses: [] }), null);
    assert.equal(buildNewsQuery({ title: 'Communication relating to claims', addresses: [] }), null);
  });

  it('returns null for an empty/garbage item', () => {
    assert.equal(buildNewsQuery({ title: '', addresses: [] }), null);
    assert.equal(buildNewsQuery({}), null);
  });
});
