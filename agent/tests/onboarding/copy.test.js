import assert from 'node:assert';
import { describe, it } from 'node:test';

import { COPY, copyFor, LANGUAGES, REQUIRED_KEYS } from '../../onboarding/copy.js';

describe('onboarding copy', () => {
  it('exposes both supported languages', () => {
    assert.deepStrictEqual(LANGUAGES, ['en', 'es']);
    assert.ok(COPY.en && COPY.es, 'COPY has en and es blocks');
  });

  it('every English key has a Spanish counterpart and vice versa (no missing translation)', () => {
    const enKeys = Object.keys(COPY.en).sort();
    const esKeys = Object.keys(COPY.es).sort();
    assert.deepStrictEqual(esKeys, enKeys, 'ES key set must exactly match EN key set');
  });

  it('covers every required onboarding string in both languages', () => {
    for (const lang of LANGUAGES) {
      for (const key of REQUIRED_KEYS) {
        const value = COPY[lang][key];
        assert.strictEqual(typeof value, 'string', `${lang}.${key} should be a string`);
        assert.ok(value.trim().length > 0, `${lang}.${key} should be non-empty`);
      }
    }
  });

  it('surfaces a concrete transcript example so the third memory is discoverable', () => {
    for (const lang of LANGUAGES) {
      assert.ok(
        /Hopkins Street/.test(COPY[lang].transcriptExample),
        `${lang} transcript example should name the Hopkins Street sale (address stays English)`,
      );
    }
  });

  it('keeps the watchlist channel handle in English in both languages (civic identifier rule)', () => {
    for (const lang of LANGUAGES) {
      assert.ok(/#gavel-watchlist/.test(COPY[lang].growPrompt), `${lang} grow prompt keeps #gavel-watchlist`);
    }
  });

  it('copyFor returns the requested language block', () => {
    assert.strictEqual(copyFor('es'), COPY.es);
    assert.strictEqual(copyFor('en'), COPY.en);
  });

  it('copyFor falls back to English for an unsupported language rather than throwing', () => {
    assert.strictEqual(copyFor('fr'), COPY.en);
    assert.strictEqual(copyFor(undefined), COPY.en);
  });
});
