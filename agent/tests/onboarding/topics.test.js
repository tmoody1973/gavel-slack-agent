import assert from 'node:assert';
import { describe, it } from 'node:test';

import { COMMITTEES } from '../../onboarding/defaults.js';
import {
  committeesAndKeywordsForTopics,
  TOPIC_KEYS,
  TOPICS,
  topicChoices,
  topicsFor,
} from '../../onboarding/topics.js';

describe('TOPICS map shape', () => {
  it('exposes the six curated discovery topics', () => {
    assert.deepStrictEqual(TOPIC_KEYS, ['housing', 'licenses', 'streets', 'parks', 'safety', 'budget']);
  });

  it('every topic carries EN+ES labels and committee/keyword arrays', () => {
    for (const key of TOPIC_KEYS) {
      const topic = TOPICS[key];
      assert.ok(topic, `topic ${key} exists`);
      assert.strictEqual(typeof topic.label_en, 'string', `${key}.label_en`);
      assert.strictEqual(typeof topic.label_es, 'string', `${key}.label_es`);
      assert.ok(topic.label_en.trim().length > 0, `${key}.label_en non-empty`);
      assert.ok(topic.label_es.trim().length > 0, `${key}.label_es non-empty`);
      assert.ok(Array.isArray(topic.committees), `${key}.committees`);
      assert.ok(Array.isArray(topic.keywords), `${key}.keywords`);
      // A topic with neither a committee nor a keyword can never match anything.
      assert.ok(topic.committees.length + topic.keywords.length > 0, `${key} has at least one signal`);
    }
  });

  it('maps each topic to the verified committee constants from defaults.js', () => {
    assert.deepStrictEqual(TOPICS.housing.committees, [COMMITTEES.ZONING, COMMITTEES.CED, COMMITTEES.CITY_PLAN]);
    assert.deepStrictEqual(TOPICS.licenses.committees, [COMMITTEES.LICENSES]);
    assert.deepStrictEqual(TOPICS.streets.committees, [COMMITTEES.PUBLIC_WORKS]);
    assert.deepStrictEqual(TOPICS.safety.committees, [COMMITTEES.PUBLIC_SAFETY_HEALTH]);
    assert.deepStrictEqual(TOPICS.budget.committees, [COMMITTEES.FINANCE_PERSONNEL]);
    // Milwaukee has no live standing parks committee — parks is keyword-only.
    assert.deepStrictEqual(TOPICS.parks.committees, []);
    assert.ok(TOPICS.parks.keywords.length > 0, 'parks must carry keyword signal');
  });

  it('keeps committee names English even in the ES label set (civic identifier rule)', () => {
    for (const key of TOPIC_KEYS) {
      for (const committee of TOPICS[key].committees) {
        assert.strictEqual(committee, committee.toUpperCase(), `${key} committee stays canonical English`);
      }
    }
  });
});

describe('topic committee/keyword sets are pairwise disjoint (round-trip invariant)', () => {
  it('no committee is shared by two topics', () => {
    const seen = new Map();
    for (const key of TOPIC_KEYS) {
      for (const committee of TOPICS[key].committees) {
        assert.ok(!seen.has(committee), `${committee} shared by ${seen.get(committee)} and ${key}`);
        seen.set(committee, key);
      }
    }
  });

  it('no keyword is shared by two topics', () => {
    const seen = new Map();
    for (const key of TOPIC_KEYS) {
      for (const keyword of TOPICS[key].keywords) {
        assert.ok(!seen.has(keyword), `${keyword} shared by ${seen.get(keyword)} and ${key}`);
        seen.set(keyword, key);
      }
    }
  });
});

describe('committeesAndKeywordsForTopics (forward map)', () => {
  it('returns the union of a single topic', () => {
    assert.deepStrictEqual(committeesAndKeywordsForTopics(['licenses']), {
      committees: TOPICS.licenses.committees,
      keywords: TOPICS.licenses.keywords,
    });
  });

  it('unions and dedups committees + keywords across topics', () => {
    const { committees, keywords } = committeesAndKeywordsForTopics(['housing', 'streets']);
    assert.deepStrictEqual(committees, [...TOPICS.housing.committees, ...TOPICS.streets.committees]);
    assert.deepStrictEqual(keywords, [...TOPICS.housing.keywords, ...TOPICS.streets.keywords]);
    assert.strictEqual(new Set(committees).size, committees.length, 'committees deduped');
  });

  it('ignores unknown topic keys rather than throwing', () => {
    assert.deepStrictEqual(committeesAndKeywordsForTopics(['licenses', 'not-a-topic']), {
      committees: TOPICS.licenses.committees,
      keywords: TOPICS.licenses.keywords,
    });
  });

  it('empty selection yields empty union', () => {
    assert.deepStrictEqual(committeesAndKeywordsForTopics([]), { committees: [], keywords: [] });
  });
});

describe('topicsFor (reverse map)', () => {
  it('lights a topic when any of its committees is present', () => {
    assert.deepStrictEqual(topicsFor([COMMITTEES.LICENSES], []), ['licenses']);
  });

  it('lights a topic when any of its keywords is present', () => {
    assert.deepStrictEqual(topicsFor([], [TOPICS.parks.keywords[0]]), ['parks']);
  });

  it('matches committees case-insensitively (match.js parity)', () => {
    assert.deepStrictEqual(topicsFor([COMMITTEES.LICENSES.toLowerCase()], []), ['licenses']);
  });

  it('returns no topics for an empty subscription', () => {
    assert.deepStrictEqual(topicsFor([], []), []);
  });

  it('returns keys in canonical TOPIC_KEYS order', () => {
    const on = topicsFor([COMMITTEES.FINANCE_PERSONNEL, COMMITTEES.ZONING], []);
    assert.deepStrictEqual(on, ['housing', 'budget']);
  });
});

describe('round-trip stability: union(topics) → topicsFor → same topics', () => {
  // Every subset of the curated topics must survive the write-through → reverse-map
  // cycle unchanged, so the confirm modal re-renders the exact chips a user picked.
  const subsets = (arr) => arr.reduce((acc, x) => acc.concat(acc.map((s) => [...s, x])), [[]]);

  it('holds for all 64 topic subsets', () => {
    for (const subset of subsets(TOPIC_KEYS)) {
      const { committees, keywords } = committeesAndKeywordsForTopics(subset);
      const back = topicsFor(committees, keywords);
      assert.deepStrictEqual(back.sort(), [...subset].sort(), `subset ${subset.join('+') || '(none)'} round-trips`);
    }
  });
});

describe('topicChoices (UI option data)', () => {
  it('returns {key,label} pairs in English by default', () => {
    const choices = topicChoices('en');
    assert.deepStrictEqual(
      choices.map((c) => c.key),
      TOPIC_KEYS,
    );
    assert.strictEqual(choices[0].label, TOPICS.housing.label_en);
  });

  it('localizes labels to Spanish', () => {
    const choices = topicChoices('es');
    assert.strictEqual(choices[0].label, TOPICS.housing.label_es);
  });

  it('falls back to English for an unsupported language', () => {
    assert.strictEqual(topicChoices('fr')[0].label, TOPICS.housing.label_en);
  });
});
