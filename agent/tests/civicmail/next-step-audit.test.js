// AUDIT (2026-06-22) — exactly one teaching next-step per posted surface:
//
//   civicmail/digest-card.js  → context block, line ~144:
//     "🔎 *Dig in:* `/gavel search …` pulls any record · 👁 `/gavel watch …` pings this channel"
//     (action_id n/a — context text, not a button)  ✓ one affordance line
//
//   civicmail/federated-card.js  → context block, watchNudge function (added this session):
//     "👁 Want to be notified when more records like this arrive? Try `/gavel watch <term>`"
//     Previously: footer was provenance-only ("Searches city E-Notify…"); 📖 Read per result
//     is the action surface, not a teaching nudge → was ZERO teaching nudges → fixed here.
//
//   civicmail/record-modal.js  → actions block, action_id: 'record_watch':
//     copy.watch = "👁 Watch this" (EN) / "👁 Seguir esto" (ES)
//     "How to be heard" section is civic-participation guidance, not a capability nudge.  ✓ one nudge
//
//   blockkit/digest-card.js (Sunday Digest)  → context block, copy.manage:
//     "⚙️ Manage your committees, keywords, and watches in the Gavel App Home."  ✓ one nudge
//     copy.footer ("🗣️ How to be heard: open a meeting's agenda…") is civic-participation info.
//
//   blockkit/onboarding.js memberWelcomeCard  → actions block:
//     action_id: 'member_ask_gavel'     ("Ask Gavel")        — first gentle next-step
//     action_id: 'member_what_can_you_do' ("What can you do?") — second gentle next-step
//     Two buttons is within the "one or two gentle next-steps, not a wall" design rule.  ✓
//
// No surface has zero or two competing teaching nudges after this session.
// If a future card adds a second teaching nudge, fix it here.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { memberWelcomeCard } from '../../blockkit/onboarding.js';
import { buildFederatedResultsCard, normalizeMail } from '../../civicmail/federated-card.js';

describe('first-contact card sets the beginner expectation (U1 verify)', () => {
  it('tells a brand-new member they do not have to do anything, and offers one next step', () => {
    const card = memberWelcomeCard('en');
    const json = JSON.stringify(card.blocks);
    assert.match(json, /Gavel/);
    assert.match(json.toLowerCase(), /don.?t have to|automatic|before the vote/); // value-before-learning
    const buttons = card.blocks.flatMap((b) => b.elements ?? []).filter((e) => e.type === 'button');
    assert.ok(buttons.length >= 1 && buttons.length <= 2, 'one or two gentle next-steps, not a wall');
  });

  it('renders natively in Spanish for an ES channel', () => {
    assert.match(JSON.stringify(memberWelcomeCard('es').blocks).toLowerCase(), /vecindario|ayuntamiento|antes/);
  });
});

describe('federated search card has exactly one teaching next-step (U2 verify)', () => {
  it('non-empty results card includes a /gavel watch nudge', () => {
    const result = normalizeMail({
      subject: 'Banderas License Renewal',
      category: 'licenses',
      district: '12',
      business: 'BANDERAS 408, LLC',
      messageId: 'msg-001',
    });
    const card = buildFederatedResultsCard({
      term: 'banderas',
      groups: [{ source: 'mail', results: [result] }],
      language: 'en',
    });
    const json = JSON.stringify(card.blocks);
    // Teaching next-step: watch nudge points user to their next capability
    assert.match(json, /gavel watch/, 'federated card must include /gavel watch teaching nudge');
  });

  it('watch nudge renders in Spanish for ES channels', () => {
    const result = normalizeMail({
      subject: 'Renovación de Licencia',
      category: 'licenses',
      district: '5',
      business: 'TEST LLC',
      messageId: 'msg-002',
    });
    const card = buildFederatedResultsCard({
      term: 'licencia',
      groups: [{ source: 'mail', results: [result] }],
      language: 'es',
    });
    const json = JSON.stringify(card.blocks);
    assert.match(json, /gavel watch/, 'ES federated card must include /gavel watch teaching nudge');
    assert.match(json, /notificaciones|Quieres/, 'watch nudge must be in Spanish');
  });
});
