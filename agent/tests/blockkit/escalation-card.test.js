import assert from 'node:assert/strict';
import { test } from 'node:test';
import { escalationCard } from '../../blockkit/escalation-card.js';

const info = {
  fileNumber: '250086',
  title: 'Substitute resolution assigning the honorary street name John J. Williams',
  committee: 'PUBLIC WORKS COMMITTEE',
  recommendedDate: '2026-05-20',
  url: 'https://milwaukee.legistar.com/LegislationDetail.aspx?ID=70781&GUID=ABC',
};

test('escalationCard: EN names file, committee, and links back', () => {
  const card = escalationCard({ ...info });
  const json = JSON.stringify(card.blocks);
  assert.equal(card.blocks[0].type, 'header');
  assert.ok(json.includes('File #250086'));
  assert.ok(json.includes('PUBLIC WORKS COMMITTEE'));
  assert.ok(json.includes('Common Council'));
  assert.ok(json.includes(info.url));
  assert.match(card.text, /Common Council/i);
});

test('escalationCard: ES appends Spanish framing; file/committee stay English', () => {
  const card = escalationCard({ ...info, language: 'es' });
  assert.ok(card.blocks.some((b) => b.type === 'divider'));
  const json = JSON.stringify(card.blocks);
  assert.ok(json.includes('Concejo')); // ES framing
  assert.ok(json.includes('File #250086')); // stays English
});

test('escalationCard: no url → no link block, still renders', () => {
  const card = escalationCard({ ...info, url: undefined });
  const json = JSON.stringify(card.blocks);
  assert.ok(!json.includes('LegislationDetail'));
  assert.ok(json.includes('File #250086'));
});
