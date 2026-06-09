import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findMember, lastNameKey } from '../../alerts/council.js';

const members = [
  { district: 1, name: 'Andrea M. Pratt', title: 'District 1 Alderwoman' },
  { district: 8, name: 'JoCasta Zamarripa', title: 'District 8 Alderwoman' },
  { district: 12, name: 'José G. Pérez', title: 'District 12 Alderman' },
  { district: 15, name: 'Russell W. Stamper, II', title: 'District 15 Alderman' },
];

test('lastNameKey extracts the last name across real Legistar formats', () => {
  assert.equal(lastNameKey('Russell Stamper, II'), 'stamper');
  assert.equal(lastNameKey('ALD. STAMPER'), 'stamper');
  assert.equal(lastNameKey('Russell Stamper'), 'stamper');
  assert.equal(lastNameKey('Andrea M. Pratt'), 'pratt');
});

test('lastNameKey strips diacritics so PEREZ matches Pérez', () => {
  assert.equal(lastNameKey('José G. Pérez'), 'perez');
  assert.equal(lastNameKey('ALD. PEREZ'), 'perez');
});

test('lastNameKey drops honorific-only prefixes but keeps real names', () => {
  assert.equal(lastNameKey('ALDERWOMAN COGGS'), 'coggs');
  assert.equal(lastNameKey('JoCasta Zamarripa'), 'zamarripa');
});

test('findMember matches sponsor formats to the directory', () => {
  assert.equal(findMember('ALD. STAMPER', members)?.district, 15);
  assert.equal(findMember('Russell Stamper, II', members)?.district, 15);
  assert.equal(findMember('ALD. PEREZ', members)?.district, 12);
});

test('findMember returns null for non-members, empty, and ambiguity', () => {
  assert.equal(findMember('THE CHAIR', members), null);
  assert.equal(findMember('', members), null);
  assert.equal(findMember(undefined, members), null);
  const ambiguous = [...members, { district: 99, name: 'Other Stamper', title: 'x' }];
  assert.equal(findMember('ALD. STAMPER', ambiguous), null);
});
