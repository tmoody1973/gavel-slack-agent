import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { COMMAND_COPY, COMMAND_REQUIRED_KEYS, commandCopy } from '../../../listeners/commands/copy.js';

describe('command copy — bilingual completeness (no English cliffs)', () => {
  it('has every required key in BOTH languages', () => {
    for (const lang of ['en', 'es']) {
      for (const key of COMMAND_REQUIRED_KEYS) {
        assert.ok(COMMAND_COPY[lang][key] !== undefined, `missing "${key}" in ${lang}`);
      }
    }
  });

  it('commandCopy(es) returns Spanish prose but keeps slash-command syntax in English', () => {
    const es = commandCopy('es');
    assert.match(es.help.toLowerCase(), /comandos|busca|vigila/);
    assert.match(es.help, /\/gavel/); // command names stay English
  });

  it('status line interpolates committees, keywords, language, and watches (ES)', () => {
    const line = commandCopy('es').statusLine({
      committees: 'LICENSES COMMITTEE',
      keywords: 'rezoning',
      language: 'es',
      watchList: '• Punta Cana LLC',
    });
    assert.match(line, /LICENSES COMMITTEE/); // committee stays English
    assert.match(line, /rezoning/);
    assert.match(line.toLowerCase(), /idioma|español/); // localized label
    assert.match(line, /Punta Cana LLC/);
  });

  it('unknown language falls back to English', () => {
    assert.deepEqual(commandCopy('fr').help, COMMAND_COPY.en.help);
  });
});
