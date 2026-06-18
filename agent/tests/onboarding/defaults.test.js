import assert from 'node:assert';
import { describe, it } from 'node:test';

import { CORE_COMMITTEES, defaultsForRole, ROLES } from '../../onboarding/defaults.js';

const ZONING = 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE';
const LICENSES = 'LICENSES COMMITTEE';
const CED = 'COMMUNITY & ECONOMIC DEVELOPMENT COMMITTEE';

describe('defaultsForRole', () => {
  it('association → ZND/Licenses/CED, English, digest+how-to-be-heard+clips, single channel', () => {
    assert.deepStrictEqual(defaultsForRole('association'), {
      committees: [ZONING, LICENSES, CED],
      keywords: [],
      language: 'en',
      extras: ['sundayDigest', 'howToBeHeard', 'meetingClips'],
      channelShape: 'single',
    });
  });

  it('organizer → Zoning/Licenses + permit keyword, Spanish, watchlist+ownership+bilingual search, multi-area', () => {
    assert.deepStrictEqual(defaultsForRole('organizer'), {
      committees: [ZONING, LICENSES],
      keywords: ['permit'],
      language: 'es',
      extras: ['watchlists', 'ownershipTools', 'bilingualTranscriptSearch'],
      channelShape: 'multiArea',
    });
  });

  it('reporter → all covered committees, English, agenda-change+transcript primer, single channel', () => {
    assert.deepStrictEqual(defaultsForRole('reporter'), {
      committees: CORE_COMMITTEES,
      keywords: [],
      language: 'en',
      extras: ['agendaChange', 'transcriptSearchPrimer'],
      channelShape: 'single',
    });
  });

  it('reporter "all committees" is a superset of the association and organizer committees', () => {
    const reporter = defaultsForRole('reporter').committees;
    for (const committee of [
      ...defaultsForRole('association').committees,
      ...defaultsForRole('organizer').committees,
    ]) {
      assert.ok(reporter.includes(committee), `expected reporter to cover ${committee}`);
    }
  });

  it('throws on an unknown role rather than returning a partial config', () => {
    assert.throws(() => defaultsForRole('mayor'), /unknown role "mayor"/);
    assert.throws(() => defaultsForRole(undefined), /unknown role/);
  });

  it('returns a fresh deep copy — mutating the result never corrupts the shared preset', () => {
    const first = defaultsForRole('association');
    first.committees.push('TAMPERED');
    first.extras.push('TAMPERED');
    first.keywords.push('TAMPERED');
    const second = defaultsForRole('association');
    assert.deepStrictEqual(second.committees, [ZONING, LICENSES, CED]);
    assert.deepStrictEqual(second.extras, ['sundayDigest', 'howToBeHeard', 'meetingClips']);
    assert.deepStrictEqual(second.keywords, []);
  });

  it('every role yields a valid, well-formed config', () => {
    for (const role of ROLES) {
      const config = defaultsForRole(role);
      assert.ok(Array.isArray(config.committees) && config.committees.length > 0, `${role} committees`);
      assert.ok(Array.isArray(config.keywords), `${role} keywords`);
      assert.ok(['en', 'es'].includes(config.language), `${role} language`);
      assert.ok(Array.isArray(config.extras) && config.extras.length > 0, `${role} extras`);
      assert.ok(['single', 'multiArea'].includes(config.channelShape), `${role} channelShape`);
    }
  });
});
