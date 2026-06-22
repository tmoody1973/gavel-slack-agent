import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { buildCivicRecordModal } from '../../civicmail/record-modal.js';

const record = (over = {}) => ({
  messageId: '<abc@city>',
  category: 'licenses',
  subject: 'RENEWAL Class B Tavern License',
  subType: 'Class B Tavern License',
  business: 'BANDERAS 408, LLC',
  district: '12',
  recordNumber: undefined,
  addresses: ['2000 S 13TH ST'],
  bodyText: 'You have a Milwaukee.Gov E-Notification for a license renewal.',
  attachmentText: 'BANDERAS 408 LLC application — hearing before the Licenses Committee on June 23.',
  detailUrl: 'http://itmdapps.milwaukee.gov/Enotify/',
  attachments: [{ filename: 'app.pdf', contentType: 'application/pdf', attachmentId: 'a1' }],
  ...over,
});

const text = (view) => JSON.stringify(view.blocks);

describe('buildCivicRecordModal — a readable record surface', () => {
  it('is a modal with a short title and the subject in a header', () => {
    const view = buildCivicRecordModal({ record: record() });
    assert.equal(view.type, 'modal');
    assert.ok(view.title.text.length <= 24);
    assert.match(text(view), /Class B Tavern License/);
  });

  it('shows the key facts: category, district, and entity', () => {
    const view = buildCivicRecordModal({ record: record() });
    assert.match(text(view), /District 12/);
    assert.match(text(view), /BANDERAS 408, LLC/);
  });

  it('renders the email body', () => {
    const view = buildCivicRecordModal({ record: record() });
    assert.match(text(view), /E-Notification for a license renewal/);
  });

  it('renders the extracted attachment text when present', () => {
    const view = buildCivicRecordModal({ record: record() });
    assert.match(text(view), /hearing before the Licenses Committee/);
  });

  it('keeps the "How to be heard" footer for actionable categories', () => {
    const view = buildCivicRecordModal({ record: record() });
    assert.match(text(view), /How to be heard/i);
  });

  it('truncates a very long body to stay under the Slack 3000-char block limit', () => {
    const view = buildCivicRecordModal({ record: record({ bodyText: 'x'.repeat(8000), attachmentText: '' }) });
    for (const block of view.blocks) {
      if (block.type === 'section' && block.text?.type === 'mrkdwn') {
        assert.ok(block.text.text.length <= 3000, 'section text within Slack limit');
      }
    }
  });
});

describe('buildCivicRecordModal — attachments', () => {
  it('renders an image block for an image attachment with a resolved URL', () => {
    const view = buildCivicRecordModal({
      record: record({ attachments: [{ filename: 'flyer.jpg', contentType: 'image/jpeg', attachmentId: 'i1' }] }),
      resolvedAttachments: [
        { filename: 'flyer.jpg', contentType: 'image/jpeg', url: 'https://cdn.agentmail.to/x.jpg' },
      ],
    });
    const image = view.blocks.find((b) => b.type === 'image');
    assert.ok(image, 'an image block is rendered for the flyer');
    assert.equal(image.image_url, 'https://cdn.agentmail.to/x.jpg');
    assert.ok(image.alt_text, 'image block has alt text');
  });

  it('renders a download link for a PDF attachment with a resolved URL', () => {
    const view = buildCivicRecordModal({
      record: record(),
      resolvedAttachments: [
        { filename: 'app.pdf', contentType: 'application/pdf', url: 'https://cdn.agentmail.to/app.pdf' },
      ],
    });
    assert.match(text(view), /cdn\.agentmail\.to\/app\.pdf/);
    assert.match(text(view), /app\.pdf/);
  });

  it('degrades to the filename when no URL could be resolved (no image, no broken link)', () => {
    const view = buildCivicRecordModal({
      record: record({ attachments: [{ filename: 'flyer.jpg', contentType: 'image/jpeg', attachmentId: 'i1' }] }),
      resolvedAttachments: [{ filename: 'flyer.jpg', contentType: 'image/jpeg', url: null }],
    });
    assert.ok(!view.blocks.some((b) => b.type === 'image'), 'no image block without a URL');
    assert.match(text(view), /flyer\.jpg/);
  });
});

describe('buildCivicRecordModal — localization + robustness', () => {
  it('localizes labels to Spanish', () => {
    const view = buildCivicRecordModal({ record: record(), language: 'es' });
    assert.match(text(view).toLowerCase(), /cómo participar|distrito/);
  });

  it('handles a bare record (no attachments, no attachmentText) without throwing', () => {
    const view = buildCivicRecordModal({
      record: { messageId: 'm', category: 'other', subject: 'City notice', addresses: [], attachments: [] },
    });
    assert.equal(view.type, 'modal');
    assert.match(text(view), /City notice/);
  });
});
