import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { GUIDE_URL, helpForRole, INTRO, primaryRole, ROLES } from '../../help/guide.js';

describe('primaryRole — which persona view to default to', () => {
  it('prefers reporter > organizer > association across a user’s channels', () => {
    assert.equal(primaryRole(['association', 'reporter']), 'reporter');
    assert.equal(primaryRole(['association', 'organizer']), 'organizer');
    assert.equal(primaryRole(['association']), 'association');
  });

  it('defaults to association when nothing matches or input is empty', () => {
    assert.equal(primaryRole([]), 'association');
    assert.equal(primaryRole(undefined), 'association');
    assert.equal(primaryRole(['mystery']), 'association');
  });
});

describe('helpForRole — role-tailored, bilingual capability content', () => {
  for (const role of ROLES) {
    it(`returns at least two sections of capabilities for "${role}"`, () => {
      const guide = helpForRole(role, 'en');
      assert.equal(guide.role, role);
      assert.ok(guide.tagline.length > 0, 'has a persona tagline');
      assert.ok(guide.sections.length >= 2, 'has multiple capability groups');
      for (const section of guide.sections) {
        assert.ok(section.heading.length > 0);
        assert.ok(section.items.length >= 1);
        for (const item of section.items) {
          assert.ok(item.icon && item.title && item.body, 'each item has icon/title/body');
        }
      }
    });
  }

  it('leads the reporter with newsroom tools (stories / dossier / video)', () => {
    const text = JSON.stringify(helpForRole('reporter', 'en')).toLowerCase();
    assert.ok(/stories|brief me|dossier|video/.test(text), 'reporter view surfaces reporter tools');
  });

  it('leads the association with alerts + how to be heard', () => {
    const text = JSON.stringify(helpForRole('association', 'en')).toLowerCase();
    assert.ok(/alert|heard|watch/.test(text));
  });

  it('renders Spanish copy that differs from English', () => {
    const en = helpForRole('organizer', 'en');
    const es = helpForRole('organizer', 'es');
    assert.notEqual(es.tagline, en.tagline, 'ES tagline is composed, not the EN string');
    assert.match(JSON.stringify(es), /[áéíóúñ¿¡]/u, 'ES content carries Spanish orthography');
  });

  it('falls back to the association plan for an unknown role', () => {
    assert.equal(helpForRole('mystery', 'en').role, 'association');
  });
});

describe('module constants', () => {
  it('exposes the three personas', () => {
    assert.deepEqual([...ROLES].sort(), ['association', 'organizer', 'reporter']);
  });

  it('INTRO is bilingual', () => {
    assert.ok(INTRO.en.length > 0 && INTRO.es.length > 0);
  });

  it('GUIDE_URL is an https link', () => {
    assert.match(GUIDE_URL, /^https:\/\//);
  });
});
