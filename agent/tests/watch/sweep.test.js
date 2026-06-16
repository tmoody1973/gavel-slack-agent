import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runWatchSweep } from '../../watch/sweep.js';

const MATTERS = [
  {
    matterId: 1,
    file: '260229',
    title: 'Sale of 2000 S 13th St to Punta Cana LLC',
    name: 'Sale',
    typeName: 'Resolution',
  },
  { matterId: 2, file: '260300', title: 'Unrelated street repaving', name: 'Repaving', typeName: 'Resolution' },
];

function harness({ watches, alertedKeys = [], permitsByEntity = {} }) {
  const posted = [];
  const recorded = [];
  const alerted = [...alertedKeys];
  return {
    posted,
    recorded,
    deps: {
      watches,
      lookbackDays: 7,
      sinceDate: '2026-06-09',
      now: () => 1_700_000_000_000,
      fetchRecentMatters: async () => MATTERS,
      resolvePermitHits: async (watch) => permitsByEntity[watch.entity] ?? [],
      listAlertedKeys: async () => alerted,
      buildCard: (hits) => ({ text: `card:${hits.length}`, blocks: [{ hits }] }),
      postCard: async (channelId, card) => posted.push({ channelId, card }),
      recordAlerts: async (alerts) => {
        recorded.push(...alerts);
        return alerts.length;
      },
      languageFor: () => 'en',
      logger: { log() {} },
    },
  };
}

test('cold run: a watched LLC matches a new matter and posts to its channel', async () => {
  const h = harness({ watches: [{ channelId: 'C1', entity: 'Punta Cana LLC', client: 'milwaukee' }] });
  const summary = await runWatchSweep(h.deps);
  assert.equal(h.posted.length, 1);
  assert.equal(h.posted[0].channelId, 'C1');
  assert.equal(h.recorded.length, 1);
  assert.equal(h.recorded[0].kind, 'matter');
  assert.equal(h.recorded[0].refId, '1');
  assert.equal(h.recorded[0].alertedAt, 1_700_000_000_000);
  assert.equal(summary.freshHits, 1);
});

test('idempotent: an already-recorded match is not re-posted', async () => {
  const h = harness({
    watches: [{ channelId: 'C1', entity: 'Punta Cana LLC', client: 'milwaukee' }],
    alertedKeys: [{ channelId: 'C1', entity: 'Punta Cana LLC', kind: 'matter', refId: '1' }],
  });
  const summary = await runWatchSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 0);
  assert.equal(summary.freshHits, 0);
});

test('permit hit via resolvePermitHits is posted and recorded', async () => {
  const h = harness({
    watches: [{ channelId: 'C2', entity: '2000 S 13th St', client: 'milwaukee' }],
    permitsByEntity: {
      '2000 S 13th St': [
        { recordId: 'RES-1', address: '2000 S 13TH ST', type: 'Wrecking Permit', status: 'Issued', date: '2026-06-12' },
      ],
    },
  });
  await runWatchSweep(h.deps);
  // matter #1 title also contains "2000 S 13th St" → matter + permit both hit
  const kinds = h.recorded.map((r) => r.kind).sort();
  assert.deepEqual(kinds, ['matter', 'permit']);
  assert.equal(h.posted.length, 1); // one card to C2 with both hits
  assert.equal(h.posted[0].card.blocks[0].hits.length, 2);
});

test('two channels watching different entities each get their own card', async () => {
  const h = harness({
    watches: [
      { channelId: 'C1', entity: 'Punta Cana LLC', client: 'milwaukee' },
      { channelId: 'C2', entity: 'repaving', client: 'milwaukee' },
    ],
  });
  await runWatchSweep(h.deps);
  assert.equal(h.posted.length, 2);
  assert.deepEqual(h.posted.map((p) => p.channelId).sort(), ['C1', 'C2']);
});

test('no matches → nothing posted or recorded', async () => {
  const h = harness({ watches: [{ channelId: 'C1', entity: 'nonexistent parcel xyz', client: 'milwaukee' }] });
  const summary = await runWatchSweep(h.deps);
  assert.equal(h.posted.length, 0);
  assert.equal(h.recorded.length, 0);
  assert.equal(summary.matterCount, 2);
});
