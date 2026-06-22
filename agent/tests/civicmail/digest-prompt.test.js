import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildDigestBriefingPrompt,
  DIGEST_BRIEFING_SCHEMA,
  DIGEST_BRIEFING_SYSTEM_PROMPT,
  generateDigestBriefing,
} from '../../civicmail/digest-prompt.js';

const aggregate = (overrides = {}) => ({
  total: 9,
  suppressed: 0,
  categoryCounts: { neighborhood_services: 4, licenses: 3, meetings: 2 },
  breakdowns: {
    neighborhood_services: [
      { label: 'ROW Excavation Utility', count: 2 },
      { label: 'Code Enforcement', count: 1 },
      { label: 'Commercial Alteration Permit', count: 1 },
    ],
    licenses: [
      { label: 'Food Dealer Retail', count: 2 },
      { label: 'Class B Tavern License', count: 1 },
    ],
  },
  highlights: [
    { category: 'meetings', subject: 'Zoning, Neighborhoods and Development Committee 6/16' },
    {
      category: 'licenses',
      subject: 'APPLICATION Class B Tavern License',
      business: 'COZUMEL III, LLC',
      district: '12',
    },
  ],
  recurringEntities: [{ entity: 'COZUMEL III, LLC', count: 2 }],
  ...overrides,
});

describe('buildDigestBriefingPrompt — grounded in the real aggregate', () => {
  it('puts the real category totals into the prompt', () => {
    const prompt = buildDigestBriefingPrompt(aggregate());
    assert.match(prompt, /4 .*permit|permit.*4|neighborhood/i);
    assert.match(prompt, /3 .*licens/i);
    assert.match(prompt, /2 .*meeting/i);
  });

  it('lists the routine breakdown labels so the model never invents record types', () => {
    const prompt = buildDigestBriefingPrompt(aggregate());
    assert.match(prompt, /ROW Excavation Utility/);
    assert.match(prompt, /Code Enforcement/);
    assert.match(prompt, /Food Dealer Retail/);
  });

  it('names recurring applicants so the pattern line is grounded, not inferred', () => {
    const prompt = buildDigestBriefingPrompt(aggregate());
    assert.match(prompt, /COZUMEL III, LLC/);
  });
});

describe('DIGEST_BRIEFING_SYSTEM_PROMPT — grounded + bilingual', () => {
  it('forbids inventing facts beyond the provided counts', () => {
    assert.match(DIGEST_BRIEFING_SYSTEM_PROMPT.toLowerCase(), /only|do not invent|never invent/);
  });

  it('instructs native Spanish with the civic glossary (not word-for-word translation)', () => {
    assert.match(DIGEST_BRIEFING_SYSTEM_PROMPT.toLowerCase(), /spanish|español/);
    assert.match(DIGEST_BRIEFING_SYSTEM_PROMPT, /licencia|ordenanza|audiencia/);
  });
});

describe('DIGEST_BRIEFING_SCHEMA', () => {
  it('requires en + es, each with briefing + pattern', () => {
    assert.deepEqual(DIGEST_BRIEFING_SCHEMA.required.sort(), ['en', 'es']);
    assert.deepEqual(DIGEST_BRIEFING_SCHEMA.properties.en.required.sort(), ['briefing', 'pattern']);
    assert.equal(DIGEST_BRIEFING_SCHEMA.additionalProperties, false);
  });
});

describe('generateDigestBriefing — schema-validated single batch call', () => {
  it('returns the validated {en, es} pair from one injected generate call', async () => {
    let calls = 0;
    const generate = async ({ system, prompt }) => {
      calls += 1;
      assert.ok(system && prompt);
      return {
        en: {
          briefing: 'The city logged 4 permit records and 3 license actions this week.',
          pattern: 'Cozumel III LLC filed twice.',
        },
        es: {
          briefing: 'La ciudad registró 4 permisos y 3 licencias esta semana.',
          pattern: 'Cozumel III LLC presentó dos solicitudes.',
        },
      };
    };
    const result = await generateDigestBriefing(aggregate(), { generate });
    assert.equal(calls, 1, 'exactly one batch call, not one per email');
    assert.match(result.en.briefing, /4 permit/);
    assert.match(result.es.pattern, /Cozumel/);
  });

  it('throws on a malformed result (missing es.pattern) — never ships an unvalidated briefing', async () => {
    const generate = async () => ({ en: { briefing: 'x', pattern: 'y' }, es: { briefing: 'z' } });
    await assert.rejects(() => generateDigestBriefing(aggregate(), { generate }), /briefing|malformed/i);
  });
});
