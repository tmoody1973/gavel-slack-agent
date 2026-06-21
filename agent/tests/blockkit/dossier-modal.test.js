import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dossierModal } from '../../blockkit/dossier-modal.js';

const base = (over = {}) => ({
  item: {
    eventItemId: 7,
    title: 'A substitute resolution authorizing the sale of the City-owned property at 2409-11 West Hopkins Street',
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    eventDate: '2026-06-25',
    agendaNumber: '8',
  },
  fileNumber: '260176',
  angle: {
    hook: 'The city is selling a tax-deeded lot back to former owners.',
    whyStory: 'Public land disposition warrants a look at who benefits.',
  },
  member: {
    name: 'Ald. Russell W. Stamper, II',
    title: 'District 15 Alderman',
    imageUrl: 'https://example.com/s.jpg',
    email: 's@milwaukee.gov',
    phone: '414-555-1000',
    webpage: 'https://city/stamper',
  },
  sponsorName: 'Russell Stamper',
  history: [
    { date: '2026-05-01T00:00:00', action: 'ASSIGNED TO COMMITTEE', body: 'ZONING', result: null },
    { date: '2026-05-20T00:00:00', action: 'HELD TO CALL OF THE CHAIR', body: 'ZONING', result: 'Pass' },
  ],
  outcome: null,
  moment: {
    text: 'Housing, of course, is at the forefront, but if you got a small business to build up a corridor in the neighborhood, this money is available.',
    speakers: [1],
    startTime: 975,
    eventMedia: 5200,
    eventDate: '2026-06-10',
    agendaNumber: '8',
  },
  event: { inSiteUrl: 'https://milwaukee.legistar.com/x', agendaPdf: 'https://x/agenda.pdf' },
  ...over,
});

const flat = (view) => JSON.stringify(view.blocks);
const actions = (view) => view.blocks.flatMap((b) => b.elements ?? []);

describe('dossierModal — the reporter dossier (MOO-129)', () => {
  it('is a modal with the dossier callback_id, ≤100 blocks, titled by the item', () => {
    const view = dossierModal(base(), { language: 'en' });
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'story_dossier_modal');
    assert.ok(view.blocks.length <= 100);
    assert.match(JSON.stringify(view.title), /Hopkins|Brief|Dossier|Story/i);
  });

  it('renders the angle (hook + why), grounded', () => {
    const all = flat(dossierModal(base(), { language: 'en' }));
    assert.match(all, /selling a tax-deeded lot/);
    assert.match(all, /warrants a look/);
  });

  it('renders the sponsor with headshot + contact', () => {
    const all = flat(dossierModal(base(), { language: 'en' }));
    assert.match(all, /Russell W. Stamper/);
    assert.match(all, /414-555-1000/);
    assert.match(all, /example\.com\/s\.jpg/);
  });

  it('renders the matter history timeline', () => {
    const all = flat(dossierModal(base(), { language: 'en' }));
    assert.match(all, /HELD TO CALL OF THE CHAIR/);
    assert.match(all, /260176/); // File # in the history title
  });

  it('renders the 🎥 transcript moment with a ▶ Granicus deep link at the timestamp', () => {
    const all = flat(dossierModal(base(), { language: 'en' }));
    assert.match(all, /Housing, of course, is at the forefront/);
    assert.match(all, /clip_id=5200&starttime=975/);
  });

  it('carries Watch + Send-to-me actions keyed on the eventItemId', () => {
    const view = dossierModal(base(), { language: 'en' });
    const watch = actions(view).find((e) => e.action_id === 'dossier_watch');
    const send = actions(view).find((e) => e.action_id === 'dossier_send');
    assert.equal(watch.value, '7');
    assert.equal(send.value, '7');
  });

  it('degrades gracefully when video/outcome/history are absent (an upcoming item with a thin record)', () => {
    const view = dossierModal(base({ moment: null, outcome: null, history: [], angle: null, member: null }), {
      language: 'en',
    });
    assert.equal(view.type, 'modal');
    const all = flat(view);
    assert.match(all, /2409-11 West Hopkins/); // still shows the item
    assert.doesNotMatch(all, /clip_id=/); // no fabricated video link
    assert.match(all.toLowerCase(), /not yet|no vote|upcoming|on file|thin/); // honest empty-state language
  });

  it('renders an outcome line when a vote is on record', () => {
    const all = flat(
      dossierModal(
        base({
          outcome: {
            actionName: 'RECOMMENDED FOR ADOPTION',
            passedFlag: 'Pass',
            tally: '5-0',
            eventDate: '2026-06-10',
          },
        }),
        { language: 'en' },
      ),
    );
    assert.match(all, /RECOMMENDED FOR ADOPTION/);
    assert.match(all, /5-0/);
  });

  it('renders Spanish section labels when language is es (proper names/quotes stay as written)', () => {
    const all = flat(dossierModal(base(), { language: 'es' }));
    assert.match(all, /Patrocinador|Historial|Qué se dijo|Resultado|Seguir|enviar|Ángulo/i);
    assert.match(all, /Russell W. Stamper/); // names unchanged
  });
});
