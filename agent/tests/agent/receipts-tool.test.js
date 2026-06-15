import assert from 'node:assert/strict';
import { test } from 'node:test';
import { appendReceiptBlocks, MAX_RECEIPT_BLOCKS, renderReceiptBlocks } from '../../agent/receipts/tool.js';

const votes = { caption: 'Vote on File #260039', votes: [{ member: 'Ald. Coggs', vote: 'Aye' }] };
const member = { name: 'Milele Coggs', title: 'Alderwoman, 6th District', imageUrl: 'https://x/c.jpg' };
const matter = { fileNumber: '260039', title: 'A resolution', status: 'In Committee' };
const timeline = { fileNumber: '260039', actions: [{ date: '2026-05-01T00:00:00', action: 'ASSIGNED TO' }] };

test('votes renders a data_table block', () => {
  const { blocks } = renderReceiptBlocks({ type: 'votes', votes });
  assert.equal(blocks[0].type, 'data_table');
  assert.equal(blocks[0].caption, 'Vote on File #260039');
});

test('sponsor renders the headshot context block', () => {
  const { blocks } = renderReceiptBlocks({ type: 'sponsor', member });
  assert.equal(blocks[0].type, 'context');
  assert.match(JSON.stringify(blocks), /Milele Coggs/);
});

test('matter and timeline render section blocks', () => {
  const m = renderReceiptBlocks({ type: 'matter', matter });
  assert.match(JSON.stringify(m.blocks), /File #260039/);
  const t = renderReceiptBlocks({ type: 'timeline', timeline });
  assert.match(JSON.stringify(t.blocks), /ASSIGNED TO/);
});

test('unavailable renders errorReply blocks in the requested language', () => {
  const { blocks } = renderReceiptBlocks({
    type: 'unavailable',
    unavailable: { kind: 'no_history', language: 'es', legistarUrl: 'https://milwaukee.legistar.com/x' },
  });
  const all = JSON.stringify(blocks);
  assert.match(all, /historial/);
  assert.ok(all.includes('milwaukee.legistar.com'));
});

test('parcel renders the parcel card with owner and a watchlist button', () => {
  const parcel = { address: '2000 S 13TH ST', owner: 'SHAAN REAL ESTATE INC', zoning: 'RT4', district: '12' };
  const { blocks } = renderReceiptBlocks({ type: 'parcel', parcel });
  const all = JSON.stringify(blocks);
  assert.match(all, /SHAAN REAL ESTATE INC/);
  assert.match(all, /parcel_watch/);
  assert.match(all, /parcel_open_map/);
});

test('a type without its matching payload field returns an error, not a throw', () => {
  const result = renderReceiptBlocks({ type: 'votes' });
  assert.ok(result.error);
  assert.match(result.error, /votes/);
  assert.equal(result.blocks, undefined);

  const parcelMissing = renderReceiptBlocks({ type: 'parcel' });
  assert.ok(parcelMissing.error);
  assert.match(parcelMissing.error, /parcel/);
});

test('appendReceiptBlocks accumulates across calls', () => {
  const receipts = [];
  assert.equal(appendReceiptBlocks(receipts, renderReceiptBlocks({ type: 'matter', matter }).blocks), true);
  assert.equal(appendReceiptBlocks(receipts, renderReceiptBlocks({ type: 'timeline', timeline }).blocks), true);
  assert.ok(receipts.length >= 4);
});

test('appendReceiptBlocks enforces the cap and adds one "Full record" context block', () => {
  const receipts = Array.from({ length: MAX_RECEIPT_BLOCKS - 1 }, () => ({ type: 'section' }));
  const big = Array.from({ length: 10 }, () => ({ type: 'section' }));
  const appended = appendReceiptBlocks(receipts, big, 'https://milwaukee.legistar.com/x');
  assert.equal(appended, true);
  assert.equal(receipts.length, MAX_RECEIPT_BLOCKS);
  const last = receipts.at(-1);
  assert.equal(last.type, 'context');
  assert.match(JSON.stringify(last), /Full record/);
});

test('appendReceiptBlocks refuses once the budget is exhausted', () => {
  const receipts = Array.from({ length: MAX_RECEIPT_BLOCKS }, () => ({ type: 'section' }));
  const appended = appendReceiptBlocks(receipts, [{ type: 'section' }]);
  assert.equal(appended, false);
  assert.equal(receipts.length, MAX_RECEIPT_BLOCKS);
});
