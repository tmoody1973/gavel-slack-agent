import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dateLabel, districtLabel, metaLine, tagText, themeLabel } from '../../blockkit/story-labels.js';

describe('story-labels — shared explainable chips', () => {
  it('themeLabel localizes the subject beat, falls back to the raw key', () => {
    assert.equal(themeLabel('police', 'en'), '🛡️ Police & public safety');
    assert.equal(themeLabel('police', 'es'), '🛡️ Policía y seguridad');
    assert.equal(themeLabel('mystery', 'en'), 'mystery');
  });

  it('districtLabel renders a chip or null', () => {
    assert.equal(districtLabel(7, 'en'), '📍 District 7');
    assert.equal(districtLabel(7, 'es'), '📍 Distrito 7');
    assert.equal(districtLabel(undefined, 'en'), null);
  });

  it('tagText joins the explainable why and keeps proper-name details', () => {
    const tags = [{ kind: 'money' }, { kind: 'anomaly', detail: 'consent' }];
    assert.match(tagText(tags, 'en'), /💰 Money/);
    assert.match(tagText(tags, 'en'), /Buried on consent/);
    assert.equal(tagText([], 'en'), '');
  });

  describe('dateLabel — timezone-stable, bilingual', () => {
    it('formats an ISO calendar day as weekday + month + day', () => {
      assert.equal(dateLabel('2026-06-23', 'en'), '🗓 Tue Jun 23');
    });
    it('orders day before month in Spanish', () => {
      assert.equal(dateLabel('2026-06-23', 'es'), '🗓 mar 23 jun');
    });
    it('tolerates a full timestamp and never drifts a day by timezone', () => {
      assert.equal(dateLabel('2026-06-23T19:30:00Z', 'en'), '🗓 Tue Jun 23');
    });
    it('returns null for missing or unparseable input', () => {
      assert.equal(dateLabel(undefined, 'en'), null);
      assert.equal(dateLabel('not-a-date', 'en'), null);
    });
  });

  it('metaLine composes committee · district · date · tags, dropping empties', () => {
    const line = metaLine(
      { committee: 'COMMON COUNCIL', district: 3, date: '2026-06-23', tags: [{ kind: 'money' }] },
      'en',
    );
    assert.match(line, /🏛️ COMMON COUNCIL/);
    assert.match(line, /📍 District 3/);
    assert.match(line, /🗓 Tue Jun 23/);
    assert.match(line, /💰 Money/);
    // no leading/trailing separator when parts are missing
    const sparse = metaLine({ committee: 'LICENSES' }, 'en');
    assert.equal(sparse, '🏛️ LICENSES');
  });
});
