import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { makeCivicCommentSubmit, makeOpenCivicComment } from '../../../listeners/actions/civic-comment-buttons.js';

function harness({ name = 'Denise', body = 'I oppose this.', prior = [], testInbox = 'demo@example.com' } = {}) {
  const calls = { sent: [], logged: [], confirmed: [], ack: 0 };
  const view = {
    private_metadata: JSON.stringify({ fileNumber: '260030', language: 'en', demoMode: true }),
    state: {
      values: {
        civic_comment_position: { position: { selected_option: { value: 'oppose' } } },
        civic_comment_body: { body: { value: body } },
        civic_comment_name: { name: { value: name } },
        civic_comment_address: { address: { value: '' } },
      },
    },
  };
  const deps = {
    getItem: async () => ({ title: 'Midtown data center', bodyName: 'CITY PLAN COMMISSION', contactEmail: null }),
    recentByUserFile: async () => prior,
    logComment: async (row) => calls.logged.push(row),
    send: async (msg) => calls.sent.push(msg),
    confirm: async (c) => calls.confirmed.push(c),
    testInbox,
    bodyDirectory: { 'CITY PLAN COMMISSION': 'plan@milwaukee.gov' },
    now: () => 1_700_000_000_000,
  };
  const args = {
    ack: async () => calls.ack++,
    body: { user: { id: 'U1' }, container: { channel_id: 'C1' } },
    view,
    logger: { error() {} },
  };
  return { calls, args, deps };
}

describe('makeCivicCommentSubmit — files a comment with every guardrail', () => {
  it('demo mode: sends to the TEST inbox, logs, and confirms with disclosure', async () => {
    const h = harness();
    await makeCivicCommentSubmit(h.deps)(h.args);
    assert.equal(h.calls.sent.length, 1);
    assert.equal(h.calls.sent[0].to, 'demo@example.com'); // test inbox overrides the real clerk
    assert.equal(h.calls.logged.length, 1);
    assert.match(h.calls.confirmed.at(-1).text, /filed.*demo mode/i);
  });

  it('respects the daily cap — does not send a second time', async () => {
    const h = harness({ prior: [1_700_000_000_000 - 3600_000] }); // 1h ago
    await makeCivicCommentSubmit(h.deps)(h.args);
    assert.equal(h.calls.sent.length, 0);
    assert.match(h.calls.confirmed.at(-1).text, /already submitted/i);
  });

  it('never fabricates a constituent — empty name → no send, surfaced error', async () => {
    const h = harness({ name: '  ' });
    await makeCivicCommentSubmit(h.deps)(h.args);
    assert.equal(h.calls.sent.length, 0);
    assert.match(h.calls.confirmed.at(-1).text, /couldn.t file|name/i);
  });
});

function openHarness({ draftComment, testInbox = 'demo@example.com', openReturn = { view: { id: 'V1' } } } = {}) {
  const calls = { opened: [], updated: [], ack: 0 };
  const client = {
    views: {
      open: async (arg) => {
        calls.opened.push(arg);
        return openReturn;
      },
      update: async (arg) => {
        calls.updated.push(arg);
      },
    },
  };
  const deps = {
    getSubscription: async () => ({ language: 'en' }),
    getItem: async () => ({ title: 'Midtown data center' }),
    draftComment,
    testInbox,
  };
  const args = {
    ack: async () => calls.ack++,
    body: { trigger_id: 'T', actions: [{ value: '260030' }], channel: { id: 'C1' } },
    client,
    logger: { error() {} },
  };
  return { calls, args, deps };
}

const bodyInput = (view) =>
  view.blocks.filter((b) => b.type === 'input').find((b) => b.block_id === 'civic_comment_body');

describe('makeOpenCivicComment — no submittable template before the draft arrives', () => {
  it('opens in drafting state with no submittable comment input', async () => {
    const h = openHarness({ draftComment: async () => 'CLAUDE DRAFT' });
    await makeOpenCivicComment(h.deps)(h.args);
    assert.equal(h.calls.opened.length, 1);
    assert.ok(!bodyInput(h.calls.opened[0].view), 'no editable comment input on open');
  });

  it('swaps the Claude draft into an editable comment via views.update', async () => {
    const h = openHarness({ draftComment: async () => 'CLAUDE DRAFT' });
    await makeOpenCivicComment(h.deps)(h.args);
    assert.equal(h.calls.updated.length, 1);
    const body = bodyInput(h.calls.updated[0].view);
    assert.ok(body, 'editable comment present after update');
    assert.equal(body.element.initial_value, 'CLAUDE DRAFT');
  });

  it('falls back to an editable template if the draft fails — never strands the user in drafting', async () => {
    const h = openHarness({
      draftComment: async () => {
        throw new Error('claude down');
      },
    });
    await makeOpenCivicComment(h.deps)(h.args);
    assert.equal(h.calls.updated.length, 1);
    const body = bodyInput(h.calls.updated[0].view);
    assert.ok(body, 'editable comment present after fallback');
    assert.match(body.element.initial_value, /260030/);
  });

  it('opens an editable modal directly when no draft boundary is wired', async () => {
    const h = openHarness({ draftComment: undefined });
    await makeOpenCivicComment(h.deps)(h.args);
    const body = bodyInput(h.calls.opened[0].view);
    assert.ok(body, 'editable comment on open when no draft boundary');
    assert.equal(h.calls.updated.length, 0);
  });
});
