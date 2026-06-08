import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildFooter } from '../../alerts/footer.js';

const event = {
  date: '2026-06-10T00:00:00',
  time: '1:30 PM',
  location: 'Room 301-B, City Hall',
  inSiteUrl: 'https://milwaukee.legistar.com/MeetingDetail.aspx?LEGID=13355',
};

test('footer includes hearing date/time, location, the meeting link, person contact', () => {
  const { text } = buildFooter(event, { name: 'ALD. PEREZ', email: 'jperez@milwaukee.gov', phone: '414-286-2221' });
  assert.match(text, /How to be heard \/ Cómo participar/);
  assert.match(text, /Jun 10/);
  assert.match(text, /1:30 PM/);
  assert.match(text, /Room 301-B/);
  assert.match(text, /Meeting agenda & how to attend/);
  assert.ok(text.includes(event.inSiteUrl));
  assert.match(text, /ALD\. PEREZ/);
  assert.match(text, /jperez@milwaukee\.gov/);
  assert.match(text, /414-286-2221/);
});

test('person line omitted gracefully when no sponsor', () => {
  const { text } = buildFooter(event, null);
  assert.ok(!text.includes('✉️'));
  assert.match(text, /Room 301-B/);
});

test('the meeting link is omitted when the event has no inSiteUrl', () => {
  const { text } = buildFooter({ date: '2026-06-10T00:00:00', time: '1:30 PM', location: 'Room 301-B' }, null);
  assert.ok(!text.includes('Meeting agenda'));
  assert.match(text, /Room 301-B/);
});

test('missing time/location degrade without crashing', () => {
  const { text } = buildFooter({ date: '2026-06-10T00:00:00' }, null);
  assert.match(text, /Jun 10/);
  assert.ok(!text.includes('📍'));
});
