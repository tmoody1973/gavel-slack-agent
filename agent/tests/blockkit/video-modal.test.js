import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { decodeCommittee, meetingVideoSection, tagSearchable, videoModal } from '../../blockkit/video-modal.js';

const meeting = (over = {}) => ({
  eventId: 13441,
  eventBodyName: 'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
  eventDate: '2026-06-16T00:00:00',
  eventMedia: 5210,
  ...over,
});

const finance = meeting({
  eventId: 13456,
  eventBodyName: 'FINANCE & PERSONNEL COMMITTEE',
  eventDate: '2026-06-18T00:00:00',
  eventMedia: 5213,
});

const flatten = (view) => JSON.stringify(view.blocks ?? view);
const selectIn = (view) =>
  view.blocks
    .flatMap((b) => (b.elements ? b.elements : b.accessory ? [b.accessory] : []))
    .find((e) => e?.action_id === 'video_filter');

describe('tagSearchable — join meetings against the ingested-eventId set (MOO-142)', () => {
  it('marks only meetings whose eventId has transcript chunks', () => {
    const tagged = tagSearchable([meeting(), finance], [13441]);
    assert.equal(tagged.find((m) => m.eventId === 13441).searchable, true);
    assert.equal(tagged.find((m) => m.eventId === 13456).searchable, false);
  });

  it('treats a missing/empty ingested set as nothing searchable', () => {
    assert.equal(tagSearchable([meeting()], [])[0]?.searchable ?? false, false);
  });
});

describe('videoModal — filterable meeting-video browse modal', () => {
  it('is a modal view with the video callback_id and stays under the block cap', () => {
    const view = videoModal([meeting(), finance], { language: 'en', committee: null });
    assert.equal(view.type, 'modal');
    assert.equal(view.callback_id, 'video_browse_modal');
    assert.ok(view.blocks.length <= 100);
  });

  it('carries a committee static_select (video_filter) built only from committees with video, with counts', () => {
    const view = videoModal([meeting(), finance, finance], { language: 'en', committee: null });
    const select = selectIn(view);
    assert.ok(select, 'expected a video_filter select');
    const labels = select.options.map((o) => o.text.text);
    assert.ok(
      labels.some((l) => /All committees/i.test(l)),
      'has an All committees default',
    );
    assert.ok(
      labels.some((l) => /FINANCE & PERSONNEL COMMITTEE \(2\)/.test(l)),
      'per-committee count in label',
    );
    assert.ok(labels.some((l) => /ZONING.*\(1\)/.test(l)));
  });

  it('renders a Granicus ▶ watch link and the 🔍/🎥 searchable tag per meeting', () => {
    const view = videoModal(tagSearchable([meeting(), finance], [13441]), { language: 'en', committee: null });
    const all = flatten(view);
    assert.match(all, /milwaukee\.granicus\.com\/MediaPlayer\.php\?clip_id=5210/);
    assert.match(all, /🔍 Searchable/);
    assert.match(all, /🎥 Video only/);
  });

  it('narrows rows to the active committee and sets the dropdown initial_option', () => {
    const view = videoModal([meeting(), finance], { language: 'en', committee: 'FINANCE & PERSONNEL COMMITTEE' });
    const all = flatten(view);
    assert.match(all, /clip_id=5213/);
    assert.doesNotMatch(all, /clip_id=5210/, 'zoning row filtered out');
    assert.ok(selectIn(view).initial_option, 'initial_option reflects the active committee');
  });

  it('shows an empty state when there is no recent video', () => {
    const view = videoModal([], { language: 'en', committee: null });
    assert.equal(view.type, 'modal');
    assert.match(flatten(view), /No meeting video/i);
  });

  it('renders Spanish copy when language is es', () => {
    const view = videoModal([meeting()], { language: 'es', committee: null });
    assert.match(flatten(view), /Ver en Granicus|Solo video|Con búsqueda/);
  });
});

describe('meetingVideoSection — reporter-gated App Home preview', () => {
  it('renders a heading, preview rows, and a 📋 Browse videos button (video_browse)', () => {
    const blocks = meetingVideoSection(tagSearchable([meeting(), finance], [13441]), 'en');
    const all = JSON.stringify(blocks);
    assert.match(all, /Meeting video/);
    assert.match(all, /video_browse/);
    assert.match(all, /clip_id=5210/);
  });

  it('still offers Browse when there is no recent video (the section degrades gracefully)', () => {
    const blocks = meetingVideoSection([], 'en');
    assert.match(JSON.stringify(blocks), /video_browse/);
  });
});

describe('decodeCommittee — select value → committee name', () => {
  it('round-trips all and a committee', () => {
    assert.equal(decodeCommittee('all'), null);
    assert.equal(
      decodeCommittee('c::ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE'),
      'ZONING, NEIGHBORHOODS & DEVELOPMENT COMMITTEE',
    );
    assert.equal(decodeCommittee(undefined), null);
  });
});
