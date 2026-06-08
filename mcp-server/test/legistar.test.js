import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLegistarClient, mapMatter } from '../src/legistar.js';

function fakeFetch(routes) {
  const calls = [];
  const fetch = async (url, opts) => {
    calls.push({ url, opts });
    const last = new URL(url).pathname.split('/').pop();
    const body = routes[last] ?? [];
    return { ok: true, status: 200, json: async () => body };
  };
  return { fetch, calls };
}

test('mapMatter exposes the useful matter fields, not just the file number', () => {
  const out = mapMatter({
    MatterId: 73181,
    MatterFile: '230001',
    MatterTitle: 'A substitute motion on duty to intervene',
    MatterStatusName: 'In Committee',
    MatterIntroDate: '2026-05-01T00:00:00',
    MatterBodyName: 'PUBLIC SAFETY & HEALTH COMMITTEE',
  });
  assert.deepEqual(out, {
    matterId: 73181,
    fileNumber: '230001',
    title: 'A substitute motion on duty to intervene',
    status: 'In Committee',
    introDate: '2026-05-01T00:00:00',
    bodyName: 'PUBLIC SAFETY & HEALTH COMMITTEE',
  });
});

test('fetchUpcomingFinalEvents hits /events with the window query, UA, mapped result', async () => {
  const { fetch, calls } = fakeFetch({
    events: [
      {
        EventId: 1,
        EventBodyName: 'ZONING',
        EventDate: '2026-06-10T00:00:00',
        EventAgendaLastPublishedUTC: '2026-06-08T15:00:00Z',
      },
    ],
  });
  const client = createLegistarClient({
    fetch,
    client: 'milwaukee',
    userAgent: 'GavelCivicAgent/0.1',
    now: () => '2026-06-08T12:00:00.000Z',
  });
  const events = await client.fetchUpcomingFinalEvents();
  assert.equal(events.length, 1);
  assert.equal(events[0].eventId, 1);
  assert.ok(calls[0].url.includes('/v1/milwaukee/events?'));
  assert.equal(calls[0].opts.headers['User-Agent'], 'GavelCivicAgent/0.1');
});

test('fetchEventItems hits /events/{id}/eventitems with Attachments=1, mapped', async () => {
  const { fetch, calls } = fakeFetch({
    eventitems: [{ EventItemId: 9, EventItemTitle: 'Rezoning', EventItemMatterId: 3, EventItemAgendaNumber: '14' }],
  });
  const client = createLegistarClient({
    fetch,
    client: 'milwaukee',
    userAgent: 'UA',
    now: () => '2026-06-08T12:00:00.000Z',
  });
  const items = await client.fetchEventItems(1);
  assert.equal(items[0].eventItemId, 9);
  assert.ok(calls[0].url.includes('/v1/milwaukee/events/1/eventitems'));
  assert.ok(calls[0].url.includes('Attachments=1'));
});

test('throws a clear error on a non-ok response', async () => {
  const fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
  const client = createLegistarClient({
    fetch,
    client: 'milwaukee',
    userAgent: 'UA',
    now: () => '2026-06-08T12:00:00.000Z',
  });
  await assert.rejects(() => client.fetchUpcomingFinalEvents(), /Legistar.*503/);
});

test('getMatterHistories hits /matters/{id}/histories with notes', async () => {
  const { fetch, calls } = fakeFetch({
    histories: [
      {
        MatterHistoryId: 5,
        MatterHistoryActionDate: '2026-05-01T00:00:00',
        MatterHistoryActionName: 'Held',
        MatterHistoryActionBodyName: 'ZONING',
        MatterHistoryPassedFlag: 0,
        MatterHistoryTally: '4-1',
      },
    ],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getMatterHistories(73181);
  assert.equal(out[0].actionName, 'Held');
  assert.equal(out[0].tally, '4-1');
  assert.ok(calls[0].url.includes('/matters/73181/histories'));
  assert.ok(calls[0].url.includes('AgendaNote=1'));
});

test('getMatterTexts hits /matters/{id}/versions then /texts/{id}', async () => {
  const fetch = async (url) => {
    if (url.includes('/versions')) return { ok: true, status: 200, json: async () => [{ Key: '2', Value: 'v2' }] };
    return { ok: true, status: 200, json: async () => ({ MatterTextId: 2, MatterTextPlain: 'full text' }) };
  };
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getMatterTexts(73181);
  assert.equal(out.plain, 'full text');
});

test('getMatterAttachments hits /matters/{id}/attachments', async () => {
  const { fetch, calls } = fakeFetch({
    attachments: [
      { MatterAttachmentId: 7, MatterAttachmentName: 'Staff report', MatterAttachmentHyperlink: 'http://x/File' },
    ],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getMatterAttachments(73181);
  assert.equal(out[0].name, 'Staff report');
  assert.ok(calls[0].url.includes('/matters/73181/attachments'));
});

test('getEventItemVotes hits /eventitems/{id}/votes, maps members', async () => {
  const { fetch, calls } = fakeFetch({
    votes: [{ VotePersonId: 11, VotePersonName: 'Ald. Smith', VoteValueName: 'Aye' }],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.getEventItemVotes(491773);
  assert.equal(out[0].person, 'Ald. Smith');
  assert.equal(out[0].value, 'Aye');
  assert.ok(calls[0].url.includes('/eventitems/491773/votes'));
});

test('searchMatters builds substringof + $top filter on /matters', async () => {
  const { fetch, calls } = fakeFetch({
    matters: [{ MatterId: 1, MatterFile: '230001', MatterTitle: 'XYZ Holdings rezoning' }],
  });
  const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: 'UA' });
  const out = await client.searchMatters({ query: 'XYZ Holdings', top: 20 });
  assert.equal(out[0].file, '230001');
  const url = decodeURIComponent(calls[0].url);
  assert.ok(url.includes("substringof('XYZ Holdings',MatterTitle)"));
  assert.ok(url.includes('$top=20'));
});
