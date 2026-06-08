import assert from 'node:assert/strict';
import { test } from 'node:test';
import { enrichForAlert } from '../../alerts/enrich.js';

function fakeLegistar({ sponsors }) {
  return {
    getMatter: async () => ({ fileNumber: '241554' }),
    getEvent: async () => ({ date: '2026-06-08T00:00:00', time: '1:30 PM', location: 'Room 301-B' }),
    getMatterSponsors: async () => sponsors,
    getPerson: async (id) => ({ name: 'ALD. PEREZ', email: 'jperez@milwaukee.gov', phone: '414-286-2221', _id: id }),
  };
}

const row = { matterId: 70036, eventId: 13355 };

test('enriches matter + event + primary sponsor person', async () => {
  const ctx = await enrichForAlert(
    row,
    fakeLegistar({ sponsors: [{ name: 'ALD. PEREZ', personId: 2462, sequence: 0 }] }),
  );
  assert.equal(ctx.matter.fileNumber, '241554');
  assert.equal(ctx.event.location, 'Room 301-B');
  assert.equal(ctx.person.email, 'jperez@milwaukee.gov');
});

test('person is null when there are no sponsors', async () => {
  const ctx = await enrichForAlert(row, fakeLegistar({ sponsors: [] }));
  assert.equal(ctx.person, null);
});
