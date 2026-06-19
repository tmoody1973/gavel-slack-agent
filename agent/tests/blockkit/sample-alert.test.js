import assert from 'node:assert';
import { describe, it } from 'node:test';

import { sampleAlertCard } from '../../blockkit/sample-alert.js';

const item = {
  eventItemId: 489752,
  eventBodyName: 'PUBLIC SAFETY AND HEALTH COMMITTEE',
  title: 'Resolution relating to a $3,500 contribution to the Milwaukee Fire Department',
  eventDate: '2026-06-25T00:00:00',
  matterId: 73652,
};

describe('sampleAlertCard', () => {
  it('returns { text, blocks } with the sample intro label and the item content', () => {
    const card = sampleAlertCard(item, 'en');
    assert.equal(typeof card.text, 'string');
    assert.ok(Array.isArray(card.blocks));
    const json = JSON.stringify(card.blocks);
    assert.match(json, /live example from this week/);
    assert.match(json, /Milwaukee Fire Department/);
    assert.match(json, /PUBLIC SAFETY AND HEALTH COMMITTEE/);
  });

  it('carries a functional 👁 Watch button wired to the existing alert handler', () => {
    const card = sampleAlertCard(item, 'en');
    const actions = card.blocks.find((b) => b.type === 'actions');
    assert.ok(actions, 'has an actions block');
    const watch = actions.elements.find((e) => e.action_id === 'alert_watch');
    assert.ok(watch, 'has the alert_watch button');
    assert.equal(watch.value, '489752', 'value is the eventItemId the handler looks up');
    assert.match(watch.text.text, /👁/);
  });

  it('uses the same alert button vocabulary as a real card (watch/history/ask)', () => {
    const actions = sampleAlertCard(item, 'en').blocks.find((b) => b.type === 'actions');
    assert.deepStrictEqual(
      actions.elements.map((e) => e.action_id),
      ['alert_watch', 'alert_history', 'alert_ask'],
    );
  });

  it('localizes the intro to Spanish while keeping committee/title English', () => {
    const json = JSON.stringify(sampleAlertCard(item, 'es').blocks);
    assert.match(json, /ejemplo real de esta semana/);
    assert.match(json, /PUBLIC SAFETY AND HEALTH COMMITTEE/, 'committee stays English under the hood');
  });
});
