import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCommentModal } from '../../blockkit/comment-modal.js';

const base = {
  fileNumber: '260030',
  title: 'Changes to the former Walmart at 5825 W Hope Ave',
  draftText: 'I am writing about File #260030...',
};

const inputs = (view) => view.blocks.filter((b) => b.type === 'input');
const findInput = (view, blockId) => inputs(view).find((b) => b.block_id === blockId);

describe('buildCommentModal — review/edit before filing', () => {
  it('is a civic_comment_modal with the file number in private_metadata', () => {
    const v = buildCommentModal({ ...base, language: 'en' });
    assert.equal(v.type, 'modal');
    assert.equal(v.callback_id, 'civic_comment_modal');
    const meta = JSON.parse(v.private_metadata);
    assert.equal(meta.fileNumber, '260030');
  });

  it('shows the file number + title read-only (not as an editable field)', () => {
    const v = buildCommentModal({ ...base, language: 'en' });
    const json = JSON.stringify(v.blocks);
    assert.match(json, /260030/);
    assert.match(json, /5825 W Hope Ave/);
  });

  it('pre-fills an editable multiline comment with the draft', () => {
    const v = buildCommentModal({ ...base, language: 'en' });
    const body = findInput(v, 'civic_comment_body');
    assert.ok(body, 'has a comment input block');
    assert.equal(body.element.type, 'plain_text_input');
    assert.equal(body.element.multiline, true);
    assert.equal(body.element.initial_value, base.draftText);
  });

  it('requires a name and offers a 4-option position selector', () => {
    const v = buildCommentModal({ ...base, language: 'en' });
    const name = findInput(v, 'civic_comment_name');
    assert.ok(name && name.optional !== true, 'name input is present and required');
    const position = findInput(v, 'civic_comment_position');
    assert.ok(position, 'has a position selector');
    assert.equal(position.element.options.length, 4);
  });

  it('has a submit and a cancel button', () => {
    const v = buildCommentModal({ ...base, language: 'en' });
    assert.ok(v.submit?.text?.length > 0);
    assert.ok(v.close?.text?.length > 0);
  });

  it('Spanish channel → localized labels, file number stays English', () => {
    const v = buildCommentModal({ ...base, language: 'es' });
    assert.match(v.submit.text.toLowerCase(), /enviar/);
    assert.match(JSON.stringify(v.blocks), /260030/);
  });

  it('demo mode discloses the test inbox; off mode does not', () => {
    const on = buildCommentModal({ ...base, language: 'en', demoMode: true, testInbox: 'demo@example.com' });
    assert.match(JSON.stringify(on.blocks).toLowerCase(), /demo|test|not.*city|example\.com/);
    const off = buildCommentModal({ ...base, language: 'en', demoMode: false });
    assert.doesNotMatch(JSON.stringify(off.blocks).toLowerCase(), /demo mode|test inbox/);
  });
});
