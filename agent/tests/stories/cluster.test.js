import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { THEME_FAMILIES, themeOf } from '../../stories/cluster.js';

describe('themeOf — subject beat from the title (first-match precedence)', () => {
  it('resolves each of the 8 beats', () => {
    assert.equal(themeOf('A motion modifying Police Department pursuit policy'), 'police');
    assert.equal(themeOf('Communication relating to lead poisoning and public health'), 'health');
    assert.equal(themeOf('A rezoning of a vacant lot for housing'), 'housing');
    assert.equal(themeOf('Resolution approving a TIF district for redevelopment'), 'development');
    assert.equal(themeOf('Application for a Class B Tavern liquor license'), 'licenses');
    assert.equal(themeOf('Resolution relating to forestry and green space in a park'), 'parks');
    assert.equal(themeOf('Resolution for repaving and sewer work on N 27th St'), 'streets');
    assert.equal(themeOf('Confirmation of the mayoral appointment to a commission'), 'appointments');
  });

  it('returns null for an off-vocabulary title', () => {
    assert.equal(themeOf('Communication relating to routine staffing matters'), null);
    assert.equal(themeOf(''), null);
    assert.equal(themeOf(undefined), null);
  });

  it('first-match precedence: a TIF-for-a-development is development, not money/streets', () => {
    assert.equal(themeOf('Resolution authorizing $5 million in TIF for a development agreement'), 'development');
  });

  it('exposes 8 named families with emoji + regex', () => {
    assert.equal(THEME_FAMILIES.length, 8);
    assert.deepEqual(
      THEME_FAMILIES.map((f) => f.key),
      ['police', 'health', 'housing', 'development', 'licenses', 'parks', 'streets', 'appointments'],
    );
    for (const fam of THEME_FAMILIES) {
      assert.equal(typeof fam.emoji, 'string');
      assert.ok(fam.re instanceof RegExp);
    }
  });
});
