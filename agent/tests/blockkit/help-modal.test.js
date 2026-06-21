import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { helpModal } from '../../blockkit/help-modal.js';
import { GUIDE_URL, helpForRole } from '../../help/guide.js';

const findButtons = (view) =>
  view.blocks.filter((b) => b.type === 'actions').flatMap((b) => b.elements.filter((e) => e.type === 'button'));

describe('helpModal — the role-aware help view', () => {
  it('is a valid modal carrying role + language in private_metadata', () => {
    const view = helpModal({ role: 'reporter', language: 'en' });
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'help_modal');
    assert.deepEqual(JSON.parse(view.private_metadata), { role: 'reporter', language: 'en' });
    assert.ok(view.blocks.length <= 100, 'stays under the Slack modal block cap');
  });

  it('renders the persona tagline for the selected role', () => {
    const view = helpModal({ role: 'reporter', language: 'en' });
    const text = JSON.stringify(view).toLowerCase();
    assert.ok(text.includes(helpForRole('reporter', 'en').tagline.slice(0, 20).toLowerCase()));
  });

  it('offers a role switcher — one button per persona, routed to help_role:*', () => {
    const buttons = findButtons(helpModal({ role: 'association', language: 'en' }));
    const switchers = buttons.filter((b) => b.action_id?.startsWith('help_role:'));
    assert.equal(switchers.length, 3, 'association/organizer/reporter switch buttons');
    assert.deepEqual(switchers.map((b) => b.value).sort(), ['association', 'organizer', 'reporter']);
  });

  it('highlights the currently-selected role’s switch button', () => {
    const buttons = findButtons(helpModal({ role: 'organizer', language: 'en' }));
    const current = buttons.find((b) => b.action_id === 'help_role:organizer');
    const other = buttons.find((b) => b.action_id === 'help_role:reporter');
    assert.equal(current.style, 'primary');
    assert.notEqual(other.style, 'primary');
  });

  it('links to the full guide', () => {
    const buttons = findButtons(helpModal({ role: 'reporter', language: 'en' }));
    const guide = buttons.find((b) => b.url === GUIDE_URL);
    assert.ok(guide, 'a button links out to GUIDE_URL');
  });

  it('renders Spanish when language is es', () => {
    const view = helpModal({ role: 'organizer', language: 'es' });
    assert.match(JSON.stringify(view), /[áéíóúñ¿¡]/u);
  });

  it('shows different content per role', () => {
    const reporter = JSON.stringify(helpModal({ role: 'reporter', language: 'en' }));
    const resident = JSON.stringify(helpModal({ role: 'association', language: 'en' }));
    assert.notEqual(reporter, resident);
  });

  it('defaults safely with no args', () => {
    const view = helpModal();
    assert.equal(view.type, 'modal');
    assert.equal(JSON.parse(view.private_metadata).role, 'association');
  });
});
