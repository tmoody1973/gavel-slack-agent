import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { aggregateCivicMail, civicLifeKind } from '../../civicmail/aggregate.js';

// Fixtures mirror the real `civicNotifications` shape (see civicmail/notification.js):
// neighborhood_services rows carry the city's own `description` label; licenses carry
// a `business` entity + a human `subType`; meetings may carry a legistarMeetingId.
const ns = (description, district = null, recordNumber = 'X-26-1') => ({
  category: 'neighborhood_services',
  subject: `Neighborhood Services new record #${recordNumber}`,
  description,
  district,
  recordNumber,
});

const license = (business, subType, district = null) => ({
  category: 'licenses',
  subject: `APPLICATION ${subType}`,
  subType,
  business,
  district,
});

const meeting = (subject, legistarMeetingId = null) => ({
  category: 'meetings',
  subject,
  legistarMeetingId,
});

const SAMPLE = [
  ns('ROW Excavation Utility', null, 'PWEU-26-1'),
  ns('ROW Excavation Utility', null, 'PWEU-26-2'),
  ns('Commercial Alteration Permit', '12', 'COM-ALT-26-1'),
  ns('Code Enforcement', '12', 'ENF-26-1'),
  license('COZUMEL III, LLC', 'Food Dealer Retail', '12'),
  license('COZUMEL III, LLC', 'Class B Tavern License', '12'),
  license('CAFE BUNSUKA LLC', 'Food Dealer Retail', '5'),
  meeting('Zoning, Neighborhoods and Development Committee 6/16', '1348260'),
  meeting('Redevelopment Authority Agenda 6/18'),
];

describe('aggregateCivicMail — counts and category rollup', () => {
  it('counts notifications by category', () => {
    const agg = aggregateCivicMail(SAMPLE);
    assert.equal(agg.categoryCounts.neighborhood_services, 4);
    assert.equal(agg.categoryCounts.licenses, 3);
    assert.equal(agg.categoryCounts.meetings, 2);
    assert.equal(agg.total, 9);
  });

  it('returns a zeroed structure for empty input (never throws)', () => {
    const agg = aggregateCivicMail([]);
    assert.equal(agg.total, 0);
    assert.deepEqual(agg.breakdowns.neighborhood_services, []);
    assert.deepEqual(agg.highlights, []);
    assert.deepEqual(agg.recurringEntities, []);
  });
});

describe('aggregateCivicMail — routine folded into counts', () => {
  it('folds neighborhood-services by the city description label, sorted by count desc', () => {
    const agg = aggregateCivicMail(SAMPLE);
    const nsFold = agg.breakdowns.neighborhood_services;
    assert.deepEqual(nsFold[0], { label: 'ROW Excavation Utility', count: 2 });
    // both single-count labels present
    const labels = nsFold.map((f) => f.label);
    assert.ok(labels.includes('Commercial Alteration Permit'));
    assert.ok(labels.includes('Code Enforcement'));
  });

  it('folds licenses by their human license type', () => {
    const agg = aggregateCivicMail(SAMPLE);
    const licFold = agg.breakdowns.licenses;
    const food = licFold.find((f) => f.label === 'Food Dealer Retail');
    assert.equal(food.count, 2);
  });

  it('folds code-enforcement complaints by record type, not the unique complaint text', () => {
    // The city packs the specific complaint into the description after a colon
    // ("DNS Activity:Large pile of tires"), so folding on the raw text never groups.
    // The record TYPE (before the colon) is the fold unit the digest promises.
    const rows = [
      ns('DNS Activity:Large pile of tires and other debris', null, 'ENF-26-1'),
      ns('DNS Activity:High grass and weeds throughout.', null, 'ENF-26-2'),
      ns('DNS Activity:Dog waste all over the property.', null, 'ENF-26-3'),
      ns('Commercial Alteration Permit', null, 'COM-ALT-26-9'),
    ];
    const fold = aggregateCivicMail(rows).breakdowns.neighborhood_services;
    const codeEnforcement = fold.find((f) => /code enforcement/i.test(f.label));
    assert.ok(codeEnforcement, 'the three DNS complaints fold under one code-enforcement label');
    assert.equal(codeEnforcement.count, 3);
    // the clean-typed record stays its own line
    assert.ok(fold.some((f) => f.label === 'Commercial Alteration Permit'));
  });
});

describe('aggregateCivicMail — recurring entities (the honest pattern signal)', () => {
  it('surfaces a license entity that appears 2+ times', () => {
    const agg = aggregateCivicMail(SAMPLE);
    const cozumel = agg.recurringEntities.find((e) => /COZUMEL III/.test(e.entity));
    assert.ok(cozumel, 'COZUMEL III LLC should be flagged as recurring');
    assert.equal(cozumel.count, 2);
  });

  it('does NOT flag a one-off entity', () => {
    const agg = aggregateCivicMail(SAMPLE);
    assert.ok(!agg.recurringEntities.some((e) => /BUNSUKA/.test(e.entity)));
  });
});

describe('aggregateCivicMail — date window (the "this week" gate)', () => {
  const dated = (receivedAt, subType) => ({ ...license('X LLC', subType ?? 'Food Dealer Retail'), receivedAt });
  const rows = [
    dated('2026-06-08T10:00:00Z', 'A'),
    dated('2026-06-10T10:00:00Z', 'B'),
    dated('2026-06-12T10:00:00Z', 'C'),
  ];

  it('keeps only rows whose receivedAt falls in [since, until]', () => {
    const agg = aggregateCivicMail(rows, { since: '2026-06-09', until: '2026-06-11' });
    assert.equal(agg.total, 1);
    assert.equal(agg.breakdowns.licenses[0].label, 'B');
  });

  it('includes the boundary days (inclusive window)', () => {
    const agg = aggregateCivicMail(rows, { since: '2026-06-08', until: '2026-06-12' });
    assert.equal(agg.total, 3);
  });

  it('no window keeps every row regardless of date', () => {
    assert.equal(aggregateCivicMail(rows).total, 3);
  });
});

describe('aggregateCivicMail — civic life (press releases, events, hearings beyond permits)', () => {
  const other = (subject) => ({ category: 'other', subject });
  const news = (subject) => ({ category: 'newsletter', subject });
  const rows = [
    other('News release from the City of Milwaukee Youth Council'),
    other('Media advisory with event flyer from Alderman José G. Pérez'),
    other('Join the safe summer kick off Saturday at Sherman Park'),
    other('Come join us on June 24th: Public Power Hearing at City Hall!'),
    other('Port Milwaukee Request for Pricing - Creative Services'),
    other('City of Milwaukee Job Announcement'),
    news('MPS Board Director June 2026 Newsletter'),
  ];

  it('breaks "other" + "newsletter" into civic-life kinds instead of one opaque count', () => {
    const labels = aggregateCivicMail(rows).breakdowns.civic_life.map((f) => f.label);
    assert.ok(labels.includes('Press release'), 'press releases get their own kind');
    assert.ok(labels.includes('Community event'));
    assert.ok(labels.includes('Bid / RFP'));
    assert.ok(labels.includes('Newsletter'));
    assert.ok(labels.includes('Job posting'));
  });

  it('promotes a community event / hearing to a highlight (actionable, not buried in a count)', () => {
    const agg = aggregateCivicMail(rows, { maxHighlights: 10 });
    assert.ok(agg.highlights.some((h) => /Public Power Hearing|safe summer/.test(h.subject)));
  });

  it('classifies a media advisory as a press release, not an event', () => {
    assert.equal(civicLifeKind('Media advisory with event flyer from Alderman José G. Pérez'), 'Press release');
  });

  it('classifies a request for pricing as Bid / RFP', () => {
    assert.equal(civicLifeKind('Port Milwaukee Request for Pricing - Creative Services'), 'Bid / RFP');
  });
});

describe('aggregateCivicMail — Legistar dedup', () => {
  it('suppresses a meeting whose legistarMeetingId matches a detected poller event', () => {
    const agg = aggregateCivicMail(SAMPLE, { legistarItems: [{ eventId: 1348260 }] });
    assert.equal(agg.categoryCounts.meetings, 1, 'the ZND meeting is deduped');
    assert.equal(agg.suppressed, 1);
    assert.ok(!agg.highlights.some((h) => /Zoning, Neighborhoods/.test(h.subject)));
  });
});

describe('aggregateCivicMail — optional district gate (deliberate, not the OR matcher)', () => {
  it('keeps only rows in the given district when district is set', () => {
    const agg = aggregateCivicMail(SAMPLE, { district: '12' });
    // d12: 2 NS + 2 licenses = 4; meetings have no district so they drop
    assert.equal(agg.total, 4);
    assert.equal(agg.categoryCounts.meetings ?? 0, 0);
    assert.equal(agg.categoryCounts.neighborhood_services, 2);
  });

  it('citywide (no district) keeps everything', () => {
    const agg = aggregateCivicMail(SAMPLE);
    assert.equal(agg.total, 9);
  });
});

describe('aggregateCivicMail — highlights (actionable items surfaced individually)', () => {
  it('surfaces meetings as highlights and caps the total', () => {
    const agg = aggregateCivicMail(SAMPLE, { maxHighlights: 3 });
    assert.ok(agg.highlights.length <= 3);
    // meetings (time-boxed) come first
    assert.equal(agg.highlights[0].category, 'meetings');
  });

  it('prioritizes recurring-entity licenses ahead of one-off licenses', () => {
    const onlyLicenses = SAMPLE.filter((n) => n.category === 'licenses');
    const agg = aggregateCivicMail(onlyLicenses, { maxHighlights: 1 });
    assert.match(agg.highlights[0].business, /COZUMEL III/);
  });
});
