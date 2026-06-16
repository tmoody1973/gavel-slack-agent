import assert from 'node:assert/strict';
import { test } from 'node:test';
import { watchCard } from '../../blockkit/watch-card.js';

const matterHit = {
  entity: 'Punta Cana LLC',
  kind: 'matter',
  matter: {
    matterId: 1,
    file: '260229',
    title: 'Sale of 2000 S 13th St to Punta Cana LLC',
    typeName: 'Resolution',
    bodyName: 'ZONING',
  },
};
const permitHit = {
  entity: '2000 S 13th St',
  kind: 'permit',
  permit: { recordId: 'RES-ALT-1', address: '2000 S 13TH ST', type: 'Wrecking Permit', status: 'Issued', date: '2026-06-12 00:00:00' },
};

test('watchCard: EN card names the watched entity and the match', () => {
  const card = watchCard({ hits: [matterHit, permitHit] });
  const json = JSON.stringify(card.blocks);
  assert.equal(card.blocks[0].type, 'header');
  assert.ok(json.includes('Punta Cana LLC'));
  assert.ok(json.includes('File #260229'));
  assert.ok(json.includes('Wrecking Permit'));
  assert.ok(json.includes('2000 S 13TH ST'));
  assert.match(card.text, /2 new match/i);
});

test('watchCard: ES appends a Spanish framing section (dynamic data stays English)', () => {
  const card = watchCard({ hits: [matterHit], language: 'es' });
  assert.ok(card.blocks.some((b) => b.type === 'divider'));
  const json = JSON.stringify(card.blocks);
  assert.ok(json.includes('lista')); // ES framing word
  assert.ok(json.includes('File #260229')); // file number stays English
});

test('watchCard: singular fallback text', () => {
  const card = watchCard({ hits: [matterHit] });
  assert.match(card.text, /1 new match\b/i);
});
