import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { composeCommentEmail, submitComment } from '../../civicmail/comment-submit.js';

const valid = {
  fileNumber: '260030',
  title: 'Changes to the former Walmart at 5825 W Hope Ave',
  position: 'oppose',
  body: 'I oppose this and ask who is behind AFS Milwaukee LLC.',
  name: 'Denise Carter',
  recipient: 'plan@milwaukee.gov',
  demoMode: false,
};

const recordingSend = () => {
  const calls = [];
  return { send: async (msg) => calls.push(msg), calls };
};

describe('composeCommentEmail — pure email shape', () => {
  it('subject names the file number; body carries the comment, position, and signer', () => {
    const { subject, text } = composeCommentEmail(valid);
    assert.match(subject, /260030/);
    assert.match(text, /who is behind AFS Milwaukee LLC/);
    assert.match(text.toLowerCase(), /oppos/);
    assert.match(text, /Denise Carter/);
  });
});

describe('submitComment — guardrails + injected send', () => {
  it('sends to the resolved recipient with a file-numbered subject', async () => {
    const { send, calls } = recordingSend();
    const res = await submitComment(valid, { send });
    assert.equal(res.sent, true);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].to, 'plan@milwaukee.gov');
    assert.match(calls[0].subject, /260030/);
    assert.match(calls[0].text, /Denise Carter/);
  });

  it('NEVER fabricates a constituent — refuses with no name, and does not send', async () => {
    const { send, calls } = recordingSend();
    const res = await submitComment({ ...valid, name: '   ' }, { send });
    assert.equal(res.sent, false);
    assert.match(res.error, /name/i);
    assert.equal(calls.length, 0);
  });

  it('refuses an empty comment body, and does not send', async () => {
    const { send, calls } = recordingSend();
    const res = await submitComment({ ...valid, body: '' }, { send });
    assert.equal(res.sent, false);
    assert.equal(calls.length, 0);
  });

  it('degrades safe — no recipient → does not send', async () => {
    const { send, calls } = recordingSend();
    const res = await submitComment({ ...valid, recipient: null }, { send });
    assert.equal(res.sent, false);
    assert.match(res.error, /recipient/i);
    assert.equal(calls.length, 0);
  });

  it('echoes demoMode back in the result for the confirmation disclosure', async () => {
    const { send } = recordingSend();
    const res = await submitComment({ ...valid, demoMode: true }, { send });
    assert.equal(res.sent, true);
    assert.equal(res.demoMode, true);
  });
});
