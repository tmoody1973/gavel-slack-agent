import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAlertCard } from '../../alerts/card.js';

const input = {
  row: {
    eventItemId: 490695,
    eventBodyName: 'STEERING & RULES COMMITTEE',
    title: 'An ordinance creating an Immigration Advisory Board',
  },
  matter: { fileNumber: '241554' },
  event: { inSiteUrl: 'https://milwaukee.legistar.com/x' },
  summary: {
    en: { summary: 'The city creates a board.', whyItMatters: 'It affects immigrants.' },
    es: { summary: 'La ciudad crea una junta.', whyItMatters: 'Afecta a los inmigrantes.' },
  },
  footer: { text: '🗣️ *How to be heard / Cómo participar*\n📅 *Jun 8 · 1:30 PM*' },
};

test('card has fallback text and a header with the title', () => {
  const { text, blocks } = buildAlertCard(input);
  assert.match(text, /Immigration Advisory Board/);
  assert.equal(blocks[0].type, 'header');
  assert.match(blocks[0].text.text, /Immigration Advisory Board/);
});

test('ES-language card contains both EN and ES summary text', () => {
  const { blocks } = buildAlertCard({ ...input, language: 'es' });
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('The city creates a board.'));
  assert.ok(all.includes('La ciudad crea una junta.'));
  assert.ok(all.includes('En español'));
});

test('EN-language card (and the default) omits the Spanish section', () => {
  for (const card of [buildAlertCard(input), buildAlertCard({ ...input, language: 'en' })]) {
    const all = JSON.stringify(card.blocks);
    assert.ok(all.includes('The city creates a board.'));
    assert.ok(!all.includes('En español'));
    assert.ok(!all.includes('La ciudad crea una junta.'));
  }
});

test('file number stays untranslated in both language variants', () => {
  for (const language of ['en', 'es']) {
    const all = JSON.stringify(buildAlertCard({ ...input, language }).blocks);
    assert.ok(all.includes('File #241554'));
  }
});

test('card has the footer and the three action buttons carrying the eventItemId', () => {
  const { blocks } = buildAlertCard(input);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('How to be heard'));
  const actions = blocks.find((b) => b.type === 'actions');
  assert.deepEqual(
    actions.elements.map((e) => e.action_id),
    ['alert_watch', 'alert_history', 'alert_ask'],
  );
  assert.ok(actions.elements.every((e) => e.value === '490695'));
});

test('a matched council member renders a headshot context block with contact links', () => {
  const member = {
    district: 12,
    name: 'José G. Pérez',
    title: 'District 12 Alderman',
    imageUrl: 'https://city.milwaukee.gov/x/PerezHeadshot.jpg',
    email: 'jose.perez@milwaukee.gov',
    phone: '414-286-3762',
    webpage: 'https://city.milwaukee.gov/CommonCouncil/Council-Members/District12',
  };
  const { blocks } = buildAlertCard({ ...input, member });
  const memberBlock = blocks.find((b) => b.type === 'context' && b.elements?.some((e) => e.type === 'image'));
  assert.ok(memberBlock, 'expected a context block with an image element');
  const image = memberBlock.elements.find((e) => e.type === 'image');
  assert.equal(image.image_url, member.imageUrl);
  assert.equal(image.alt_text, 'José G. Pérez');
  const text = memberBlock.elements.find((e) => e.type === 'mrkdwn').text;
  assert.match(text, /José G\. Pérez/);
  assert.match(text, /District 12 Alderman/);
  assert.match(text, /414-286-3762/);
  assert.match(text, /mailto:jose\.perez@milwaukee\.gov/);
  assert.match(text, /Council-Members\/District12/);
});

test('without a member the card has no image context block (byte-identical fallback)', () => {
  const withNull = buildAlertCard({ ...input, member: null });
  const without = buildAlertCard(input);
  assert.deepEqual(withNull.blocks, without.blocks);
  assert.ok(!JSON.stringify(without.blocks).includes('"type":"image"'));
});

test('the <48h warning flag is absent unless row.walkOnFlag is true', () => {
  const without = JSON.stringify(buildAlertCard(input).blocks);
  assert.ok(!without.includes('Added late'));
  const withFlag = JSON.stringify(buildAlertCard({ ...input, row: { ...input.row, walkOnFlag: true } }).blocks);
  assert.ok(withFlag.includes('Added late'));
});
