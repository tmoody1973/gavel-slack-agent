import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeHelpRoleSwitch, makeHomeHelp } from '../../../listeners/actions/help-buttons.js';

const noopLogger = { error() {} };

describe('makeHelpRoleSwitch — re-render the modal for the chosen persona', () => {
  it('updates the open view to the picked role, preserving language', async () => {
    let updated;
    const handler = makeHelpRoleSwitch();
    await handler({
      ack: async () => {},
      body: {
        actions: [{ value: 'reporter' }],
        view: { id: 'V1', private_metadata: JSON.stringify({ role: 'association', language: 'es' }) },
      },
      client: { views: { update: async (args) => (updated = args) } },
      logger: noopLogger,
    });
    assert.equal(updated.view_id, 'V1');
    assert.deepEqual(JSON.parse(updated.view.private_metadata), { role: 'reporter', language: 'es' });
  });
});

describe('makeHomeHelp — open help from App Home with the user’s primary role', () => {
  it('defaults to reporter when any channel is a reporter, EN unless all ES', async () => {
    let opened;
    const handler = makeHomeHelp({
      listSubscriptions: async () => [
        { role: 'association', language: 'en' },
        { role: 'reporter', language: 'es' },
      ],
    });
    await handler({
      ack: async () => {},
      body: { trigger_id: 'T1' },
      client: { views: { open: async (args) => (opened = args) } },
      logger: noopLogger,
    });
    assert.equal(opened.trigger_id, 'T1');
    const meta = JSON.parse(opened.view.private_metadata);
    assert.equal(meta.role, 'reporter');
    assert.equal(meta.language, 'en'); // not every channel is ES
  });

  it('renders Spanish when every subscribed channel is ES', async () => {
    let opened;
    const handler = makeHomeHelp({
      listSubscriptions: async () => [
        { role: 'organizer', language: 'es' },
        { role: 'association', language: 'es' },
      ],
    });
    await handler({
      ack: async () => {},
      body: { trigger_id: 'T2' },
      client: { views: { open: async (args) => (opened = args) } },
      logger: noopLogger,
    });
    assert.equal(JSON.parse(opened.view.private_metadata).language, 'es');
  });
});
