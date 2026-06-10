import assert from 'node:assert/strict';
import { test } from 'node:test';
import { voteTable } from '../../blockkit/vote-table.js';

const votes = [
  { member: 'Ald. Stamper', vote: 'Aye' },
  { member: 'Ald. Coggs', vote: 'No' },
  { member: 'Ald. Zamarripa', vote: 'Excused' },
];

test('voteTable renders a data_table with a header row plus one row per vote', () => {
  const block = voteTable({ caption: 'Vote on File #260039', votes });
  assert.equal(block.type, 'data_table');
  assert.equal(block.caption, 'Vote on File #260039');
  assert.equal(block.rows.length, 4);
  assert.deepEqual(block.rows[0], [
    { type: 'raw_text', text: 'Member' },
    { type: 'raw_text', text: 'Vote' },
  ]);
  assert.deepEqual(block.rows[1], [
    { type: 'raw_text', text: 'Ald. Stamper' },
    { type: 'raw_text', text: 'Aye' },
  ]);
});

test('voteTable caps at 100 data rows (Slack data_table limit)', () => {
  const many = Array.from({ length: 150 }, (_, i) => ({ member: `M${i}`, vote: 'Aye' }));
  const block = voteTable({ caption: 'big', votes: many });
  assert.equal(block.rows.length, 101);
});

test('voteTable shows all 15 council rows on one page', () => {
  const block = voteTable({ caption: 'c', votes });
  assert.equal(block.page_size, 15);
});
