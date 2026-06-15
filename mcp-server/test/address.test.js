import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeAddress } from '../src/address.js';

test('normalizes the seeded demo address to MPROP parts', () => {
  assert.deepEqual(normalizeAddress('2000 S 13th St'), {
    houseNr: '2000',
    sdir: 'S',
    street: '13TH',
    sttype: 'ST',
  });
});

test('maps spelled-out street types and strips punctuation', () => {
  assert.deepEqual(normalizeAddress('2700 W. Wisconsin Avenue'), {
    houseNr: '2700',
    sdir: 'W',
    street: 'WISCONSIN',
    sttype: 'AV',
  });
  assert.deepEqual(normalizeAddress('2616 W Wisconsin Ave'), {
    houseNr: '2616',
    sdir: 'W',
    street: 'WISCONSIN',
    sttype: 'AV',
  });
});

test('maps each real MPROP street-type code', () => {
  assert.equal(normalizeAddress('1 N A Blvd').sttype, 'BL');
  assert.equal(normalizeAddress('1 N A Drive').sttype, 'DR');
  assert.equal(normalizeAddress('1 N A Place').sttype, 'PL');
  assert.equal(normalizeAddress('1 N A Road').sttype, 'RD');
  assert.equal(normalizeAddress('1 N A Court').sttype, 'CT');
  assert.equal(normalizeAddress('1 N A Lane').sttype, 'LA');
  assert.equal(normalizeAddress('1 N A Terrace').sttype, 'TR');
  assert.equal(normalizeAddress('1 N A Circle').sttype, 'CR');
  assert.equal(normalizeAddress('1 N A Parkway').sttype, 'PK');
  assert.equal(normalizeAddress('1 N A Way').sttype, 'WA');
});

test('expands spelled-out directionals', () => {
  assert.equal(normalizeAddress('100 North Water St').sdir, 'N');
  assert.equal(normalizeAddress('100 East Wells St').sdir, 'E');
});

test('ordinalizes a bare numeric street name to match MPROP', () => {
  assert.equal(normalizeAddress('5000 N 13 St').street, '13TH');
  assert.equal(normalizeAddress('100 S 1 St').street, '1ST');
  assert.equal(normalizeAddress('100 S 22 St').street, '22ND');
  assert.equal(normalizeAddress('100 S 23 St').street, '23RD');
  assert.equal(normalizeAddress('100 S 11 St').street, '11TH');
});

test('handles a missing directional and a missing street type', () => {
  assert.deepEqual(normalizeAddress('123 Main'), { houseNr: '123', street: 'MAIN' });
});

test('returns null for unparseable input', () => {
  assert.equal(normalizeAddress(''), null);
  assert.equal(normalizeAddress(null), null);
  assert.equal(normalizeAddress('not an address'), null);
  assert.equal(normalizeAddress('S 13th St'), null); // no house number
});
