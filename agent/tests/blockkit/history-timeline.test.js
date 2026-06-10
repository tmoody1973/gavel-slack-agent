import assert from 'node:assert/strict';
import { test } from 'node:test';
import { historyTimeline } from '../../blockkit/history-timeline.js';

const actions = [
  { date: '2026-05-01T12:53:00', action: 'ASSIGNED TO', body: 'COMMON COUNCIL', result: null },
  { date: '2026-06-01T00:00:00', action: 'ADOPTED', body: 'HISTORIC PRESERVATION COMMISSION', result: 'Pass' },
];

test('historyTimeline renders a heading and one line per action, oldest first', () => {
  const blocks = historyTimeline({ fileNumber: '260039', actions });
  assert.match(blocks[0].text.text, /History — File #260039/);
  const body = blocks[1].text.text;
  const lines = body.split('\n');
  assert.equal(lines.length, 2);
  assert.match(lines[0], /2026-05-01.*ASSIGNED TO.*COMMON COUNCIL/);
  assert.match(lines[1], /2026-06-01.*ADOPTED.*HISTORIC PRESERVATION COMMISSION.*Pass/);
});

test('historyTimeline keeps only the latest 20 actions and says so', () => {
  const many = Array.from({ length: 25 }, (_, i) => ({
    date: `2026-01-${String(i + 1).padStart(2, '0')}T00:00:00`,
    action: `ACTION ${i}`,
    body: 'BODY',
    result: null,
  }));
  const blocks = historyTimeline({ fileNumber: '1', actions: many });
  const body = blocks[1].text.text;
  assert.equal(body.split('\n').length, 20);
  assert.ok(!body.includes('ACTION 0'));
  const all = JSON.stringify(blocks);
  assert.match(all, /Showing the latest 20 of 25 actions/);
});

test('historyTimeline omits the heading file number when unknown', () => {
  const blocks = historyTimeline({ actions });
  assert.match(blocks[0].text.text, /History\*$/);
});
