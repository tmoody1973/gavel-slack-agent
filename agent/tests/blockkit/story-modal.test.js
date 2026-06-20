import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeFilter, storyModal } from '../../blockkit/story-modal.js';

const lead = (id, title, over = {}) => ({
  item: { eventItemId: id, title, eventBodyName: 'COMMON COUNCIL', eventDate: '2026-06-23', ...over.item },
  tags: over.tags ?? [{ kind: 'accountability' }],
  score: over.score ?? 5,
  reasons: [],
});

const police = [
  lead(1, 'A motion modifying Police use of force SOP'),
  lead(2, 'Communication on police pursuit policies'),
  lead(3, 'Motion modifying Police SOP 660 pursuits'),
];
const licenseSingle = lead(9, 'tavern liquor license renewal', {
  item: { eventBodyName: 'LICENSES COMMITTEE' },
  tags: [{ kind: 'conflict' }],
  score: 3,
});
const districtItem = lead(11, 'Rezoning at 2000 W Vliet St (7th Aldermanic District)', {
  item: { eventBodyName: 'ZONING COMMITTEE' },
  tags: [{ kind: 'equity' }],
  score: 4,
});

const leads = [...police, licenseSingle, districtItem];

const flatText = (view) => JSON.stringify(view.blocks);
const allOptions = (view) =>
  view.blocks
    .flatMap((b) => b.elements ?? [])
    .filter((e) => e.type === 'static_select')
    .flatMap((s) => (s.option_groups ?? []).flatMap((g) => g.options));

describe('storyModal — filterable Story-leads browse modal (MOO-130)', () => {
  it('is a modal view with a Close button and the story_browse callback', () => {
    const view = storyModal(leads, { language: 'en', filter: { t: 'all' } });
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'story_browse_modal');
    assert.ok(view.close, 'has a Close button');
    assert.ok(view.blocks.length <= 100, 'stays under Slack 100-block modal cap');
  });

  it('carries a static_select filter (story_modal_filter) with All / committee / topic / district groups', () => {
    const view = storyModal(leads, { language: 'en', filter: { t: 'all' } });
    const select = view.blocks
      .flatMap((b) => b.elements ?? [])
      .find((e) => e.action_id === 'story_modal_filter');
    assert.ok(select, 'filter present');
    const labels = (select.option_groups ?? []).map((g) => g.label.text).join(' | ');
    assert.match(labels, /Committee/i);
    assert.match(labels, /Topic/i);
    assert.match(labels, /District/i);
    // committee + district options are derived from the actual leads, plus the "all" option
    const vals = allOptions(view).map((o) => o.value);
    assert.ok(vals.includes('all'), 'has an All story leads option');
    assert.ok(vals.includes('c::COMMON COUNCIL'));
    assert.ok(vals.includes('c::LICENSES COMMITTEE'));
    assert.ok(vals.includes('d::7'));
  });

  it('groups leads by beat with member rows; each row has a Watch+Ask overflow', () => {
    const view = storyModal(police, { language: 'en', filter: { t: 'all' } });
    const text = flatText(view);
    assert.equal((text.match(/Police & public safety/g) || []).length, 1, 'one beat header');
    for (const t of ['use of force', 'pursuit policies', 'SOP 660']) assert.match(text, new RegExp(t));
    const overflow = view.blocks.find((b) => b.accessory?.action_id === 'story_lead_overflow');
    assert.ok(overflow, 'per-row overflow present');
    const optVals = overflow.accessory.options.map((o) => o.value);
    assert.deepEqual(optVals, ['w::1', 'a::1']);
  });

  it('filter=committee narrows to that committee only', () => {
    const view = storyModal(leads, { language: 'en', filter: { t: 'committee', v: 'LICENSES COMMITTEE' } });
    const text = flatText(view);
    assert.match(text, /tavern liquor license/);
    assert.doesNotMatch(text, /use of force/);
  });

  it('filter=district narrows to that district only', () => {
    const view = storyModal(leads, { language: 'en', filter: { t: 'district', v: '7' } });
    const text = flatText(view);
    assert.match(text, /2000 W Vliet/);
    assert.doesNotMatch(text, /use of force/);
  });

  it('filter=topic narrows via the MOO-121 topic mapping (licenses → liquor license)', () => {
    const view = storyModal(leads, { language: 'en', filter: { t: 'topic', v: 'licenses' } });
    const text = flatText(view);
    assert.match(text, /tavern liquor license/);
    assert.doesNotMatch(text, /use of force/);
  });

  it('reflects the active filter as the select initial_option', () => {
    const view = storyModal(leads, { language: 'en', filter: { t: 'committee', v: 'COMMON COUNCIL' } });
    const select = view.blocks.flatMap((b) => b.elements ?? []).find((e) => e.action_id === 'story_modal_filter');
    assert.equal(select.initial_option?.value, 'c::COMMON COUNCIL');
  });

  it('an empty filter result shows a friendly line but keeps the filter usable', () => {
    const view = storyModal(leads, { language: 'en', filter: { t: 'committee', v: 'NONEXISTENT BOARD' } });
    const text = flatText(view).toLowerCase();
    assert.match(text, /no story leads|nothing/);
    assert.ok(view.blocks.flatMap((b) => b.elements ?? []).some((e) => e.action_id === 'story_modal_filter'));
  });

  it('stashes language + filter in private_metadata for the views.update handler', () => {
    const view = storyModal(leads, { language: 'es', filter: { t: 'district', v: '7' } });
    const meta = JSON.parse(view.private_metadata);
    assert.equal(meta.language, 'es');
    assert.equal(meta.filter, 'd::7');
  });

  it('bilingual: ES beat label + ES overflow actions', () => {
    const view = storyModal(police, { language: 'es', filter: { t: 'all' } });
    const text = flatText(view);
    assert.match(text, /Policía y seguridad/);
    assert.match(text, /Seguir/); // ES watch
    assert.match(text, /Pregúntale a Gavel|Preguntar/); // ES ask
  });

  it('empty leads → still a valid modal with a quiet-week line', () => {
    const view = storyModal([], { language: 'en', filter: { t: 'all' } });
    assert.equal(view.type, 'modal');
    assert.match(flatText(view).toLowerCase(), /quiet|no story leads/);
  });
});

describe('decodeFilter — value → filter object (shared with the handler)', () => {
  it('round-trips every filter kind', () => {
    assert.deepEqual(decodeFilter('all'), { t: 'all' });
    assert.deepEqual(decodeFilter('c::COMMON COUNCIL'), { t: 'committee', v: 'COMMON COUNCIL' });
    assert.deepEqual(decodeFilter('t::licenses'), { t: 'topic', v: 'licenses' });
    assert.deepEqual(decodeFilter('d::7'), { t: 'district', v: '7' });
  });
  it('defaults to all on missing/garbage', () => {
    assert.deepEqual(decodeFilter(undefined), { t: 'all' });
    assert.deepEqual(decodeFilter('???'), { t: 'all' });
  });
});
