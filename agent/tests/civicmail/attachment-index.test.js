import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  ATTACHMENT_TEXT_SCHEMA,
  buildAttachmentExtractionPrompt,
  composeSearchText,
  extractAttachmentText,
} from '../../civicmail/attachment-index.js';

describe('composeSearchText — folds attachment text into the search field', () => {
  it('is subject + body when there is no attachment text (unchanged behavior)', () => {
    assert.equal(
      composeSearchText({ subject: 'APPLICATION Tavern', bodyText: 'for COZUMEL III' }),
      'APPLICATION Tavern for COZUMEL III',
    );
  });

  it('appends attachment text so PDF contents become searchable', () => {
    const out = composeSearchText({
      subject: 'Zoning agenda',
      bodyText: 'meeting 6/16',
      attachmentText: 'Item 5: rezoning of 2000 S 13th St requested by SHAAN REAL ESTATE',
    });
    assert.match(out, /rezoning of 2000 S 13th St/);
    assert.match(out, /SHAAN REAL ESTATE/);
  });

  it('truncates oversized attachment text to the per-attachment cap', () => {
    const huge = 'x'.repeat(50000);
    const out = composeSearchText({ subject: 's', bodyText: 'b', attachmentText: huge }, { perAttachmentCap: 100 });
    assert.ok(out.length < 50000);
    assert.ok(out.includes('x'.repeat(100)) === false || out.length <= 100 + 10);
  });

  it('caps the total search text length', () => {
    const out = composeSearchText(
      { subject: 's', bodyText: 'b'.repeat(100000), attachmentText: '' },
      { totalCap: 200 },
    );
    assert.ok(out.length <= 200);
  });
});

describe('attachment extraction — schema-validated Claude boundary', () => {
  it('schema constrains output to a single text field', () => {
    assert.deepEqual(ATTACHMENT_TEXT_SCHEMA.required, ['text']);
    assert.equal(ATTACHMENT_TEXT_SCHEMA.additionalProperties, false);
  });

  it('prompt instructs transcription for search, not summary', () => {
    const prompt = buildAttachmentExtractionPrompt(['ZND_Agenda.pdf']);
    assert.match(prompt.toLowerCase(), /search|transcrib|verbatim|do not summar/);
    assert.match(prompt, /ZND_Agenda\.pdf/);
  });

  it('returns the extracted text from the injected generator', async () => {
    const generate = async ({ documents }) => {
      assert.ok(Array.isArray(documents) && documents.length === 1, 'PDF passed as a document');
      return { text: 'Item 5: rezoning of 2000 S 13th St' };
    };
    const text = await extractAttachmentText({
      documents: [{ base64: 'AAA', mediaType: 'application/pdf' }],
      filenames: ['a.pdf'],
      generate,
    });
    assert.match(text, /rezoning/);
  });

  it('returns empty string when there are no document blocks (nothing to read)', async () => {
    const generate = async () => ({ text: 'should not be called' });
    const text = await extractAttachmentText({ documents: [], filenames: [], generate });
    assert.equal(text, '');
  });
});
