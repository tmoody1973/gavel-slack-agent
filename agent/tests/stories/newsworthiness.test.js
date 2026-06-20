import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NEWSWORTHINESS_WEIGHTS, scoreNewsworthiness, tagKinds } from '../../stories/newsworthiness.js';

const item = (overrides = {}) => ({
  eventItemId: 1,
  title: 'A resolution relating to nothing in particular',
  eventBodyName: 'Common Council',
  eventDate: '2026-06-25',
  ...overrides,
});

describe('scoreNewsworthiness — explainable tags', () => {
  it('tags 💰 money on dollars / bonding / TIF / appropriation / contracts', () => {
    const titles = [
      'Resolution authorizing $4.2 million in bonding for street reconstruction',
      'A substitute resolution approving a tax incremental financing (TIF) district',
      'Resolution authorizing a professional services contract with Acme LLC',
    ];
    for (const title of titles) {
      assert.ok(tagKinds(scoreNewsworthiness(item({ title }))).includes('money'), `money not tagged for: ${title}`);
    }
  });

  it('tags 🛡️ accountability on police / surveillance / ethics / appointments / no-bid', () => {
    const titles = [
      'Resolution relating to Fire and Police Commission surveillance technology',
      'An ordinance amending the Code of Ethics for city officials',
      'Resolution confirming the mayoral appointment of a department head',
      'Resolution approving a no-bid contract extension',
    ];
    for (const title of titles) {
      assert.ok(
        tagKinds(scoreNewsworthiness(item({ title }))).includes('accountability'),
        `accountability not tagged for: ${title}`,
      );
    }
  });

  it('tags 👥 equity with the aldermanic district as detail', () => {
    const score = scoreNewsworthiness(
      item({ title: 'Order for the demolition of 2500 W Vine St (7th Aldermanic District)' }),
    );
    const equity = score.tags.find((t) => t.kind === 'equity');
    assert.ok(equity, 'equity not tagged for a demolition');
    assert.equal(equity.detail, '7');
  });

  it('tags ✨ novelty on ordinances that create / establish / pilot', () => {
    const titles = [
      'An ordinance creating an Immigration Advisory Board',
      'Resolution establishing a guaranteed-income pilot program',
    ];
    for (const title of titles) {
      assert.ok(tagKinds(scoreNewsworthiness(item({ title }))).includes('novelty'), `novelty not tagged for: ${title}`);
    }
  });

  it('tags ⚔️ conflict on appeals / protests / revocations / denials', () => {
    const titles = [
      'Appeal of the denial of a Class B Tavern license',
      'Resolution for the revocation of a food dealer license',
    ];
    for (const title of titles) {
      assert.ok(
        tagKinds(scoreNewsworthiness(item({ title }))).includes('conflict'),
        `conflict not tagged for: ${title}`,
      );
    }
  });

  it('tags ⚠️ anomaly from MOO-51 walk-on / consent flags, with detail', () => {
    const walk = scoreNewsworthiness(item({ walkOnFlag: true }));
    const consent = scoreNewsworthiness(item({ consentFlag: true }));
    assert.equal(walk.tags.find((t) => t.kind === 'anomaly')?.detail, 'walkOn');
    assert.equal(consent.tags.find((t) => t.kind === 'anomaly')?.detail, 'consent');
  });

  it('tags 🔁 recurrence only when the caller supplies a repeat-entity signal', () => {
    const without = scoreNewsworthiness(item({ title: 'Resolution about a building' }));
    assert.ok(!tagKinds(without).includes('recurrence'));
    const with_ = scoreNewsworthiness(item({ title: 'Resolution about a building' }), {
      recurrence: { detail: 'Acme LLC — 3 parcels' },
    });
    assert.equal(with_.tags.find((t) => t.kind === 'recurrence')?.detail, 'Acme LLC — 3 parcels');
  });

  it('uses enrichment text (matter body) to find signals the terse title hides', () => {
    const terse = item({ title: 'Communication from the Department of Public Works' });
    assert.ok(!tagKinds(scoreNewsworthiness(terse)).includes('money'));
    const enriched = scoreNewsworthiness(terse, { text: 'requesting $12 million in appropriation authority' });
    assert.ok(tagKinds(enriched).includes('money'));
  });

  it('is a pure composite: score is the deterministic sum of matched tag weights', () => {
    const heavy = item({
      title: 'An ordinance creating a surveillance oversight board funded by $2 million',
      walkOnFlag: true,
    });
    const a = scoreNewsworthiness(heavy);
    const kinds = tagKinds(a);
    assert.ok(
      kinds.includes('money') &&
        kinds.includes('accountability') &&
        kinds.includes('novelty') &&
        kinds.includes('anomaly'),
    );
    const expected = kinds.reduce((sum, k) => sum + NEWSWORTHINESS_WEIGHTS[k], 0);
    assert.equal(a.score, expected);
    // determinism + purity: same input → identical output, input untouched
    const b = scoreNewsworthiness(heavy);
    assert.deepEqual(b, a);
    assert.equal(heavy.title, 'An ordinance creating a surveillance oversight board funded by $2 million');
  });

  it('an item with no signals scores 0 with no tags', () => {
    const score = scoreNewsworthiness(
      item({ title: 'Communication relating to a routine matter', eventBodyName: 'Some Committee' }),
    );
    assert.equal(score.score, 0);
    assert.deepEqual(score.tags, []);
  });
});
