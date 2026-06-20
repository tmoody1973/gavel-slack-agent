import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  buildStoryAnglePrompt,
  generateStoryAngle,
  STORY_ANGLE_SCHEMA,
  storyAngleSystemPrompt,
} from '../../stories/angle.js';

const lead = (overrides = {}) => ({
  item: { title: 'An ordinance creating an Immigration Advisory Board', eventBodyName: 'Common Council' },
  tags: [{ kind: 'novelty' }, { kind: 'accountability' }],
  matterText: 'Creates a 9-member advisory board to advise the Common Council on immigration policy.',
  sponsorName: 'Ald. José G. Pérez',
  ...overrides,
});

describe('story-angle prompt — grounded in the real record', () => {
  it('puts the real matter (title, sponsor, body) into the prompt', () => {
    const prompt = buildStoryAnglePrompt(lead());
    assert.match(prompt, /Immigration Advisory Board/);
    assert.match(prompt, /José G\. Pérez/);
    assert.match(prompt, /9-member advisory board/);
  });

  it('carries the tag reasons so the angle explains why it surfaced', () => {
    const prompt = buildStoryAnglePrompt(lead());
    assert.match(prompt.toLowerCase(), /novelty/);
    assert.match(prompt.toLowerCase(), /accountability/);
  });

  it('system prompt forbids fabrication and frames leads, not verdicts (EN)', () => {
    const system = storyAngleSystemPrompt('en');
    assert.match(system.toLowerCase(), /use only facts/);
    assert.match(system.toLowerCase(), /lead|worth a look/);
    // the safety rule itself must explicitly forbid asserting wrongdoing
    assert.match(system.toLowerCase(), /never assert wrongdoing/);
  });

  it('composes the angle in Spanish with the civic glossary for ES channels', () => {
    const system = storyAngleSystemPrompt('es');
    assert.match(system.toLowerCase(), /spanish|español/);
    assert.match(system, /ordenanza|concejal/);
  });

  it('schema constrains output to {hook, whyStory}', () => {
    assert.deepEqual(STORY_ANGLE_SCHEMA.required.sort(), ['hook', 'whyStory']);
    assert.equal(STORY_ANGLE_SCHEMA.additionalProperties, false);
  });
});

describe('generateStoryAngle — schema-validated boundary', () => {
  it('returns the {hook, whyStory} pair from the injected generator', async () => {
    const generate = async ({ system, prompt }) => {
      assert.ok(system && prompt, 'generate received system + prompt');
      return {
        hook: 'New board would give immigrants a formal voice at City Hall.',
        whyStory: 'First of its kind in Milwaukee.',
      };
    };
    const angle = await generateStoryAngle(lead(), { generate });
    assert.equal(angle.hook, 'New board would give immigrants a formal voice at City Hall.');
    assert.equal(angle.whyStory, 'First of its kind in Milwaukee.');
  });

  it('passes the language through to the system prompt', async () => {
    let seenSystem = '';
    const generate = async ({ system }) => {
      seenSystem = system;
      return { hook: 'h', whyStory: 'w' };
    };
    await generateStoryAngle(lead(), { generate, language: 'es' });
    assert.match(seenSystem.toLowerCase(), /español|spanish/);
  });

  it('throws on a malformed model result (missing whyStory) — never ships an unvalidated angle', async () => {
    const generate = async () => ({ hook: 'only a hook' });
    await assert.rejects(() => generateStoryAngle(lead(), { generate }), /angle/i);
  });
});
