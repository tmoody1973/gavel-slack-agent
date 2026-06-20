import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { THEME_FAMILIES, themeOf } from '../../stories/cluster.js';

describe('themeOf — subject beat from the title (first-match precedence)', () => {
  it('resolves each of the 8 beats', () => {
    assert.equal(themeOf('A motion modifying Police Department pursuit policy'), 'police');
    assert.equal(themeOf('Communication relating to lead poisoning and public health'), 'health');
    assert.equal(themeOf('A rezoning of a vacant lot for housing'), 'housing');
    assert.equal(themeOf('Resolution approving a TIF district for redevelopment'), 'development');
    assert.equal(themeOf('Application for a Class B Tavern liquor license'), 'licenses');
    assert.equal(themeOf('Resolution relating to forestry and green space in a park'), 'parks');
    assert.equal(themeOf('Resolution for repaving and sewer work on N 27th St'), 'streets');
    assert.equal(themeOf('Confirmation of the mayoral appointment to a commission'), 'appointments');
  });

  it('returns null for an off-vocabulary title', () => {
    assert.equal(themeOf('Communication relating to routine staffing matters'), null);
    assert.equal(themeOf(''), null);
    assert.equal(themeOf(undefined), null);
  });

  it('first-match precedence: a TIF-for-a-development is development, not money/streets', () => {
    assert.equal(themeOf('Resolution authorizing $5 million in TIF for a development agreement'), 'development');
  });

  it('exposes 8 named families with emoji + regex', () => {
    assert.equal(THEME_FAMILIES.length, 8);
    assert.deepEqual(
      THEME_FAMILIES.map((f) => f.key),
      ['police', 'health', 'housing', 'development', 'licenses', 'parks', 'streets', 'appointments'],
    );
    for (const fam of THEME_FAMILIES) {
      assert.equal(typeof fam.emoji, 'string');
      assert.ok(fam.re instanceof RegExp);
    }
  });
});

import { clusterLeads } from '../../stories/cluster.js';

const lead = (over = {}) => ({
  item: { eventItemId: 1, title: 'x', eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-23' },
  tags: [{ kind: 'accountability' }],
  score: 5,
  reasons: [],
  ...over,
});

const police = (id, title) =>
  lead({ item: { eventItemId: id, title, eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-23' } });

describe('clusterLeads — group by committee + theme', () => {
  it('collapses the real 4-item police package into one cluster', () => {
    const leads = [
      police(1, 'A motion modifying Police Department duty to intervene SOP'),
      police(2, 'Communication relating to police pursuit policies'),
      police(3, 'Motion modifying Police SOP 660 Vehicle Pursuits and 575 Video Release'),
      police(4, 'Communication from the Fire and Police Commission on training'),
    ];
    const entries = clusterLeads(leads);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].kind, 'cluster');
    assert.equal(entries[0].theme, 'police');
    assert.equal(entries[0].committee, 'COMMON COUNCIL');
    assert.equal(entries[0].members.length, 4);
    assert.ok(entries[0].tags.some((t) => t.kind === 'accountability'));
  });

  it('does NOT merge unrelated items (conservative) — two singles', () => {
    const leads = [
      police(1, 'A motion on police use of force'),
      lead({
        item: {
          eventItemId: 9,
          title: 'Application for a tavern liquor license',
          eventBodyName: 'COMMON COUNCIL',
          eventDate: '2026-06-24',
        },
      }),
    ];
    const entries = clusterLeads(leads);
    assert.equal(entries.length, 2);
    assert.ok(entries.every((e) => e.kind === 'single'));
  });

  it('a lone themed item stays a single (needs ≥2 to cluster)', () => {
    const entries = clusterLeads([police(1, 'A motion on police pursuit')]);
    assert.equal(entries[0].kind, 'single');
  });

  it('null-theme items never cluster, even two in the same committee', () => {
    const leads = [
      lead({
        item: { eventItemId: 1, title: 'Communication relating to routine staffing', eventBodyName: 'COMMON COUNCIL' },
      }),
      lead({
        item: {
          eventItemId: 2,
          title: 'Communication relating to a procedural matter',
          eventBodyName: 'COMMON COUNCIL',
        },
      }),
    ];
    assert.equal(clusterLeads(leads).length, 2);
  });

  it('carries a shared district, omits a mixed one', () => {
    const shared = clusterLeads([
      police(1, 'Police matter in (7th Aldermanic District)'),
      police(2, 'Police pursuit policy (7th Aldermanic District)'),
    ]);
    assert.equal(shared[0].district, '7');
    const mixed = clusterLeads([
      police(1, 'Police matter (7th Aldermanic District)'),
      police(2, 'Police pursuit (6th Aldermanic District)'),
    ]);
    assert.equal(mixed[0].district, undefined);
  });

  it('a single carries its own district when the title names one', () => {
    const entries = clusterLeads([
      lead({
        item: {
          eventItemId: 5,
          title: 'A demolition at 2500 W Vine St (7th Aldermanic District)',
          eventBodyName: 'ZONING',
        },
      }),
    ]);
    assert.equal(entries[0].kind, 'single');
    assert.equal(entries[0].district, '7');
  });

  it('ranks by score desc and is deterministic + pure', () => {
    const leads = [
      lead({ item: { eventItemId: 1, title: 'tavern liquor license', eventBodyName: 'LICENSES' }, score: 3 }),
      police(2, 'police use of force A'),
      police(3, 'police pursuit B'),
    ];
    const frozen = JSON.parse(JSON.stringify(leads));
    const a = clusterLeads(leads);
    assert.equal(a[0].kind, 'cluster');
    assert.deepEqual(clusterLeads(leads), a);
    assert.deepEqual(leads, frozen);
  });
});
