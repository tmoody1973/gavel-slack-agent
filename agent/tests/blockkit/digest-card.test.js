import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestCard } from '../../blockkit/digest-card.js';

const top = [
  {
    title: 'Rezoning of 2000 S 13th St',
    eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    eventDate: '2026-06-18T00:00:00',
    fileNumber: '260234',
    legistarUrl: 'https://milwaukee.legistar.com/x',
    walkOnFlag: true,
  },
  {
    title: 'Liquor license hearing',
    eventBodyName: 'LICENSES COMMITTEE',
    eventDate: '2026-06-19T00:00:00',
    fileNumber: '260250',
  },
];

test('header carries the total and a needs-attention clause when walk-ons exist', () => {
  const { text, blocks } = digestCard({ total: 5, needsAttention: 1, top, language: 'en' });
  assert.match(text, /civic week/i);
  const all = JSON.stringify(blocks);
  assert.match(all, /5\*+ items/);
  assert.match(all, /1\*+ needs attention/);
});

test('drops the needs-attention clause when none', () => {
  const all = JSON.stringify(digestCard({ total: 2, needsAttention: 0, top, language: 'en' }).blocks);
  assert.ok(!all.includes('needs attention'));
});

test('renders top-3 one-liners with file links and a walk-on marker', () => {
  const all = JSON.stringify(digestCard({ total: 2, needsAttention: 1, top, language: 'en' }).blocks);
  assert.ok(all.includes('File #260234'));
  assert.ok(all.includes('milwaukee.legistar.com'));
  assert.match(all, /⚠️/);
  assert.ok(all.includes('Rezoning of 2000 S 13th St'));
});

test('an item without a file number renders title-only without "undefined"', () => {
  const t = [{ title: 'Untitled', eventBodyName: 'X', eventDate: '2026-06-18T00:00:00' }];
  const all = JSON.stringify(digestCard({ total: 1, needsAttention: 0, top: t, language: 'en' }).blocks);
  assert.ok(all.includes('Untitled'));
  assert.ok(!all.includes('undefined'));
});

test('ES card includes a Spanish section; EN-only does not', () => {
  const es = JSON.stringify(digestCard({ total: 2, needsAttention: 1, top, language: 'es' }).blocks);
  assert.match(es, /Tu semana cívica/);
  assert.match(es, /En español/);
  const en = JSON.stringify(digestCard({ total: 2, needsAttention: 1, top, language: 'en' }).blocks);
  assert.ok(!en.includes('En español'));
});

test('has a how-to-be-heard footer and a manage-in-App-Home context line', () => {
  const all = JSON.stringify(digestCard({ total: 2, needsAttention: 0, top, language: 'en' }).blocks);
  assert.match(all, /heard/i);
  assert.match(all, /App Home/);
});

test('quiet-week variant (total 0) renders a graceful card, not a broken one', () => {
  const { text, blocks } = digestCard({ total: 0, needsAttention: 0, top: [], language: 'en' });
  assert.match(text, /quiet/i);
  assert.match(JSON.stringify(blocks), /quiet week/i);
  assert.ok(!JSON.stringify(blocks).includes('undefined'));
});
