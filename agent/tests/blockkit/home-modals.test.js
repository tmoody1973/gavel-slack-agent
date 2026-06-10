import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addWatchModal, channelConfigModal } from '../../blockkit/home-modals.js';

const channels = [
  { channelId: 'C1', channelName: 'general' },
  { channelId: 'C2', channelName: 'cesar-chavez-dr' },
];

test('addWatchModal has a channel select over subscribed channels and an entity input', () => {
  const modal = addWatchModal(channels);
  assert.equal(modal.type, 'modal');
  assert.equal(modal.callback_id, 'home_add_watch_modal');
  const all = JSON.stringify(modal.blocks);
  assert.ok(all.includes('watch_channel'));
  assert.ok(all.includes('watch_entity'));
  assert.ok(all.includes('cesar-chavez-dr'));
  assert.equal(JSON.stringify(modal).includes('conversations_select'), false);
});

test('channelConfigModal carries the channelId, current values, and the typeahead committees select', () => {
  const modal = channelConfigModal({
    channelId: 'C1',
    channelName: 'general',
    committees: ['LICENSES COMMITTEE'],
    keywords: ['rezoning', 'demolition'],
    language: 'es',
  });
  assert.equal(modal.callback_id, 'home_channel_config_modal');
  assert.equal(modal.private_metadata, 'C1');
  const all = JSON.stringify(modal);
  assert.ok(all.includes('multi_external_select'));
  assert.ok(all.includes('home_committees'));
  assert.ok(all.includes('LICENSES COMMITTEE'));
  assert.ok(all.includes('rezoning, demolition'));
  assert.ok(all.includes('radio_buttons'));
  assert.match(all, /"initial_option":\{[^}]*Español/);
});

test('channelConfigModal tolerates empty committees/keywords (no initial_options key)', () => {
  const modal = channelConfigModal({ channelId: 'C2', channelName: 'x', committees: [], keywords: [], language: 'en' });
  const committeesBlock = modal.blocks.find((b) => b.block_id === 'cfg_committees');
  assert.equal('initial_options' in committeesBlock.element, false);
  const all = JSON.stringify(modal);
  assert.ok(!all.includes('undefined'));
});
