import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runEscalationSweep } from '../../escalation/sweep.js';

const REC = [{ date: '2026-05-20', body: 'ZONING COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' }];
const HELD = [{ date: '2026-05-20', body: 'ZONING COMMITTEE', action: 'HELD TO CALL OF THE CHAIR', result: 'Pass' }];

function harness({ tracked, escalatedIds = [], historyByMatter, subs }) {
  const posted = [];
  const recorded = [];
  return {
    posted,
    recorded,
    deps: {
      client: 'milwaukee',
      detectedSince: 0,
      now: () => 1_700_000_000_000,
      listTrackedMatters: async () => tracked,
      listEscalatedMatterIds: async () => escalatedIds,
      listSubscriptions: async () => subs,
      getMatterHistory: async (id) => historyByMatter[id] ?? [],
      getMatterMeta: async (id) => ({
        fileNumber: `F${id}`,
        guid: `G${id}`,
        title: `Title ${id}`,
        statusName: 'In Committee',
      }),
      matterUrl: (id, guid) => `https://legistar/${id}?GUID=${guid}`,
      buildCard: (info, language) => ({ text: `card:${info.fileNumber}:${language}`, blocks: [{ info, language }] }),
      postCard: async (channel, card) => posted.push({ channel, card }),
      recordEscalation: async (rec) => recorded.push(rec),
      languageFor: (ch) => (ch === 'CES' ? 'es' : 'en'),
      logger: { error() {}, log() {} },
    },
  };
}

const sub = (channelId, committees = [], keywords = []) => ({ channelId, committees, keywords });

test('recommended matter → pings the subscribed channel and records once', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Rezoning', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 1: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  const summary = await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].channel, 'C1');
  assert.equal(h.recorded.length, 1);
  assert.equal(h.recorded[0].matterId, 1);
  assert.equal(h.recorded[0].channelsPinged, 1);
  assert.equal(h.recorded[0].escalatedAt, 1_700_000_000_000);
  assert.equal(summary.pinged, 1);
});

test('in-committee-only matter → no ping, no record', async () => {
  const h = harness({
    tracked: [{ matterId: 2, title: 'Held thing', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 2: HELD },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  const summary = await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 0);
  assert.equal(summary.detected, 0);
});

test('already-escalated matter is skipped', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Rezoning', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    escalatedIds: [1],
    historyByMatter: { 1: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 0);
});

test('recommended but no subscribed channel → still recorded (0 pings) so it is not rechecked forever', async () => {
  const h = harness({
    tracked: [{ matterId: 3, title: 'Nobody watches', eventBodyName: 'PARKS COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 3: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  await runEscalationSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 1);
  assert.equal(h.recorded[0].channelsPinged, 0);
});

test('detectedSince filters out stale tracked matters', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Old', eventBodyName: 'ZONING COMMITTEE', detectedAt: 5 }],
    historyByMatter: { 1: REC },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  h.deps.detectedSince = 100; // matter detectedAt=5 is older → skipped
  const summary = await runEscalationSweep(h.deps);
  assert.equal(summary.trackedCount, 0);
  assert.equal(h.posted.length, 0);
});

test('recommendedAfter: a stale (old) recommendation is skipped', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Old rec', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: {
      1: [{ date: '2023-06-26', body: 'ZONING COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' }],
    },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  h.deps.recommendedAfter = '2026-06-01';
  const summary = await runEscalationSweep(h.deps);
  assert.equal(summary.detected, 0);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 0);
});

test('recommendedAfter: a fresh recommendation still fires', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Fresh rec', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: {
      1: [{ date: '2026-06-16', body: 'ZONING COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' }],
    },
    subs: [sub('C1', ['ZONING COMMITTEE'])],
  });
  h.deps.recommendedAfter = '2026-06-01';
  const summary = await runEscalationSweep(h.deps);
  assert.equal(summary.pinged, 1);
});

test('ES channel gets the ES card variant', async () => {
  const h = harness({
    tracked: [{ matterId: 1, title: 'Rezoning', eventBodyName: 'ZONING COMMITTEE', detectedAt: 10 }],
    historyByMatter: { 1: REC },
    subs: [sub('CES', ['ZONING COMMITTEE'])],
  });
  await runEscalationSweep(h.deps);
  assert.equal(h.posted[0].card.text, 'card:F1:es');
});
