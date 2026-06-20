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

test('homeView strip uses singular forms for counts of one', () => {
  const view = homeView({ ...state, strip: { meetings: 1, lateAdds: 1, watchHits: 1 } });
  const all = JSON.stringify(view.blocks);
  assert.match(all, /1\*+ meeting touches your subscriptions/);
  assert.match(all, /1\*+ watch hit[^s]/);
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

test('the configured hub offers a Set up another channel onboarding button', () => {
  const all = JSON.stringify(homeView(state).blocks);
  assert.ok(all.includes('onboarding_open_role'));
  assert.match(all, /Set up another channel/);
});

test('the configured hub offers the multi-neighborhood growth button (FD-D)', () => {
  const all = JSON.stringify(homeView(state).blocks);
  assert.ok(all.includes('grow_areas'));
  assert.match(all, /multiple neighborhoods/);
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

const discoverEntry = (over) => ({
  item: {
    eventItemId: 491,
    title: 'A resolution authorizing $4.2 million in bonding',
    eventBodyName: 'COMMON COUNCIL',
    ...over,
  },
  reasons: [{ kind: 'big', detail: 'money' }],
});

// The shared `state` fixture has an ES channel; use an EN channel for English-string assertions.
const enState = { ...state, channels: [{ ...state.channels[0], language: 'en' }] };

test('homeView renders a Discover this week section with a watch button per item (MOO-123)', () => {
  const view = homeView({ ...enState, discover: [discoverEntry()] });
  const all = JSON.stringify(view.blocks);
  assert.match(all, /Discover this week/);
  assert.match(all, /\$4\.2 million in bonding/);
  assert.ok(all.includes('discover_watch'), 'each discover item carries a discover_watch button');
});

test('Discover section shows explainable reason tags', () => {
  const view = homeView({
    ...enState,
    discover: [
      {
        item: { eventItemId: 7, title: 'Paving (7th Aldermanic District)', eventBodyName: 'PUBLIC WORKS COMMITTEE' },
        reasons: [{ kind: 'district', detail: '7' }, { kind: 'walkOn' }],
      },
    ],
  });
  const all = JSON.stringify(view.blocks);
  assert.match(all, /District 7/);
  assert.match(all, /Added late/);
});

test('Discover section shows a friendly quiet-week line when empty', () => {
  const all = JSON.stringify(homeView({ ...enState, discover: [] }).blocks);
  assert.match(all, /Discover this week/);
  assert.match(all, /[Qq]uiet week/);
});

test('Discover section localizes to Spanish', () => {
  const esState = { ...state, channels: [{ ...state.channels[0], language: 'es' }], discover: [discoverEntry()] };
  const all = JSON.stringify(homeView(esState).blocks);
  assert.match(all, /Descubre esta semana/);
});

test('homeView tolerates a state with no discover field (back-compat)', () => {
  assert.doesNotThrow(() => homeView(state));
});
