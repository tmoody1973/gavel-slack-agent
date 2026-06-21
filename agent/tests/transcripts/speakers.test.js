import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  applyConfidenceGate,
  buildSpeakerBundles,
  buildSpeakerMapEntries,
  buildSpeakerMapPrompt,
  deriveRoster,
  formatSpeakerLabel,
  generateSpeakerMap,
  NAME_CONFIDENCE_THRESHOLD,
  reconstructUtterancesFromChunks,
  SPEAKER_MAP_SCHEMA,
  speakerMapSystemPrompt,
} from '../../transcripts/speakers.js';

const councilMembers = [
  { name: 'Russell W. Stamper, II', title: 'Alderman', district: 15, nameKey: 'stamper' },
  { name: 'Milele A. Coggs', title: 'Alderwoman', district: 6, nameKey: 'coggs' },
  { name: 'Robert J. Bauman', title: 'Alderman', district: 4, nameKey: 'bauman' },
];

describe('deriveRoster — candidate officials for a meeting', () => {
  it('returns the directory members as name/title/district candidates', () => {
    const roster = deriveRoster(councilMembers, { committee: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE' });
    assert.equal(roster.length, 3);
    assert.deepEqual(roster[0], { name: 'Russell W. Stamper, II', title: 'Alderman', district: 15 });
  });

  it('is empty-safe when the directory is missing', () => {
    assert.deepEqual(deriveRoster(undefined, { committee: 'x' }), []);
    assert.deepEqual(deriveRoster([], { committee: 'x' }), []);
  });
});

describe('buildSpeakerBundles — per-speaker text the model reasons over', () => {
  const utterances = [
    { speaker: 0, transcript: 'The committee will come to order. Roll call.' },
    { speaker: 1, transcript: 'Thank you, chairman. Alderman Stamper, present.' },
    { speaker: 0, transcript: 'Item 8, a rezoning at 2700 West Wisconsin.' },
    { speaker: 2, transcript: 'I represent the applicant on item 8.' },
  ];

  it('groups text by speaker label with an utterance count', () => {
    const bundles = buildSpeakerBundles(utterances);
    const byLabel = new Map(bundles.map((b) => [b.speaker, b]));
    assert.equal(byLabel.get(0).utteranceCount, 2);
    assert.match(byLabel.get(0).sampleText, /come to order/);
    assert.match(byLabel.get(0).sampleText, /Item 8/);
    assert.equal(byLabel.get(1).utteranceCount, 1);
    assert.match(byLabel.get(1).sampleText, /Alderman Stamper/);
  });

  it('caps per-speaker text so the prompt stays bounded', () => {
    const long = [{ speaker: 0, transcript: 'word '.repeat(2000) }];
    const [bundle] = buildSpeakerBundles(long, { maxCharsPerSpeaker: 300 });
    assert.ok(bundle.sampleText.length <= 300, 'sampleText respects the cap');
  });
});

describe('reconstructUtterancesFromChunks — re-run on already-ingested meetings', () => {
  it('attributes single-speaker windows and drops unattributable multi-speaker ones', () => {
    const chunks = [
      { speakers: [0], text: 'Roll call please.', startTime: 5 },
      { speakers: [1, 2], text: 'overlapping cross-talk', startTime: 12 },
      { speakers: [1], text: 'Alderman Coggs, present.', startTime: 20 },
    ];
    const utterances = reconstructUtterancesFromChunks(chunks);
    assert.deepEqual(
      utterances.map((u) => u.speaker),
      [0, 1],
    );
    assert.match(utterances[1].transcript, /Coggs/);
  });
});

describe('speaker-map prompt + schema — conservative, accuracy-first', () => {
  it('system prompt forbids guessing a name (journalist requirement)', () => {
    const system = speakerMapSystemPrompt();
    assert.match(system.toLowerCase(), /never (guess|invent)/);
    assert.match(system.toLowerCase(), /accuracy|wrong name/);
  });

  it('prompt carries the roster and the per-speaker evidence', () => {
    const bundles = buildSpeakerBundles([{ speaker: 1, transcript: 'Thank you, chairman. Alderman Stamper here.' }]);
    const roster = deriveRoster(councilMembers, { committee: 'ZONING' });
    const prompt = buildSpeakerMapPrompt({ bundles, roster, committee: 'ZONING', eventDate: '2026-06-10' });
    assert.match(prompt, /Stamper/);
    assert.match(prompt, /Speaker 1/);
    assert.match(prompt, /ZONING/);
  });

  it('schema constrains the mapping rows', () => {
    assert.deepEqual(SPEAKER_MAP_SCHEMA.required, ['mappings']);
    const row = SPEAKER_MAP_SCHEMA.properties.mappings.items;
    assert.deepEqual(row.required.sort(), ['confidence', 'evidence', 'name', 'role', 'speaker']);
    assert.equal(row.additionalProperties, false);
  });
});

describe('generateSpeakerMap — schema-validated boundary', () => {
  it('returns the mappings array from the injected generator', async () => {
    const generate = async ({ system, prompt }) => {
      assert.ok(system && prompt);
      return {
        mappings: [
          { speaker: 1, name: 'Russell W. Stamper, II', role: 'member', confidence: 0.9, evidence: 'self-identified' },
        ],
      };
    };
    const result = await generateSpeakerMap(
      { bundles: [], roster: [], committee: 'ZONING', eventDate: '2026-06-10' },
      { generate },
    );
    assert.equal(result.mappings[0].name, 'Russell W. Stamper, II');
  });

  it('throws when the model output is malformed (never ships an unvalidated map)', async () => {
    const generate = async () => ({ notMappings: true });
    await assert.rejects(() => generateSpeakerMap({ bundles: [], roster: [] }, { generate }), /map/i);
  });
});

describe('applyConfidenceGate — the false-naming ≈ 0 guarantee', () => {
  const roster = deriveRoster(councilMembers, { committee: 'ZONING' });

  it('names a high-confidence member match and attaches the roster title', () => {
    const map = applyConfidenceGate(
      [{ speaker: 1, name: 'Russell W. Stamper, II', role: 'member', confidence: 0.92, evidence: 'self-id' }],
      roster,
    );
    assert.equal(map[1].name, 'Russell W. Stamper, II');
    assert.equal(map[1].title, 'Alderman');
    assert.equal(map[1].role, 'member');
  });

  it('drops the name below the confidence threshold but keeps the role', () => {
    const map = applyConfidenceGate(
      [{ speaker: 2, name: 'Milele A. Coggs', role: 'member', confidence: 0.4, evidence: 'weak' }],
      roster,
    );
    assert.equal(map[2].name, null);
    assert.equal(map[2].role, 'member');
  });

  it('refuses a confident name that is NOT in the roster (anti-hallucination)', () => {
    const map = applyConfidenceGate(
      [{ speaker: 3, name: 'Alderman Nobody', role: 'member', confidence: 0.99, evidence: 'hallucinated' }],
      roster,
    );
    assert.equal(map[3].name, null, 'a name absent from the roster is never published');
  });

  it('never names staff/applicant/public/unknown roles', () => {
    const map = applyConfidenceGate(
      [
        { speaker: 4, name: 'Russell W. Stamper, II', role: 'applicant', confidence: 0.99, evidence: 'x' },
        { speaker: 5, name: null, role: 'staff', confidence: 0.9, evidence: 'runs roll' },
      ],
      roster,
    );
    assert.equal(map[4].name, null);
    assert.equal(map[5].name, null);
    assert.equal(map[5].role, 'staff');
  });

  it('exposes a sane default threshold', () => {
    assert.ok(NAME_CONFIDENCE_THRESHOLD >= 0.7 && NAME_CONFIDENCE_THRESHOLD <= 0.95);
  });
});

describe('buildSpeakerMapEntries — the full meeting pipeline', () => {
  it('composes roster → bundles → Claude → gate into Convex-ready entries', async () => {
    const utterances = [
      { speaker: 1, transcript: 'Thank you, chairman. This is Alderman Stamper.' },
      { speaker: 2, transcript: 'I represent the applicant tonight.' },
    ];
    const generate = async ({ prompt }) => {
      assert.match(prompt, /Stamper/); // the bundle reached the prompt
      return {
        mappings: [
          { speaker: 1, name: 'Russell W. Stamper, II', role: 'member', confidence: 0.95, evidence: 'self-id' },
          {
            speaker: 2,
            name: 'Russell W. Stamper, II',
            role: 'applicant',
            confidence: 0.99,
            evidence: 'role says applicant',
          },
        ],
      };
    };
    const entries = await buildSpeakerMapEntries(
      { utterances, councilMembers, committee: 'ZONING', eventDate: '2026-06-10' },
      { generate },
    );
    const byLabel = new Map(entries.map((e) => [e.speaker, e]));
    assert.equal(byLabel.get(1).name, 'Russell W. Stamper, II');
    assert.equal(byLabel.get(1).title, 'Alderman');
    assert.equal(byLabel.get(2).name, null, 'an applicant is never named even at high confidence');
  });
});

describe('formatSpeakerLabel — what a receipt actually shows', () => {
  const map = {
    1: { name: 'Russell W. Stamper, II', title: 'Alderman', role: 'member', confidence: 0.92 },
    2: { name: null, title: null, role: 'chair', confidence: 0.8 },
    3: { name: null, title: null, role: 'staff', confidence: 0.7 },
  };

  it('renders a named member with the honorific', () => {
    assert.match(formatSpeakerLabel([1], map), /Alderman Russell W\. Stamper, II/);
  });

  it('renders a role label when there is no confident name', () => {
    assert.match(formatSpeakerLabel([2], map), /chair/i);
    assert.match(formatSpeakerLabel([3], map), /staff/i);
  });

  it('falls back to a generic label when the speaker is unmapped or the map is missing', () => {
    assert.match(formatSpeakerLabel([9], map), /speaker/i);
    assert.match(formatSpeakerLabel([1], null), /speaker/i);
  });

  it('joins multiple speakers, preferring named people', () => {
    const label = formatSpeakerLabel([1, 2], map);
    assert.match(label, /Stamper/);
  });
});
