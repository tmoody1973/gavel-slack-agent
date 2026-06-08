import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeMatterBilingual } from '../../summarizer/bilingual.js';

const matter = {
  fileNumber: '241554',
  title: 'An ordinance creating an Immigration Advisory Board',
  matterText: '',
  attachments: [],
};

function fakeGenerate(result) {
  return async ({ system, prompt }) => {
    assert.match(system, /español|Spanish/i);
    assert.ok(prompt.includes('Immigration Advisory Board'));
    return result;
  };
}

test('returns validated bilingual structure', async () => {
  const out = await summarizeMatterBilingual(matter, {
    generate: fakeGenerate({
      en: { summary: 'The city creates a board.', whyItMatters: 'It affects immigrants.' },
      es: { summary: 'La ciudad crea una junta.', whyItMatters: 'Afecta a los inmigrantes.' },
      addresses: [],
    }),
  });
  assert.equal(out.en.summary, 'The city creates a board.');
  assert.equal(out.es.whyItMatters, 'Afecta a los inmigrantes.');
  assert.deepEqual(out.addresses, []);
  assert.equal(out.sourcesUsed[0], 'title');
});

test('throws on a malformed result missing es', async () => {
  await assert.rejects(
    () =>
      summarizeMatterBilingual(matter, {
        generate: fakeGenerate({ en: { summary: 'x', whyItMatters: 'y' }, addresses: [] }),
      }),
    /bilingual/i,
  );
});
