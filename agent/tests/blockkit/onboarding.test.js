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
  it('Spanish role shows the Activar submit label', () => {
    const view = confirmModal('organizer', defaultsForRole('organizer'), 'es');
    assert.match(view.submit.text, /Activar/);
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
