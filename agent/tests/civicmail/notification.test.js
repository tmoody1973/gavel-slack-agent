import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNotificationRecord } from '../../civicmail/notification.js';
import { LICENSE, MEETING, PERMIT } from './fixtures.js';

test('builds an insert record with derived fields + searchText', () => {
  const rec = buildNotificationRecord(PERMIT);
  assert.equal(rec.messageId, PERMIT.messageId);
  assert.equal(rec.category, 'neighborhood_services');
  assert.equal(rec.taxkey, '3921150100'); // scalar from taxkeys[0] for by_taxkey
  assert.deepEqual(rec.taxkeys, ['3921150100']);
  assert.equal(rec.recordNumber, 'COM-ALT-26-00358');
  assert.match(rec.searchText, /Neighborhood Services new record/); // subject folded in
  assert.match(rec.searchText, /200 N JEFFERSON ST/); // body folded in
});

test('drops null optionals so Convex sees absent, not null', () => {
  const rec = buildNotificationRecord(PERMIT);
  // a permit has no aldermanic district / business — keys must be ABSENT, not null
  assert.ok(!('district' in rec), 'district should be omitted');
  assert.ok(!('business' in rec), 'business should be omitted');
  assert.ok(!('legistarMeetingId' in rec), 'legistarMeetingId should be omitted');
});

test('keeps the legistar meeting id for meetings (the fusion key)', () => {
  const rec = buildNotificationRecord(MEETING);
  assert.equal(rec.legistarMeetingId, '1348260');
  assert.equal(rec.taxkey, undefined); // no taxkey → omitted
  assert.ok(!('taxkey' in rec));
});

test('normalizes PDF attachment metadata', () => {
  const rec = buildNotificationRecord(MEETING);
  assert.equal(rec.attachments.length, 1);
  assert.equal(rec.attachments[0].filename, 'ZND_Agenda_06.16.26.pdf');
  assert.equal(rec.attachments[0].contentType, 'application/pdf');
  assert.equal(rec.attachments[0].attachmentId, '52334088-ba0a-4bec-b7da-c191e9ae4d6d');
});

test('keeps aldermanic district + business for licenses', () => {
  const rec = buildNotificationRecord(LICENSE);
  assert.equal(rec.district, '3');
  assert.equal(rec.business, 'Cozumel Mexican Restaurant, COZUMEL III, LLC');
});

test('coerces a Date timestamp to an ISO string (Convex has no Date type)', () => {
  const rec = buildNotificationRecord({
    messageId: '<d@e>',
    subject: 'x',
    bodyText: 'y',
    timestamp: new Date('2026-06-10T12:35:38.000Z'),
  });
  assert.equal(rec.receivedAt, '2026-06-10T12:35:38.000Z');
  assert.equal(typeof rec.receivedAt, 'string');
});

test('accepts raw html and strips it (webhook path)', () => {
  const rec = buildNotificationRecord({
    messageId: '<x@y>',
    subject: 'RENEWAL Class B Tavern License',
    html: '<div>You have a Milwaukee.Gov E-Notification for Licenses Applied for in Aldermanic District #7.</div>',
    timestamp: '2026-06-10T00:00:00.000Z',
  });
  assert.equal(rec.category, 'licenses');
  assert.equal(rec.district, '7');
  assert.ok(!rec.bodyText.includes('<div>'), 'html must be stripped');
});
