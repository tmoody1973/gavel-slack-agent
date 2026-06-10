import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matterCard } from '../../blockkit/matter-card.js';

const matter = {
  fileNumber: '260039',
  title: 'Resolution relating to a Certificate of Appropriateness',
  status: 'In Committee',
  bodyName: 'HISTORIC PRESERVATION COMMISSION',
  legistarUrl: 'https://milwaukee.legistar.com/LegislationDetail.aspx?ID=1',
};

test('matterCard renders file number, title, status, and the Legistar link', () => {
  const blocks = matterCard(matter);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('File #260039'));
  assert.ok(all.includes('Certificate of Appropriateness'));
  assert.ok(all.includes('In Committee'));
  assert.ok(all.includes('milwaukee.legistar.com'));
});

test('matterCard tolerates missing optional fields', () => {
  const blocks = matterCard({ title: 'Untitled ordinance' });
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('Untitled ordinance'));
  assert.ok(!all.includes('undefined'));
});
