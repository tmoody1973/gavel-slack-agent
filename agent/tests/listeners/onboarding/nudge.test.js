import assert from 'node:assert';
import { describe, it } from 'node:test';

import { isConfigured, nudgeResponse } from '../../../listeners/onboarding/nudge.js';

describe('isConfigured', () => {
  it('is true only when the subscription is marked configured', () => {
    assert.equal(isConfigured({ configured: true }), true);
    assert.equal(isConfigured({ configured: false }), false);
    assert.equal(isConfigured({}), false);
    assert.equal(isConfigured(null), false);
    assert.equal(isConfigured(undefined), false);
  });
});

describe('nudgeResponse', () => {
  it('is an ephemeral Set up Gavel card', () => {
    const res = nudgeResponse('en');
    assert.equal(res.response_type, 'ephemeral');
    assert.match(JSON.stringify(res.blocks), /onboarding_open_role/);
    assert.match(JSON.stringify(res.blocks), /Set up Gavel/);
  });

  it('localizes and keeps the help text below the nudge as a fallback', () => {
    const res = nudgeResponse('es', '*Gavel commands*\n• /gavel watch');
    assert.match(JSON.stringify(res.blocks), /Configurar Gavel/);
    assert.equal(res.text, '*Gavel commands*\n• /gavel watch');
    assert.match(JSON.stringify(res.blocks), /Gavel commands/);
  });
});
