import assert from 'node:assert/strict';
import { test } from 'node:test';

import { handleGavelCommand, parseGavelCommand } from '../../../listeners/commands/gavel.js';

// ---------- parseGavelCommand (pure) ----------

test('parses watch with an entity', () => {
  assert.deepEqual(parseGavelCommand('watch 2000 S 13th St'), { subcommand: 'watch', args: '2000 S 13th St' });
});

test('parses bare subcommands and trims whitespace', () => {
  assert.deepEqual(parseGavelCommand('  status  '), { subcommand: 'status', args: '' });
  assert.deepEqual(parseGavelCommand('unwatch'), { subcommand: 'unwatch', args: '' });
  assert.deepEqual(parseGavelCommand('digest'), { subcommand: 'digest', args: '' });
});

test('subcommand matching is case-insensitive, args keep their case', () => {
  assert.deepEqual(parseGavelCommand('Watch Punta Cana LLC'), { subcommand: 'watch', args: 'Punta Cana LLC' });
});

test('empty or unknown input parses as help', () => {
  assert.equal(parseGavelCommand('').subcommand, 'help');
  assert.equal(parseGavelCommand('   ').subcommand, 'help');
  assert.equal(parseGavelCommand('frobnicate now').subcommand, 'help');
});

// ---------- handleGavelCommand ----------

function harness({ text, subscription = null, watches = [] }) {
  const calls = { ack: 0, responds: [], added: [] };
  const args = {
    command: { text, channel_id: 'C123', user_id: 'U1' },
    ack: async () => {
      calls.ack += 1;
    },
    respond: async (message) => calls.responds.push(message),
    logger: { error: () => {} },
  };
  const deps = {
    addWatch: async ({ channelId, entity }) => {
      calls.added.push({ channelId, entity });
      return 'watch_id_1';
    },
    getSubscription: async () => subscription,
    listWatches: async () => watches,
  };
  return { calls, args, deps };
}

test('acks before responding and always responds ephemerally', async () => {
  const h = harness({ text: 'status' });
  await handleGavelCommand(h.args, h.deps);
  assert.equal(h.calls.ack, 1);
  assert.equal(h.calls.responds.length, 1);
  assert.equal(h.calls.responds[0].response_type, 'ephemeral');
});

test('watch <entity> writes a watch for this channel and confirms it', async () => {
  const h = harness({ text: 'watch Punta Cana LLC' });
  await handleGavelCommand(h.args, h.deps);
  assert.deepEqual(h.calls.added, [{ channelId: 'C123', entity: 'Punta Cana LLC' }]);
  assert.match(h.calls.responds[0].text, /Punta Cana LLC/);
  assert.match(h.calls.responds[0].text, /[Ww]atching/);
});

test('the first watch on a channel proposes a #gavel-watchlist (How → checklist)', async () => {
  const h = harness({ text: 'watch Punta Cana LLC', watches: [{ entity: 'Punta Cana LLC' }] });
  await handleGavelCommand(h.args, h.deps);
  const response = h.calls.responds[0];
  assert.match(JSON.stringify(response.blocks), /grow_watchlist_how/);
  assert.match(JSON.stringify(response.blocks), /#gavel-watchlist/);
});

test('a later watch (channel already has watches) stays plain — no growth prompt', async () => {
  const h = harness({ text: 'watch Another LLC', watches: [{ entity: 'A' }, { entity: 'Another LLC' }] });
  await handleGavelCommand(h.args, h.deps);
  assert.equal(h.calls.responds[0].blocks, undefined);
});

test('watch with no entity explains usage instead of writing', async () => {
  const h = harness({ text: 'watch' });
  await handleGavelCommand(h.args, h.deps);
  assert.deepEqual(h.calls.added, []);
  assert.match(h.calls.responds[0].text, /watch <entity>/);
});

test('status reports committees, keywords, language, and watches', async () => {
  const h = harness({
    text: 'status',
    subscription: {
      committees: ['LICENSES COMMITTEE'],
      keywords: ['rezoning'],
      language: 'es',
    },
    watches: [{ entity: 'Punta Cana LLC' }, { entity: '2000 S 13th St' }],
  });
  await handleGavelCommand(h.args, h.deps);
  const text = h.calls.responds[0].text;
  assert.match(text, /LICENSES COMMITTEE/);
  assert.match(text, /rezoning/);
  assert.match(text, /es|Español|Spanish/i);
  assert.match(text, /Punta Cana LLC/);
  assert.match(text, /2000 S 13th St/);
});

test('status without a subscription says the channel is not configured', async () => {
  const h = harness({ text: 'status' });
  await handleGavelCommand(h.args, h.deps);
  assert.match(h.calls.responds[0].text, /not.*configured|no subscription/i);
});

test('digest responds as a registered stub (ships in UX-D)', async () => {
  const h = harness({ text: 'digest' });
  await handleGavelCommand(h.args, h.deps);
  assert.equal(h.calls.responds.length, 1);
  assert.match(h.calls.responds[0].text, /coming|Phase 3/i);
});

test('help lists the available subcommands', async () => {
  const h = harness({ text: '' });
  await handleGavelCommand(h.args, h.deps);
  const text = h.calls.responds[0].text;
  for (const sub of ['watch', 'status', 'unwatch', 'digest']) {
    assert.ok(text.includes(sub), `help missing "${sub}"`);
  }
});

test('a bare /gavel in an unconfigured channel surfaces the Set up Gavel nudge', async () => {
  const h = harness({ text: '' }); // subscription defaults to null (unconfigured)
  await handleGavelCommand(h.args, h.deps);
  const response = h.calls.responds[0];
  assert.match(JSON.stringify(response.blocks), /onboarding_open_role/);
  assert.match(JSON.stringify(response.blocks), /Set up Gavel/);
});

test('the first-touch nudge honors an unconfigured channel’s existing language', async () => {
  const h = harness({ text: '', subscription: { language: 'es' } }); // not configured
  await handleGavelCommand(h.args, h.deps);
  assert.match(JSON.stringify(h.calls.responds[0].blocks), /Configurar Gavel/);
});

test('a bare /gavel in a configured channel shows plain help, no nudge blocks', async () => {
  const h = harness({ text: '', subscription: { configured: true, committees: [], keywords: [], language: 'en' } });
  await handleGavelCommand(h.args, h.deps);
  const response = h.calls.responds[0];
  assert.equal(response.blocks, undefined);
  assert.match(response.text, /Gavel commands/);
});

test('a Convex failure responds with an error instead of throwing', async () => {
  const h = harness({ text: 'watch X' });
  h.deps.addWatch = async () => {
    throw new Error('convex down');
  };
  await handleGavelCommand(h.args, h.deps);
  assert.equal(h.calls.ack, 1);
  assert.match(h.calls.responds[0].text, /wrong|fail/i);
});

// ---------- /gavel unwatch (MOO-73) ----------

function unwatchDeps(removeResult) {
  const removed = [];
  return {
    removed,
    deps: {
      addWatch: async () => 'watch_id_1',
      getSubscription: async () => null,
      listWatches: async () => [],
      removeWatch: async (input) => {
        removed.push(input);
        return removeResult;
      },
    },
  };
}

test('unwatch removes an existing watch and confirms', async () => {
  const { removed, deps } = unwatchDeps('some_id');
  const responses = [];
  await handleGavelCommand(
    {
      command: { text: 'unwatch File #260039', channel_id: 'C1' },
      ack: async () => {},
      respond: async (r) => responses.push(r),
    },
    deps,
  );
  assert.deepEqual(removed, [{ channelId: 'C1', entity: 'File #260039' }]);
  assert.match(responses[0].text, /No longer watching/);
});

test('unwatch with no match says so and points at status', async () => {
  const { deps } = unwatchDeps(null);
  const responses = [];
  await handleGavelCommand(
    {
      command: { text: 'unwatch Nothing Here', channel_id: 'C1' },
      ack: async () => {},
      respond: async (r) => responses.push(r),
    },
    deps,
  );
  assert.match(responses[0].text, /isn’t watching|not watching/i);
  assert.match(responses[0].text, /\/gavel status/);
});

test('unwatch with no args shows usage', async () => {
  const { removed, deps } = unwatchDeps(null);
  const responses = [];
  await handleGavelCommand(
    { command: { text: 'unwatch', channel_id: 'C1' }, ack: async () => {}, respond: async (r) => responses.push(r) },
    deps,
  );
  assert.equal(removed.length, 0);
  assert.match(responses[0].text, /Usage: `\/gavel unwatch <entity>`/);
});

// ---------- /gavel stories (MOO-127 Story Radar) ----------

test('parses stories with a committee/topic argument', () => {
  assert.deepEqual(parseGavelCommand('stories licenses'), { subcommand: 'stories', args: 'licenses' });
  assert.deepEqual(parseGavelCommand('stories'), { subcommand: 'stories', args: '' });
});

function storiesHarness({ text, subscription = null, upcoming, language } = {}) {
  const calls = { ack: 0, responds: [] };
  const args = {
    command: { text, channel_id: 'C1', user_id: 'U1' },
    ack: async () => {
      calls.ack += 1;
    },
    respond: async (m) => calls.responds.push(m),
    logger: { error: () => {} },
  };
  const items = upcoming ?? [
    {
      eventId: 11,
      eventItemId: 5,
      eventBodyName: 'Licenses Committee',
      title: 'Appeal of the denial of a Class B Tavern license',
      eventDate: '2026-06-26',
    },
    {
      eventId: 12,
      eventItemId: 6,
      eventBodyName: 'Common Council',
      title: 'Communication relating to routine staffing',
      eventDate: '2026-06-22',
    },
  ];
  const deps = {
    getSubscription: async () => subscription ?? (language ? { language } : null),
    listUpcoming: async () => items,
    listMembers: async () => [{ name: 'José G. Pérez', title: 'Alderman', imageUrl: 'http://i/p.png' }],
    enrichLead: async () => ({ matter: { matterText: 'body', fileNumber: '230099' }, event: {}, person: null }),
    generateAngle: async ({ system }) => ({
      hook: /español|spanish/i.test(system) ? 'gancho' : 'hook',
      whyStory: 'why',
    }),
    countTranscript: async () => 0,
  };
  return { calls, args, deps };
}

test('stories posts a status line first, then ranked leads with a grounded angle', async () => {
  const h = storiesHarness({ text: 'stories licenses' });
  await handleGavelCommand(h.args, h.deps);
  assert.equal(h.calls.ack, 1);
  assert.equal(h.calls.responds.length, 2);
  assert.match(h.calls.responds[0].text, /Digging through/);
  const result = JSON.stringify(h.calls.responds[1].blocks);
  assert.match(result, /Class B Tavern license/);
  assert.match(result, /hook/);
  assert.match(h.calls.responds[1].text, /Story leads — Bars & licenses/);
});

test('stories with no leads in the filter posts a friendly empty line', async () => {
  const h = storiesHarness({
    text: 'stories streets',
    upcoming: [
      {
        eventId: 1,
        eventItemId: 9,
        eventBodyName: 'Common Council',
        title: 'Communication, routine',
        eventDate: '2026-06-22',
      },
    ],
  });
  await handleGavelCommand(h.args, h.deps);
  assert.equal(h.calls.responds.length, 2);
  assert.match(h.calls.responds[1].text, /No story leads/i);
});

test('stories honors the channel language (ES status + Spanish angle)', async () => {
  const h = storiesHarness({ text: 'stories', language: 'es' });
  await handleGavelCommand(h.args, h.deps);
  assert.match(h.calls.responds[0].text, /Revisando la agenda/);
  assert.match(JSON.stringify(h.calls.responds[1].blocks), /gancho/);
});
