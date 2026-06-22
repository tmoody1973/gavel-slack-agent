import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildFederatedResultsCard,
  normalizeAgenda,
  normalizeMail,
  normalizeMinutes,
  normalizeZoning,
} from '../../civicmail/federated-card.js';

describe('normalizers — one shape across heterogeneous sources', () => {
  it('mail carries a messageId (so it opens the record modal)', () => {
    const n = normalizeMail({ messageId: '<m@city>', category: 'licenses', subject: 'Tavern License', district: '12' });
    assert.equal(n.source, 'mail');
    assert.equal(n.messageId, '<m@city>');
    assert.match(n.headline, /Tavern License/);
    assert.match(n.meta, /District 12/);
  });

  it('agenda shows committee + date', () => {
    const n = normalizeAgenda({
      title: 'Rezoning of 2000 S 13th',
      eventBodyName: 'ZND Committee',
      eventDate: '2026-06-23',
    });
    assert.equal(n.source, 'agenda');
    assert.match(n.meta, /ZND Committee/);
    assert.match(n.meta, /2026-06-23/);
  });

  it('minutes carries the spoken snippet', () => {
    const n = normalizeMinutes({
      eventBodyName: 'Common Council',
      eventDate: '2026-06-10',
      text: 'we approved the data center',
    });
    assert.equal(n.source, 'minutes');
    assert.match(n.snippet, /data center/);
  });

  it('zoning links its section to the source URL', () => {
    const n = normalizeZoning({
      section: '295-505',
      text: 'Residential district uses',
      sourceUrl: 'http://code.gov/295-505',
    });
    assert.equal(n.source, 'zoning');
    assert.match(n.headline, /code\.gov\/295-505/);
    assert.match(n.headline, /295-505/);
  });
});

describe('buildFederatedResultsCard — grouped by source', () => {
  const groups = [
    {
      source: 'mail',
      results: [
        normalizeMail({ messageId: '<m@city>', category: 'licenses', subject: 'Tavern License', district: '12' }),
      ],
    },
    {
      source: 'agenda',
      results: [normalizeAgenda({ title: 'Rezoning hearing', eventBodyName: 'ZND', eventDate: '2026-06-23' })],
    },
    {
      source: 'minutes',
      results: [normalizeMinutes({ eventBodyName: 'Council', eventDate: '2026-06-10', text: 'approved the plan' })],
    },
    {
      source: 'zoning',
      results: [normalizeZoning({ section: '295-505', text: 'uses', sourceUrl: 'http://code.gov/x' })],
    },
  ];
  const text = (card) => JSON.stringify(card.blocks);

  it('leads with the term and labels every source group', () => {
    const card = buildFederatedResultsCard({ term: 'data center', groups });
    assert.match(text(card), /data center/);
    assert.match(text(card), /Civic mail/i);
    assert.match(text(card), /agenda/i);
    assert.match(text(card), /minutes/i);
    assert.match(text(card), /[Zz]oning/);
  });

  it('renders each source’s results', () => {
    const card = buildFederatedResultsCard({ term: 'x', groups });
    assert.match(text(card), /Tavern License/);
    assert.match(text(card), /Rezoning hearing/);
    assert.match(text(card), /approved the plan/);
    assert.match(text(card), /295-505/);
  });

  it('gives a mail result the Read button (record modal)', () => {
    const card = buildFederatedResultsCard({ term: 'x', groups });
    const button = card.blocks
      .flatMap((b) => (b.accessory ? [b.accessory] : []))
      .find((a) => a.action_id === 'open_civic_record');
    assert.ok(button);
    assert.equal(button.value, '<m@city>');
  });

  it('omits empty source groups', () => {
    const card = buildFederatedResultsCard({ term: 'x', groups: [{ source: 'mail', results: [] }, groups[1]] });
    assert.doesNotMatch(text(card), /Civic mail/i);
    assert.match(text(card), /agenda/i);
  });

  it('shows a no-results state when every group is empty', () => {
    const card = buildFederatedResultsCard({ term: 'nothing', groups: [{ source: 'mail', results: [] }] });
    assert.match(text(card).toLowerCase(), /no records|nothing/);
  });
});
