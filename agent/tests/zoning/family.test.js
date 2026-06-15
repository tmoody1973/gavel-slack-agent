import assert from 'node:assert/strict';
import { test } from 'node:test';
import { zoningClassToFamily } from '../../zoning/family.js';

test('residential classes map to residential', () => {
  for (const c of ['RT4', 'RT3', 'RS6', 'RM7', 'RO2']) {
    assert.equal(zoningClassToFamily(c), 'residential', c);
  }
});

test('commercial / downtown / industrial / special families', () => {
  assert.equal(zoningClassToFamily('LB2'), 'commercial');
  assert.equal(zoningClassToFamily('NS1'), 'commercial');
  assert.equal(zoningClassToFamily('C9A'), 'downtown');
  assert.equal(zoningClassToFamily('IL2'), 'industrial');
  assert.equal(zoningClassToFamily('IM'), 'industrial');
  assert.equal(zoningClassToFamily('PD'), 'special');
});

test('case-insensitive and tolerant of whitespace', () => {
  assert.equal(zoningClassToFamily(' rt4 '), 'residential');
});

test('unknown or empty class returns null', () => {
  assert.equal(zoningClassToFamily('ZZ9'), null);
  assert.equal(zoningClassToFamily(''), null);
  assert.equal(zoningClassToFamily(null), null);
});
