import assert from 'node:assert/strict';
import { test } from 'node:test';
import { summarizeMatterBilingual } from '../../summarizer/bilingual.js';
import { BILINGUAL_SYSTEM_PROMPT } from '../../summarizer/prompt.js';

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

test('civic glossary covers the planning/zoning terms the PRD names', () => {
  for (const term of ['variance', 'conditional use', 'TIF', 'permit', 'zoning', 'hearing']) {
    assert.ok(BILINGUAL_SYSTEM_PROMPT.includes(term), `glossary missing "${term}"`);
  }
});

test('passes PDF documents through to the Claude boundary (MOO-69)', async () => {
  const documents = [{ base64: 'QUJD', mediaType: 'application/pdf' }];
  let seen;
  await summarizeMatterBilingual(matter, {
    generate: async ({ documents: docs }) => {
      seen = docs;
      return {
        en: { summary: 'a', whyItMatters: 'b' },
        es: { summary: 'c', whyItMatters: 'd' },
        addresses: [],
      };
    },
    documents,
  });
  assert.deepEqual(seen, documents, 'documents must reach generate()');
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
