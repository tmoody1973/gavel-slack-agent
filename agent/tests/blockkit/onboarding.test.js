import assert from 'node:assert';
import { describe, it } from 'node:test';

import { confirmModal, homeFirstRun, memberWelcomeCard, nudgeCard, roleModal } from '../../blockkit/onboarding.js';
import { defaultsForRole } from '../../onboarding/defaults.js';

describe('memberWelcomeCard', () => {
  it('renders the welcome + Ask Gavel / What can you do buttons carrying the language', () => {
    const card = memberWelcomeCard('en');
    const json = JSON.stringify(card);
    assert.match(json, /watch Milwaukee city hall for your block/);
    const actions = card.blocks.find((b) => b.type === 'actions');
    assert.deepStrictEqual(
      actions.elements.map((e) => e.action_id),
      ['member_ask_gavel', 'member_what_can_you_do'],
    );
    for (const e of actions.elements) assert.equal(e.value, 'en');
  });

  it('localizes to Spanish', () => {
    const json = JSON.stringify(memberWelcomeCard('es'));
    assert.match(json, /Vigilo el ayuntamiento de Milwaukee/);
    assert.match(json, /Pregúntale a Gavel/);
  });
});

describe('nudgeCard', () => {
  it('renders the intro + a Set up Gavel button that opens the role modal', () => {
    const card = nudgeCard('en');
    const json = JSON.stringify(card);
    assert.match(json, /I'm Gavel/);
    const actions = card.blocks.find((b) => b.type === 'actions');
    const button = actions.elements[0];
    assert.equal(button.action_id, 'onboarding_open_role');
    assert.match(button.text.text, /Set up Gavel/);
  });
  it('localizes to Spanish', () => {
    assert.match(JSON.stringify(nudgeCard('es')), /Configurar Gavel/);
  });
});

describe('roleModal', () => {
  it('is a modal whose three role buttons carry the role and a UNIQUE action_id', () => {
    const view = roleModal('en');
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'onboarding_role_modal');
    const actions = view.blocks.find((b) => b.type === 'actions');
    const values = actions.elements.map((e) => e.value);
    assert.deepStrictEqual(values, ['association', 'organizer', 'reporter']);
    const ids = actions.elements.map((e) => e.action_id);
    // Slack rejects a view with duplicate action_ids — they must be distinct...
    assert.equal(new Set(ids).size, 3, 'action_ids must be unique within the view');
    // ...and the prefix is what the handler registers against.
    for (const e of actions.elements) assert.match(e.action_id, /^onboarding_pick_role_/);
  });
});

describe('confirmModal', () => {
  it('pre-fills committees/language from defaultsForRole and submits via Go live', () => {
    const defaults = defaultsForRole('association');
    const view = confirmModal('association', defaults, 'en');
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'onboarding_confirm_modal');
    assert.match(view.submit.text, /Go live/);
    const json = JSON.stringify(view);
    assert.match(json, /ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE/);
    const meta = JSON.parse(view.private_metadata);
    assert.equal(meta.role, 'association');
    assert.deepStrictEqual(meta.defaults, defaults);
    assert.equal(meta.channelId, null);
  });

  it('pre-fills the channel picker when launched from inside a channel', () => {
    const view = confirmModal('reporter', defaultsForRole('reporter'), 'en', 'C0B8KS5VCCC');
    const input = view.blocks.find((b) => b.type === 'input' && b.block_id === 'onboarding_channel');
    assert.equal(input.element.action_id, 'onboarding_channel_select');
    assert.equal(input.element.initial_conversation, 'C0B8KS5VCCC');
    assert.equal(JSON.parse(view.private_metadata).channelId, 'C0B8KS5VCCC');
  });

  it('omits the pre-fill (shows a picker) when there is no channel context', () => {
    const view = confirmModal('reporter', defaultsForRole('reporter'), 'en');
    const input = view.blocks.find((b) => b.type === 'input' && b.block_id === 'onboarding_channel');
    assert.ok(!('initial_conversation' in input.element), 'no pre-fill when channel unknown');
  });

  it('offers an optional neighborhood typeahead → district boundary (MOO-131)', () => {
    const view = confirmModal('association', defaultsForRole('association'), 'en');
    const block = view.blocks.find((b) => b.block_id === 'onboarding_neighborhood_block');
    assert.ok(block, 'neighborhood block present');
    assert.equal(block.optional, true, 'skippable for reporters covering all');
    assert.equal(block.element.type, 'external_select');
    assert.equal(block.element.action_id, 'onboarding_neighborhood');
  });

  it('localizes the neighborhood label to Spanish', () => {
    const view = confirmModal('organizer', defaultsForRole('organizer'), 'es');
    const block = view.blocks.find((b) => b.block_id === 'onboarding_neighborhood_block');
    assert.match(block.label.text, /vecindario/i);
  });
  it('Spanish role shows the Activar submit label', () => {
    const view = confirmModal('organizer', defaultsForRole('organizer'), 'es');
    assert.match(view.submit.text, /Activar/);
  });
});

describe('confirmModal topic chips (MOO-121)', () => {
  const findTopics = (view) => view.blocks.find((b) => b.type === 'input' && b.block_id === 'onboarding_topics_block');

  it('renders plain-language topic chips as a checkboxes input with a unique action_id', () => {
    const view = confirmModal('association', defaultsForRole('association'), 'en');
    const block = findTopics(view);
    assert.ok(block, 'confirm modal carries a topics input block');
    assert.equal(block.element.type, 'checkboxes');
    assert.equal(block.element.action_id, 'onboarding_topics');
    const values = block.element.options.map((o) => o.value);
    assert.deepStrictEqual(values, ['housing', 'licenses', 'streets', 'parks', 'safety', 'budget']);
    // every chip is plain English language, not a committee EventBodyName
    assert.match(JSON.stringify(block.element.options), /Housing & development/);
    assert.doesNotMatch(JSON.stringify(block.element.options), /COMMITTEE/);
    // action_ids unique across the whole view (the FD-B duplicate-id bug)
    const ids = JSON.stringify(view).match(/"action_id":"[^"]+"/g) ?? [];
    assert.equal(new Set(ids).size, ids.length, 'all action_ids unique within the view');
  });

  it('pre-checks the chips that map from the role defaults', () => {
    // association defaults → ZONING/LICENSES/CED ⇒ housing + licenses topics on
    const view = confirmModal('association', defaultsForRole('association'), 'en');
    const initial = findTopics(view).element.initial_options.map((o) => o.value);
    assert.deepStrictEqual(initial.sort(), ['housing', 'licenses']);
  });

  it('reporter defaults pre-check housing + licenses + streets', () => {
    const view = confirmModal('reporter', defaultsForRole('reporter'), 'en');
    const initial = findTopics(view).element.initial_options.map((o) => o.value);
    assert.deepStrictEqual(initial.sort(), ['housing', 'licenses', 'streets']);
  });

  it('localizes chip labels to Spanish while keeping committees out of the visible chips', () => {
    const view = confirmModal('organizer', defaultsForRole('organizer'), 'es');
    const labels = JSON.stringify(findTopics(view).element.options);
    assert.match(labels, /Vivienda y desarrollo/);
    assert.match(labels, /Bares y licencias/);
  });

  it('still threads the full defaults through private_metadata for the write-through fallback', () => {
    const defaults = defaultsForRole('association');
    const view = confirmModal('association', defaults, 'en');
    assert.deepStrictEqual(JSON.parse(view.private_metadata).defaults, defaults);
  });
});

describe('homeFirstRun', () => {
  it('is a home view with a Set up button (the fallback path)', () => {
    const view = homeFirstRun('en');
    assert.equal(view.type, 'home');
    const json = JSON.stringify(view);
    assert.match(json, /onboarding_open_role/);
    assert.match(json, /Set up Gavel/);
  });
});
