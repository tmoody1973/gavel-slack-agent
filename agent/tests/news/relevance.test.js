// agent/tests/news/relevance.test.js
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildGatePrompt, filterRelevant, NEWS_GATE_SCHEMA } from '../../news/relevance.js';

const ARTICLES = [
  { title: 'Data center planned for 5825 W Hope Ave', url: 'https://a', source: 'TMJ4', publishedAt: 'x' },
  { title: 'Best brunch spots in Milwaukee', url: 'https://b', source: 'OnMKE', publishedAt: 'y' },
];

describe('news relevance gate', () => {
  it('buildGatePrompt lists each article with its index and the subject', () => {
    const { system, prompt } = buildGatePrompt('data center at 5825 W Hope Ave', ARTICLES);
    assert.match(system.toLowerCase(), /only|about this/);
    assert.match(prompt, /5825 W Hope Ave/);
    assert.match(prompt, /\[0\]/);
    assert.match(prompt, /\[1\]/);
  });

  it('keeps only the indices the model marks relevant', async () => {
    const generate = async () => ({ relevant: [0] });
    const out = await filterRelevant('data center at 5825 W Hope Ave', ARTICLES, { generate });
    assert.equal(out.length, 1);
    assert.equal(out[0].url, 'https://a');
  });

  it('degrades to [] when the gate throws or returns garbage', async () => {
    const boom = async () => {
      throw new Error('claude down');
    };
    assert.deepEqual(await filterRelevant('x', ARTICLES, { generate: boom }), []);
    const garbage = async () => ({ nope: true });
    assert.deepEqual(await filterRelevant('x', ARTICLES, { generate: garbage }), []);
  });

  it('returns [] for no articles without calling the model', async () => {
    let called = false;
    const generate = async () => {
      called = true;
      return { relevant: [0] };
    };
    assert.deepEqual(await filterRelevant('x', [], { generate }), []);
    assert.equal(called, false);
    assert.ok(NEWS_GATE_SCHEMA);
  });
});
