import assert from 'node:assert';
import { describe, it } from 'node:test';

import { buildSourceContext } from '../../summarizer/source.js';

// A "matter" is the summarizer's decoupled input shape (the poller maps raw
// Legistar into this). Fallback chain per the data reference: titles are terse,
// real substance lives in MatterTexts and attachment PDFs.
describe('buildSourceContext', () => {
  it('uses only the title when no body text exists', () => {
    const { contextText, sourcesUsed } = buildSourceContext({
      fileNumber: '252190',
      title: 'Substitute resolution relative to rezoning 234 S Water St',
    });

    assert.deepStrictEqual(sourcesUsed, ['title']);
    assert.match(contextText, /234 S Water St/);
  });

  it('includes the file number alongside the title', () => {
    const { contextText } = buildSourceContext({
      fileNumber: '252190',
      title: 'Communication regarding the budget',
    });

    assert.match(contextText, /252190/);
  });

  it('adds MatterText to the chain when it is present', () => {
    const { contextText, sourcesUsed } = buildSourceContext({
      fileNumber: '252190',
      title: 'Substitute resolution relative to rezoning',
      matterText: 'The Common Council rezones the parcel at 234 S Water St from IL2 to C9F.',
    });

    assert.deepStrictEqual(sourcesUsed, ['title', 'matterText']);
    assert.match(contextText, /IL2 to C9F/);
  });

  it('falls back to the first attachment when MatterText is empty', () => {
    const { contextText, sourcesUsed } = buildSourceContext({
      fileNumber: '252190',
      title: 'Communication and attachments',
      matterText: '',
      attachments: [{ name: 'staff_report.pdf', text: 'Staff recommends approval of the demolition permit.' }],
    });

    assert.deepStrictEqual(sourcesUsed, ['title', 'attachment']);
    assert.match(contextText, /demolition permit/);
  });

  it('includes title, MatterText, and attachment when all are present', () => {
    const { sourcesUsed } = buildSourceContext({
      fileNumber: '999',
      title: 'A planned development',
      matterText: 'Approves a detailed planned development.',
      attachments: [{ name: 'map.pdf', text: 'Site plan for the 200 block.' }],
    });

    assert.deepStrictEqual(sourcesUsed, ['title', 'matterText', 'attachment']);
  });

  it('treats whitespace-only MatterText as absent', () => {
    const { sourcesUsed } = buildSourceContext({
      fileNumber: '1',
      title: 'A terse title',
      matterText: '   \n  ',
    });

    assert.deepStrictEqual(sourcesUsed, ['title']);
  });

  it('does not throw when attachments and MatterText fields are missing', () => {
    assert.doesNotThrow(() => buildSourceContext({ fileNumber: '1', title: 'Only a title' }));
  });
});
