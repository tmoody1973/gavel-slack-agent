import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCommentDraftPrompt, draftComment } from '../../civicmail/comment-draft.js';

const baseItem = {
  fileNumber: '260030',
  title: 'Changes to the former Walmart at 5825 W Hope Ave',
  position: 'oppose',
};

describe('buildCommentDraftPrompt — grounded, honest, bilingual public comment', () => {
  it('includes the file number, title, and the chosen position', () => {
    const { prompt } = buildCommentDraftPrompt({ ...baseItem, language: 'en' });
    assert.match(prompt, /260030/);
    assert.match(prompt, /5825 W Hope Ave/);
    assert.match(prompt.toLowerCase(), /oppos/);
  });

  it('forbids inventing facts (honest drafting guardrail)', () => {
    const { system, prompt } = buildCommentDraftPrompt({ ...baseItem, language: 'en' });
    const both = `${system}\n${prompt}`.toLowerCase();
    assert.match(both, /do not invent|only the facts|never fabricat|no fabricat/);
  });

  it('Spanish channel → instructs Spanish prose but English civic identifiers', () => {
    const { prompt } = buildCommentDraftPrompt({ ...baseItem, language: 'es' });
    assert.match(prompt.toLowerCase(), /spanish|español/);
    assert.match(prompt, /260030/); // file number stays English
    assert.match(prompt.toLowerCase(), /english.*(file|committee|address|identifier)|identifier.*english/);
  });

  it('unknown language falls back to English instructions', () => {
    const fr = buildCommentDraftPrompt({ ...baseItem, language: 'fr' });
    const en = buildCommentDraftPrompt({ ...baseItem, language: 'en' });
    assert.equal(fr.prompt, en.prompt);
  });

  it('weaves in the resident concern when provided', () => {
    const { prompt } = buildCommentDraftPrompt({ ...baseItem, language: 'en', concern: 'water and noise pollution' });
    assert.match(prompt, /water and noise pollution/);
  });
});

describe('draftComment — thin wrapper over the injected generate boundary', () => {
  it('calls generate with the built prompt and returns its text', async () => {
    let seen = null;
    const generate = async ({ system, prompt }) => {
      seen = { system, prompt };
      return '  Estimada comisión, me opongo... ';
    };
    const text = await draftComment({ ...baseItem, language: 'es' }, { generate });
    assert.ok(seen.prompt.includes('260030'));
    assert.equal(text, 'Estimada comisión, me opongo...'); // trimmed
  });

  // The real boundary is createClaudeGenerate, which ALWAYS applies a json_schema and therefore
  // resolves to a parsed object — never a bare string. String(obj) is "[object Object]", which is
  // exactly what shipped into the comment modal's textarea. Accept the schema'd shape.
  it('unwraps the {comment} object the schema-bound generate actually returns', async () => {
    const generate = async () => ({ comment: '  Estimada comisión, me opongo...  ' });
    const text = await draftComment({ ...baseItem, language: 'es' }, { generate });
    assert.equal(text, 'Estimada comisión, me opongo...');
  });

  it('never yields the string "[object Object]"', async () => {
    const generate = async () => ({ comment: 'Real draft.' });
    const text = await draftComment({ ...baseItem, language: 'en' }, { generate });
    assert.doesNotMatch(text, /\[object Object\]/);
  });
});
