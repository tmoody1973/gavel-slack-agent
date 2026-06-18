import assert from 'node:assert';
import { describe, it } from 'node:test';

import { confirmModal, homeConfigured, homeFirstRun, nudgeCard, roleModal } from '../../blockkit/onboarding.js';
import { defaultsForRole } from '../../onboarding/defaults.js';

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
  it('is a modal with the three role buttons wired to onboarding_pick_role', () => {
    const view = roleModal('en');
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'onboarding_role_modal');
    const actions = view.blocks.find((b) => b.type === 'actions');
    const values = actions.elements.map((e) => e.value);
    assert.deepStrictEqual(values, ['association', 'organizer', 'reporter']);
    for (const e of actions.elements) assert.equal(e.action_id, 'onboarding_pick_role');
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

describe('homeConfigured', () => {
  it('renders a status strip from configured channels', () => {
    const view = homeConfigured({
      channels: [
        { channelName: 'civic-alerts', committees: ['LICENSES COMMITTEE'], language: 'es', role: 'organizer' },
      ],
    });
    assert.equal(view.type, 'home');
    const json = JSON.stringify(view);
    assert.match(json, /civic-alerts/);
    assert.match(json, /Español|Spanish/);
  });
});
