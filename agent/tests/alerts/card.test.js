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

test('card contains both EN and ES summary text', () => {
  const { blocks } = buildAlertCard(input);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('The city creates a board.'));
  assert.ok(all.includes('La ciudad crea una junta.'));
  assert.ok(all.includes('En español'));
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

test('the <48h warning flag is absent unless row.walkOnFlag is true', () => {
  const without = JSON.stringify(buildAlertCard(input).blocks);
  assert.ok(!without.includes('Added late'));
  const withFlag = JSON.stringify(buildAlertCard({ ...input, row: { ...input.row, walkOnFlag: true } }).blocks);
  assert.ok(withFlag.includes('Added late'));
});
