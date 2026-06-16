import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  buildClipArgs,
  buildUploadParams,
  clipVideoMoment,
  granicusMediaUrl,
  uploadClipToSlack,
  videoMomentDeepLink,
} from '../../transcripts/video.js';

test('granicusMediaUrl builds the MediaPlayer URL from EventMedia', () => {
  assert.equal(granicusMediaUrl(5210), 'https://milwaukee.granicus.com/MediaPlayer.php?clip_id=5210');
});

test('videoMomentDeepLink points the player at the item timestamp (tier 1)', () => {
  const link = videoMomentDeepLink(5210, 770);
  assert.match(link, /clip_id=5210/);
  assert.match(link, /starttime=770/);
});

test('buildClipArgs requests just the [start, start+duration] section via yt-dlp', () => {
  const args = buildClipArgs({ eventMedia: 5210, startSeconds: 770, durationSeconds: 90, outPath: '/tmp/c.mp4' });
  const joined = args.join(' ');
  assert.match(joined, /--download-sections \*770-860/);
  assert.match(joined, /-o \/tmp\/c\.mp4/);
  assert.match(joined, /MediaPlayer\.php\?clip_id=5210/);
});

test('a short item still gets a sane minimum clip length', () => {
  const args = buildClipArgs({ eventMedia: 1, startSeconds: 100, durationSeconds: 2, outPath: '/tmp/c.mp4' });
  assert.match(args.join(' '), /\*100-130/); // floored to 30s
});

test('clipVideoMoment invokes the injected runner with yt-dlp + args and returns the path', async () => {
  let calledWith;
  const out = await clipVideoMoment(
    { eventMedia: 5210, startSeconds: 770, durationSeconds: 90, outPath: '/tmp/clip.mp4' },
    {
      run: async (cmd, args) => {
        calledWith = { cmd, args };
      },
    },
  );
  assert.equal(calledWith.cmd, 'yt-dlp');
  assert.match(calledWith.args.join(' '), /\*770-860/);
  assert.equal(out, '/tmp/clip.mp4');
});

test('buildUploadParams maps a clip path to files.uploadV2 arguments', () => {
  const params = buildUploadParams({
    channel: 'C0B8KS5VCCC',
    filePath: '/tmp/hopkins-13441.mp4',
    title: 'Hopkins St debate',
    initialComment: '▶ item 2 — the repurchase discussion',
  });
  assert.equal(params.channel_id, 'C0B8KS5VCCC');
  assert.equal(params.file, '/tmp/hopkins-13441.mp4');
  assert.equal(params.filename, 'hopkins-13441.mp4'); // derived from the path
  assert.equal(params.title, 'Hopkins St debate');
  assert.equal(params.initial_comment, '▶ item 2 — the repurchase discussion');
});

test('uploadClipToSlack calls the injected client with the upload params and returns its result', async () => {
  let calledWith;
  const client = {
    files: {
      uploadV2: async (params) => {
        calledWith = params;
        return { ok: true, files: [{ id: 'F1' }] };
      },
    },
  };
  const result = await uploadClipToSlack(client, {
    channel: 'C0B8KS5VCCC',
    filePath: '/tmp/clip.mp4',
    title: 'A moment',
  });
  assert.equal(calledWith.channel_id, 'C0B8KS5VCCC');
  assert.equal(calledWith.file, '/tmp/clip.mp4');
  assert.equal(calledWith.filename, 'clip.mp4');
  assert.equal(result.ok, true);
});
