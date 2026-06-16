import assert from 'node:assert/strict';
import { test } from 'node:test';

import { transcribeAudio } from '../../transcripts/deepgram.js';

const fakeResponse = {
  results: {
    utterances: [
      { speaker: 0, transcript: 'Good morning.', start: 1.2, end: 2.4 },
      { speaker: 2, transcript: 'Move approval.', start: 3.0, end: 3.8 },
    ],
  },
};

function fakeFetch(captured) {
  return async (url, init) => {
    captured.url = url;
    captured.init = init;
    return { ok: true, json: async () => fakeResponse };
  };
}

test('maps Deepgram utterances to {speaker, transcript, start, end}', async () => {
  const out = await transcribeAudio(new Uint8Array([1, 2, 3]), { apiKey: 'k', fetchFn: fakeFetch({}) });
  assert.deepEqual(out, [
    { speaker: 0, transcript: 'Good morning.', start: 1.2, end: 2.4 },
    { speaker: 2, transcript: 'Move approval.', start: 3.0, end: 3.8 },
  ]);
});

test('requests diarize + utterances + smart_format with the token header', async () => {
  const captured = {};
  await transcribeAudio(new Uint8Array([1]), { apiKey: 'secret', fetchFn: fakeFetch(captured) });
  assert.match(captured.url, /model=nova-3/);
  assert.match(captured.url, /diarize=true/);
  assert.match(captured.url, /utterances=true/);
  assert.equal(captured.init.headers.Authorization, 'Token secret');
});

test('throws a clear error on a non-OK response', async () => {
  const fetchFn = async () => ({ ok: false, status: 401, text: async () => 'unauthorized' });
  await assert.rejects(
    () => transcribeAudio(new Uint8Array([1]), { apiKey: 'k', fetchFn }),
    /Deepgram request failed: 401/,
  );
});

test('requires an api key', async () => {
  await assert.rejects(() => transcribeAudio(new Uint8Array([1]), { apiKey: '' }), /DEEPGRAM_API_KEY is required/);
});

test('empty utterances → empty array, never throws', async () => {
  const fetchFn = async () => ({ ok: true, json: async () => ({ results: {} }) });
  assert.deepEqual(await transcribeAudio(new Uint8Array([1]), { apiKey: 'k', fetchFn }), []);
});
