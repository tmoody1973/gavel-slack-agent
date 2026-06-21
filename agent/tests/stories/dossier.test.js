import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assembleDossier, findMatterMoment } from '../../stories/dossier.js';

const item = (over = {}) => ({
  eventItemId: 7,
  eventId: 100,
  matterId: 555,
  title: 'A resolution authorizing the sale of 2409-11 West Hopkins Street',
  eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  eventDate: '2026-06-25',
  tags: [{ kind: 'equity' }],
  ...over,
});

const member = {
  name: 'Russell W. Stamper, II',
  nameKey: 'stamper',
  title: 'District 15 Alderman',
  imageUrl: 'x',
  email: 'a',
  phone: 'b',
  webpage: 'c',
};

function deps(over = {}) {
  return {
    enrich: async () => ({
      matter: { fileNumber: '260176' },
      event: { inSiteUrl: 'https://legistar/x' },
      person: { name: 'Russell Stamper', email: 's@x' },
    }),
    listMembers: async () => [member],
    getMatterHistory: async () => [{ date: '2026-05-01', action: 'ASSIGNED TO', body: 'ZONING' }],
    getOutcomes: async () => [
      { actionName: 'HELD', eventDate: '2026-05-10' },
      { actionName: 'RECOMMENDED FOR ADOPTION', passedFlag: 'Pass', tally: '5-0', eventDate: '2026-06-10' },
    ],
    searchMoment: async () => ({
      text: 'this money is available',
      speakers: [1],
      startTime: 975,
      eventMedia: 5200,
      eventDate: '2026-06-10',
    }),
    generate: async () => ({ hook: 'City selling a tax-deeded lot back.', whyStory: 'Worth a look at who benefits.' }),
    language: 'en',
    ...over,
  };
}

describe('assembleDossier — fuse every reporting thread for one lead (MOO-129)', () => {
  it('assembles angle, sponsor (matched member), history, outcome, and the video moment', async () => {
    const d = await assembleDossier(item(), deps());
    assert.equal(d.fileNumber, '260176');
    assert.equal(d.angle.hook, 'City selling a tax-deeded lot back.');
    assert.equal(d.member.name, 'Russell W. Stamper, II'); // sponsor name matched to the directory member
    assert.equal(d.history.length, 1);
    assert.equal(d.moment.startTime, 975);
    assert.equal(d.event.inSiteUrl, 'https://legistar/x');
  });

  it('picks the most recent outcome when several exist', async () => {
    const d = await assembleDossier(item(), deps());
    assert.equal(d.outcome.actionName, 'RECOMMENDED FOR ADOPTION'); // 2026-06-10 > 2026-05-10
  });

  it('skips history/outcome lookups when the item has no matterId', async () => {
    let historyCalls = 0;
    const d = await assembleDossier(
      item({ matterId: undefined }),
      deps({
        getMatterHistory: async () => {
          historyCalls += 1;
          return [];
        },
      }),
    );
    assert.equal(historyCalls, 0);
    assert.deepEqual(d.history, []);
    assert.equal(d.outcome, null);
  });

  it('degrades gracefully — one failing source never sinks the dossier', async () => {
    const d = await assembleDossier(
      item(),
      deps({
        searchMoment: async () => {
          throw new Error('rts down');
        },
        generate: async () => {
          throw new Error('claude down');
        },
      }),
    );
    assert.equal(d.moment, null);
    assert.equal(d.angle, null);
    assert.equal(d.fileNumber, '260176'); // the rest still assembled
  });

  it('generates the angle in the requested language with the sponsor name', async () => {
    let captured;
    await assembleDossier(
      item(),
      deps({
        language: 'es',
        generate: async (input) => {
          captured = input;
          return { hook: 'h', whyStory: 'w' };
        },
      }),
    );
    assert.match(captured.system, /Spanish|español/i);
  });
});

describe('findMatterMoment — only surface a genuinely relevant transcript hit', () => {
  const search = (score) => async () => [{ text: 'q', startTime: 1, eventMedia: 5200, score }];

  it('returns the top hit when its relevance clears the score gate', async () => {
    const hit = await findMatterMoment(
      { title: 'rezoning on Hopkins' },
      { embedQuery: async () => [0.1], search: search(0.62) },
    );
    assert.equal(hit.eventMedia, 5200);
  });

  it('returns null on a weak match (no misleading quote)', async () => {
    const hit = await findMatterMoment(
      { title: 'rezoning on Hopkins' },
      { embedQuery: async () => [0.1], search: search(0.3) },
    );
    assert.equal(hit, null);
  });

  it('returns null for an empty title without calling RTS/embeddings', async () => {
    let embedded = 0;
    const hit = await findMatterMoment(
      { title: '  ' },
      {
        embedQuery: async () => {
          embedded += 1;
          return [];
        },
        search: search(0.9),
      },
    );
    assert.equal(hit, null);
    assert.equal(embedded, 0);
  });
});
