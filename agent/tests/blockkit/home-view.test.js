import assert from 'node:assert/strict';
import { test } from 'node:test';
import { homeView } from '../../blockkit/home-view.js';

const state = {
  strip: { meetings: 3, lateAdds: 1, watchHits: 2 },
  watches: [{ channelId: 'C1', channelName: 'general', entity: 'Punta Cana LLC' }],
  channels: [
    {
      channelId: 'C1',
      channelName: 'general',
      committees: ['ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'],
      keywords: ['rezoning'],
      language: 'es',
    },
  ],
};

test('homeView renders the status strip with all three counts', () => {
  const view = homeView(state);
  assert.equal(view.type, 'home');
  const all = JSON.stringify(view.blocks);
  assert.match(all, /3\*+ meetings touch your subscriptions/);
  assert.match(all, /1\*+ added late/);
  assert.match(all, /2\*+ watch hits/);
});

test('homeView lists watches with a remove overflow carrying channel+entity', () => {
  const view = homeView(state);
  const all = JSON.stringify(view.blocks);
  assert.equal(all.match(/home_watch_remove/g).length, 1);
  assert.ok(all.includes('Punta Cana LLC'));
  const expectedValue = JSON.stringify({ channelId: 'C1', entity: 'Punta Cana LLC' });
  assert.ok(all.includes(JSON.stringify(expectedValue).slice(1, -1)));
});

test('homeView has a ＋ Watch button and an Edit button per channel', () => {
  const all = JSON.stringify(homeView(state).blocks);
  assert.ok(all.includes('home_add_watch'));
  assert.ok(all.includes('home_edit_channel'));
  assert.ok(all.includes('#general'));
  assert.match(all, /Español/);
  assert.ok(all.includes('rezoning'));
});

test('homeView renders the setup CTA when there are no subscribed channels', () => {
  const view = homeView({ strip: { meetings: 0, lateAdds: 0, watchHits: 0 }, watches: [], channels: [] });
  const all = JSON.stringify(view.blocks);
  assert.match(all, /\/gavel/);
  assert.match(all, /invite/i);
  assert.ok(!all.includes('home_edit_channel'));
});

test('homeView shows an empty-watches hint instead of nothing', () => {
  const view = homeView({ ...state, watches: [] });
  assert.match(JSON.stringify(view.blocks), /No watches yet/i);
});
