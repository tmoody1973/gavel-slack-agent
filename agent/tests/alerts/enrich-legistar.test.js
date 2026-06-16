import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapEventDetail, mapMatter, mapPerson, mapSponsor } from '../../poller/legistar.js';

test('mapMatter picks the file number (+ guid/title/status for escalation)', () => {
  assert.deepEqual(mapMatter({ MatterId: 1, MatterFile: '241554', MatterName: '' }), {
    fileNumber: '241554',
    guid: undefined,
    title: undefined,
    statusName: undefined,
  });
});

test('mapSponsor picks primary sponsor name + person id', () => {
  assert.deepEqual(
    mapSponsor({ MatterSponsorName: 'ALD. PEREZ', MatterSponsorNameId: 2462, MatterSponsorSequence: 0 }),
    {
      name: 'ALD. PEREZ',
      personId: 2462,
      sequence: 0,
    },
  );
});

test('mapPerson picks contact fields, undefined when absent', () => {
  assert.deepEqual(
    mapPerson({ PersonFullName: 'ALD. PEREZ', PersonEmail: 'jperez@milwaukee.gov', PersonPhone: '414-286-2221' }),
    { name: 'ALD. PEREZ', email: 'jperez@milwaukee.gov', phone: '414-286-2221' },
  );
  assert.deepEqual(mapPerson({ PersonFullName: 'X', PersonEmail: '', PersonPhone: null }), {
    name: 'X',
    email: undefined,
    phone: undefined,
  });
});

test('mapEventDetail picks hearing time, location, links', () => {
  assert.deepEqual(
    mapEventDetail({
      EventDate: '2026-06-08T00:00:00',
      EventTime: '1:30 PM',
      EventLocation: 'Room 301-B, City Hall',
      EventInSiteURL: 'https://milwaukee.legistar.com/x',
      EventAgendaFile: 'https://.../agenda.pdf',
    }),
    {
      date: '2026-06-08T00:00:00',
      time: '1:30 PM',
      location: 'Room 301-B, City Hall',
      inSiteUrl: 'https://milwaukee.legistar.com/x',
      agendaPdf: 'https://.../agenda.pdf',
    },
  );
});
