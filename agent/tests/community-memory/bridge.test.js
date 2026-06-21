import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  BRIDGE_JUDGE_SCHEMA,
  BRIDGE_QUERY_SCHEMA,
  findBridgeMatches,
  generateBridgeQuery,
  judgeBridgeMatch,
  selectCandidates,
} from '../../agent/community-memory/bridge.js';

const item = (over = {}) => ({
  eventItemId: 7,
  eventId: 100,
  client: 'milwaukee',
  title: 'A resolution relating to the rezoning of the property at 2000 S 13th St (8th Aldermanic District)',
  eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  eventDate: '2026-06-25',
  walkOnFlag: true,
  ...over,
});

const channel = (over = {}) => ({
  channelId: 'C1',
  client: 'milwaukee',
  language: 'en',
  committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
  keywords: [],
  boundary: null,
  ...over,
});

// A seeded RTS snippet whose `content` must NEVER appear in the pipeline's output.
const SECRET_CONTENT = 'my neighbor said the corner store on 13th is being torn down';
const snippet = () => ({
  message_ts: '1750000000.000',
  channel_id: 'C1',
  author_user_id: 'U9',
  is_author_bot: false,
  content: SECRET_CONTENT,
  permalink: 'https://x.slack.com/p/1',
});

describe('schemas are well-formed structured-output contracts', () => {
  it('query schema requires queryEn/queryEs/entity', () => {
    assert.deepEqual(BRIDGE_QUERY_SCHEMA.required.sort(), ['entity', 'queryEn', 'queryEs']);
    assert.equal(BRIDGE_QUERY_SCHEMA.additionalProperties, false);
  });
  it('judge schema requires isMatch/confidence/reason', () => {
    assert.deepEqual(BRIDGE_JUDGE_SCHEMA.required.sort(), ['confidence', 'isMatch', 'reason']);
  });
});

describe('generateBridgeQuery — legalese → what a neighbor would say', () => {
  it('returns a validated {queryEn, queryEs, entity}', async () => {
    const generate = async () => ({
      queryEn: '2000 S 13th St rezoning',
      queryEs: 'rezonificación 2000 S 13th',
      entity: '2000 S 13th St',
    });
    const out = await generateBridgeQuery(item(), { generate });
    assert.equal(out.entity, '2000 S 13th St');
    assert.equal(out.queryEn, '2000 S 13th St rezoning');
  });
  it('throws on a malformed model result (never ship an unvalidated query)', async () => {
    const generate = async () => ({ queryEn: '', entity: 'x' });
    await assert.rejects(() => generateBridgeQuery(item(), { generate }), /malformed|queryE/i);
  });
});

describe('judgeBridgeMatch — is the chatter really about THIS item?', () => {
  it('returns the verdict from the model', async () => {
    const generate = async () => ({ isMatch: true, confidence: 0.9, reason: 'same address + rezoning' });
    const v = await judgeBridgeMatch({ item: item(), snippets: [snippet()] }, { generate });
    assert.equal(v.isMatch, true);
    assert.equal(v.confidence, 0.9);
  });
});

describe('findBridgeMatches — the bounded match loop', () => {
  const deps = (over = {}) => ({
    generateQuery: async () => ({ queryEn: 'q', queryEs: 'q', entity: '2000 S 13th St' }),
    searchChannel: async () => [snippet()],
    judge: async () => ({ isMatch: true, confidence: 0.9, reason: 'r' }),
    ...over,
  });

  it('proposes a confident match for a salient upcoming item', async () => {
    const matches = await findBridgeMatches({ upcoming: [item()], subscriptions: [channel()], proposed: [] }, deps());
    assert.equal(matches.length, 1);
    assert.equal(matches[0].channelId, 'C1');
    assert.equal(matches[0].item.eventItemId, 7);
    assert.equal(matches[0].entity, '2000 S 13th St');
    assert.equal(matches[0].language, 'en');
  });

  it('NEVER leaks Slack message content into its output (compliance)', async () => {
    const matches = await findBridgeMatches({ upcoming: [item()], subscriptions: [channel()], proposed: [] }, deps());
    assert.ok(!JSON.stringify(matches).includes(SECRET_CONTENT), 'message content must not appear in the match output');
  });

  it('skips an item with no community discussion (RTS pre-filter)', async () => {
    const matches = await findBridgeMatches(
      { upcoming: [item()], subscriptions: [channel()], proposed: [] },
      deps({ searchChannel: async () => [] }),
    );
    assert.equal(matches.length, 0);
  });

  it('skips a low-confidence match (conservative threshold)', async () => {
    const matches = await findBridgeMatches(
      { upcoming: [item()], subscriptions: [channel()], proposed: [] },
      deps({ judge: async () => ({ isMatch: true, confidence: 0.4, reason: 'weak' }) }),
    );
    assert.equal(matches.length, 0);
  });

  it('skips an isMatch:false verdict even at high confidence', async () => {
    const matches = await findBridgeMatches(
      { upcoming: [item()], subscriptions: [channel()], proposed: [] },
      deps({ judge: async () => ({ isMatch: false, confidence: 0.95, reason: 'coincidence' }) }),
    );
    assert.equal(matches.length, 0);
  });

  it('does not re-propose an already-proposed (channel,item) pair (dedup)', async () => {
    const matches = await findBridgeMatches(
      { upcoming: [item()], subscriptions: [channel()], proposed: [{ channelId: 'C1', eventItemId: 7 }] },
      deps(),
    );
    assert.equal(matches.length, 0);
  });

  it('carries the channel language for a Spanish channel', async () => {
    const matches = await findBridgeMatches(
      { upcoming: [item()], subscriptions: [channel({ channelId: 'C2', language: 'es' })], proposed: [] },
      deps(),
    );
    assert.equal(matches[0].language, 'es');
  });

  it('considers only channel-relevant candidates (an unrelated-committee item never reaches RTS)', async () => {
    let searched = 0;
    const unrelated = item({ eventItemId: 8, eventBodyName: 'PUBLIC WORKS COMMITTEE' });
    await findBridgeMatches(
      { upcoming: [unrelated], subscriptions: [channel()], proposed: [] },
      deps({
        searchChannel: async () => {
          searched += 1;
          return [];
        },
      }),
    );
    assert.equal(searched, 0, 'an item outside the channel’s committees should not trigger an RTS query');
  });
});

describe('selectCandidates — channel-relevant, salience-ordered, capped', () => {
  it('keeps only items in the channel’s committees and caps the count', () => {
    const zoning = (id) => item({ eventItemId: id, walkOnFlag: false });
    const upcoming = [
      zoning(1),
      zoning(2),
      zoning(3),
      item({ eventItemId: 9, eventBodyName: 'PUBLIC WORKS COMMITTEE' }),
    ];
    const out = selectCandidates(upcoming, channel(), 2);
    assert.equal(out.length, 2, 'capped at 2');
    assert.ok(
      out.every((i) => i.eventBodyName.includes('ZONING')),
      'only relevant committee survives',
    );
  });

  it('orders a salient relevant item ahead of a dull relevant one', () => {
    const dull = item({ eventItemId: 2, walkOnFlag: false, title: 'A communication about zoning paperwork' });
    const salient = item({ eventItemId: 3, walkOnFlag: true });
    const out = selectCandidates([dull, salient], channel(), 5);
    assert.equal(out[0].eventItemId, 3, 'the walk-on item leads');
  });
});
