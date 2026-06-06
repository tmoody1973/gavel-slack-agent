import assert from 'node:assert';
import { describe, it } from 'node:test';

import { summarizeMatter } from '../../summarizer/summarize.js';
import { countWords } from '../../summarizer/words.js';

const matter = {
  fileNumber: '252190',
  title: 'Substitute resolution relative to rezoning',
  matterText: 'Rezones 234 S Water St from IL2 to C9F to allow a residential development.',
};

const fakeResult = {
  summary: 'The Common Council is rezoning 234 S Water St to allow new housing downtown.',
  whyItMatters: 'It could bring new apartments to the neighborhood near the river.',
  addresses: ['234 S Water St'],
};

const generateFake = async () => fakeResult;

describe('summarizeMatter', () => {
  it('returns the structured summary fields from the generator', async () => {
    const result = await summarizeMatter(matter, { generate: generateFake });

    assert.strictEqual(result.summary, fakeResult.summary);
    assert.strictEqual(result.whyItMatters, fakeResult.whyItMatters);
    assert.deepStrictEqual(result.addresses, ['234 S Water St']);
  });

  it('reports which sources fed the summary', async () => {
    const result = await summarizeMatter(matter, { generate: generateFake });
    assert.deepStrictEqual(result.sourcesUsed, ['title', 'matterText']);
  });

  it('reports the summary word count', async () => {
    const result = await summarizeMatter(matter, { generate: generateFake });
    assert.strictEqual(result.wordCount, countWords(fakeResult.summary));
  });

  it('feeds the assembled source context to the generator', async () => {
    let receivedPrompt = '';
    await summarizeMatter(matter, {
      generate: async ({ prompt }) => {
        receivedPrompt = prompt;
        return fakeResult;
      },
    });
    assert.match(receivedPrompt, /IL2 to C9F/);
  });

  it('passes a non-empty system prompt to the generator', async () => {
    let receivedSystem = '';
    await summarizeMatter(matter, {
      generate: async ({ system }) => {
        receivedSystem = system;
        return fakeResult;
      },
    });
    assert.ok(receivedSystem.length > 0, 'expected a system prompt');
  });

  it('throws when the generator omits required fields', async () => {
    await assert.rejects(
      () => summarizeMatter(matter, { generate: async () => ({ summary: 'only a summary' }) }),
      /malformed|whyItMatters|addresses/i,
    );
  });

  it('throws when addresses is not an array', async () => {
    await assert.rejects(
      () =>
        summarizeMatter(matter, {
          generate: async () => ({ summary: 'x', whyItMatters: 'y', addresses: 'not-an-array' }),
        }),
      /addresses/i,
    );
  });
});
