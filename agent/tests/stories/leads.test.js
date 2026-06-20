import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { composeLeadAngles, filterByCommitteeOrTopic, selectStoryLeads } from '../../stories/leads.js';

const UPCOMING = [
  {
    eventItemId: 1,
    title: 'Resolution authorizing $4.2 million in bonding for street work',
    eventBodyName: 'Finance & Personnel Committee',
    eventDate: '2026-06-24',
  },
  {
    eventItemId: 2,
    title: 'An ordinance creating a police surveillance oversight board',
    eventBodyName: 'Common Council',
    eventDate: '2026-06-25',
  },
  {
    eventItemId: 3,
    title: 'Order for the demolition of 2500 W Vine St (7th Aldermanic District)',
    eventBodyName: 'Zoning, Neighborhoods & Development Committee',
    eventDate: '2026-06-23',
    walkOnFlag: true,
  },
  {
    eventItemId: 4,
    title: 'Communication relating to routine staffing',
    eventBodyName: 'Common Council',
    eventDate: '2026-06-22',
  },
  {
    eventItemId: 5,
    title: 'Appeal of the denial of a Class B Tavern license',
    eventBodyName: 'Licenses Committee',
    eventDate: '2026-06-26',
  },
];

describe('selectStoryLeads — newsworthiness lens over the agenda', () => {
  it('keeps only items with at least one newsworthiness tag (drops the routine item)', () => {
    const leads = selectStoryLeads(UPCOMING);
    const ids = leads.map((l) => l.item.eventItemId);
    assert.ok(!ids.includes(4), 'routine communication should not be a story lead');
    assert.ok(ids.includes(1) && ids.includes(2) && ids.includes(3) && ids.includes(5));
  });

  it('ranks by composite newsworthiness score, descending and deterministic', () => {
    const leads = selectStoryLeads(UPCOMING);
    const scores = leads.map((l) => l.score);
    assert.deepEqual(
      scores,
      [...scores].sort((a, b) => b - a),
    );
    // item 2 (money? no — accountability+novelty) and item 3 (equity+anomaly) outrank a single-tag lead
    assert.ok(leads[0].score >= leads[leads.length - 1].score);
    assert.deepEqual(
      selectStoryLeads(UPCOMING).map((l) => l.item.eventItemId),
      leads.map((l) => l.item.eventItemId),
    );
  });

  it('surfaces a real process anomaly (walk-on) as a tagged lead', () => {
    const lead = selectStoryLeads(UPCOMING).find((l) => l.item.eventItemId === 3);
    assert.ok(lead.tags.some((t) => t.kind === 'anomaly' && t.detail === 'walkOn'));
    assert.ok(lead.tags.some((t) => t.kind === 'equity'));
  });

  it('caps the result and carries MOO-123 salience reasons (district) as context', () => {
    const leads = selectStoryLeads(UPCOMING, { boundaries: [7], cap: 2 });
    assert.equal(leads.length, 2);
    const demo = selectStoryLeads(UPCOMING, { boundaries: [7] }).find((l) => l.item.eventItemId === 3);
    assert.ok(demo.reasons.some((r) => r.kind === 'district' && r.detail === '7'));
  });

  it('empty agenda → no leads (the quiet-week case)', () => {
    assert.deepEqual(selectStoryLeads([]), []);
  });
});

describe('filterByCommitteeOrTopic — the /gavel stories argument', () => {
  it('no query → the whole agenda', () => {
    const { items } = filterByCommitteeOrTopic(UPCOMING, '');
    assert.equal(items.length, UPCOMING.length);
  });

  it('a MOO-121 topic key (licenses) → only items matching that topic', () => {
    const { items, label } = filterByCommitteeOrTopic(UPCOMING, 'licenses');
    assert.ok(items.every((i) => /licens/i.test(i.eventBodyName) || /licens|tavern/i.test(i.title)));
    assert.ok(items.some((i) => i.eventItemId === 5));
    assert.match(label.toLowerCase(), /licens|bars/);
  });

  it('an arbitrary string → committee-name substring filter', () => {
    const { items } = filterByCommitteeOrTopic(UPCOMING, 'finance');
    assert.deepEqual(
      items.map((i) => i.eventItemId),
      [1],
    );
  });
});

describe('composeLeadAngles — enrich + ground the top leads (async, injected)', () => {
  const members = [
    {
      name: 'José G. Pérez',
      title: 'Alderman, District 12',
      imageUrl: 'http://img/perez.png',
      email: 'p@milwaukee.gov',
    },
  ];

  const deps = {
    enrich: async (item) => ({
      matter: {
        matterText:
          item.eventItemId === 2
            ? 'Creates a 9-member board to review police surveillance contracts worth $2 million.'
            : 'body',
        fileNumber: '230001',
      },
      event: {},
      person: item.eventItemId === 2 ? { name: 'José G. Pérez' } : null,
    }),
    generate: async ({ prompt }) => ({ hook: `hook for ${prompt.slice(0, 5)}`, whyStory: 'why' }),
    members,
  };

  it('enriches each lead, re-scores with matter text, attaches sponsor + angle', async () => {
    const leads = selectStoryLeads(UPCOMING).filter((l) => l.item.eventItemId === 2);
    const composed = await composeLeadAngles(leads, deps);
    const lead = composed[0];
    assert.equal(lead.angle.hook.startsWith('hook for'), true);
    assert.equal(lead.member?.name, 'José G. Pérez');
    assert.equal(lead.fileNumber, '230001');
    // re-scoring with the matter body adds the money tag the bare title lacked
    assert.ok(lead.tags.some((t) => t.kind === 'money'));
  });

  it('a failing angle degrades that lead to angle:null without killing the batch', async () => {
    const leads = selectStoryLeads(UPCOMING).slice(0, 2);
    const flaky = {
      ...deps,
      generate: async ({ prompt }) => {
        if (/police|surveillance|board/i.test(prompt)) throw new Error('model boom');
        return { hook: 'ok', whyStory: 'ok' };
      },
    };
    const composed = await composeLeadAngles(leads, flaky);
    assert.equal(composed.length, 2);
    assert.ok(composed.some((l) => l.angle === null));
    assert.ok(composed.some((l) => l.angle !== null));
  });

  it('passes language through to angle generation', async () => {
    let seenLang = '';
    const spy = {
      ...deps,
      generate: async ({ system }) => {
        seenLang = /español|spanish/i.test(system) ? 'es' : 'en';
        return { hook: 'h', whyStory: 'w' };
      },
    };
    await composeLeadAngles(selectStoryLeads(UPCOMING).slice(0, 1), { ...spy, language: 'es' });
    assert.equal(seenLang, 'es');
  });
});
