import assert from 'node:assert/strict';
import { test } from 'node:test';

import { extractCivicFields, htmlToText } from '../../civicmail/extract.js';
import { ENFORCEMENT, LICENSE, MEETING, NEWSLETTER, PERMIT, REDEV_AGENDA } from './fixtures.js';

test('htmlToText strips tags, styles, and entities into clean text', () => {
  const html = '<style>.x{color:red}</style><div>Hello&nbsp;&amp; <b>welcome</b></div>';
  assert.equal(htmlToText(html), 'Hello & welcome');
});

test('category is read from the city\'s own "E-Notification for X" label', () => {
  assert.equal(extractCivicFields(MEETING).category, 'meetings');
  assert.equal(extractCivicFields(PERMIT).category, 'neighborhood_services');
  assert.equal(extractCivicFields(LICENSE).category, 'licenses');
  assert.equal(extractCivicFields(ENFORCEMENT).category, 'neighborhood_services');
});

test('categoryRaw preserves the exact city phrase for provenance', () => {
  assert.equal(extractCivicFields(MEETING).categoryRaw, 'Common Council');
  assert.equal(extractCivicFields(LICENSE).categoryRaw, 'Licenses');
});

test('aldermanic district is extracted when the city states it (licenses)', () => {
  assert.equal(extractCivicFields(LICENSE).district, '3');
  // Neighborhood Services uses BID, not aldermanic district → district null
  assert.equal(extractCivicFields(PERMIT).district, null);
});

test('BID number is extracted for Neighborhood Services activity', () => {
  assert.equal(extractCivicFields(PERMIT).bid, '2');
  assert.equal(extractCivicFields(ENFORCEMENT).bid, '40');
  assert.equal(extractCivicFields(LICENSE).bid, null);
});

test('street address is extracted from the "At <ADDR>" clause', () => {
  assert.deepEqual(extractCivicFields(PERMIT).addresses, ['200 N JEFFERSON ST']);
  assert.deepEqual(extractCivicFields(LICENSE).addresses, ['2060 N HUMBOLDT AV']);
  assert.deepEqual(extractCivicFields(ENFORCEMENT).addresses, ['6160 S 6TH ST']);
});

test('taxkey (MPROP parcel join key) is extracted, with or without the # form', () => {
  assert.deepEqual(extractCivicFields(PERMIT).taxkeys, ['3921150100']);
  assert.deepEqual(extractCivicFields(ENFORCEMENT).taxkeys, ['6879958110']);
  assert.deepEqual(extractCivicFields(MEETING).taxkeys, []);
});

test('record number is extracted for both permit and enforcement prefixes', () => {
  assert.equal(extractCivicFields(PERMIT).recordNumber, 'COM-ALT-26-00358');
  assert.equal(extractCivicFields(ENFORCEMENT).recordNumber, 'ENF-2026-17411');
});

test('record sub-type is the record prefix (permits) or license type (licenses)', () => {
  assert.equal(extractCivicFields(PERMIT).subType, 'COM-ALT');
  assert.equal(extractCivicFields(ENFORCEMENT).subType, 'ENF');
  assert.equal(extractCivicFields(LICENSE).subType, 'Class B Tavern License');
});

test('legistar meeting id is extracted from the embedded MeetingDetail link (dedup key)', () => {
  assert.equal(extractCivicFields(MEETING).legistarMeetingId, '1348260');
  assert.equal(extractCivicFields(PERMIT).legistarMeetingId, null);
});

test('licensee business/LLC is extracted (watchlist entity)', () => {
  assert.equal(extractCivicFields(LICENSE).business, 'Cozumel Mexican Restaurant, COZUMEL III, LLC');
  assert.equal(extractCivicFields(PERMIT).business, null);
});

test('detail url is the record/meeting link', () => {
  assert.match(extractCivicFields(PERMIT).detailUrl, /aca3\.accela\.com/);
  assert.match(extractCivicFields(MEETING).detailUrl, /milwaukee\.legistar\.com\/MeetingDetail/);
});

test('description (the substance) is extracted for Neighborhood Services records', () => {
  assert.equal(extractCivicFields(PERMIT).description, 'Commercial Alteration Permit');
  assert.match(extractCivicFields(ENFORCEMENT).description, /Trailer was torn down without a permit/);
});

test('a board agenda without the "Common Council" label still classifies as a meeting', () => {
  assert.equal(extractCivicFields(REDEV_AGENDA).category, 'meetings');
});

test('a school-board newsletter classifies as newsletter, not a false aldermanic district', () => {
  const out = extractCivicFields(NEWSLETTER);
  assert.equal(out.category, 'newsletter');
  assert.equal(out.district, null); // "District 1" is a school district, not aldermanic
});

test('a message with an unknown body still returns a well-formed object (never throws)', () => {
  const out = extractCivicFields({ subject: 'Something new', bodyText: 'Totally unstructured text.' });
  assert.equal(out.category, 'other');
  assert.deepEqual(out.addresses, []);
  assert.deepEqual(out.taxkeys, []);
  assert.equal(out.district, null);
});
