import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mapMatter, matterDetailUrl } from '../../poller/legistar.js';

test('mapMatter: surfaces guid/title/status alongside fileNumber', () => {
  const m = mapMatter({ MatterFile: '250086', MatterGuid: 'ABC-123', MatterTitle: 'A street name', MatterStatusName: 'Passed' });
  assert.equal(m.fileNumber, '250086');
  assert.equal(m.guid, 'ABC-123');
  assert.equal(m.title, 'A street name');
  assert.equal(m.statusName, 'Passed');
});

test('matterDetailUrl: builds a Legistar legislation-detail link, or undefined without a guid', () => {
  assert.equal(
    matterDetailUrl(70781, '6767C5D4-1835-4A00-B728-757FCB1843C9'),
    'https://milwaukee.legistar.com/LegislationDetail.aspx?ID=70781&GUID=6767C5D4-1835-4A00-B728-757FCB1843C9',
  );
  assert.equal(matterDetailUrl(70781, undefined), undefined);
});
