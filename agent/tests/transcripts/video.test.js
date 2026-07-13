import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  archiveMp4Url,
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

const STREAM_URL =
  'https://archive-stream.granicus.com/OnDemand/_definst_/mp4:archive/milwaukee/milwaukee_adc29e9d-892b-4908-b1d6-7ae1f63bfd19.mp4/chunklist.m3u8';

test('archiveMp4Url maps a resolved HLS stream to the range-seekable archive MP4', () => {
  assert.equal(
    archiveMp4Url(STREAM_URL),
    'https://archive-video.granicus.com/milwaukee/milwaukee_adc29e9d-892b-4908-b1d6-7ae1f63bfd19.mp4',
  );
});

test('archiveMp4Url returns null for anything that is not a Granicus archive stream', () => {
  assert.equal(archiveMp4Url('https://example.com/video.m3u8'), null);
  assert.equal(archiveMp4Url(undefined), null);
});

test('buildClipArgs seeks the archive MP4 to [start, start+duration] with a browser UA', () => {
  const args = buildClipArgs({ mp4Url: 'https://cdn/x.mp4', startSeconds: 770, durationSeconds: 90, outPath: '/tmp/c.mp4' });
  const joined = args.join(' ');
  assert.match(joined, /-ss 770/);
  assert.match(joined, /-t 90/);
  assert.match(joined, /-i https:\/\/cdn\/x\.mp4/);
  assert.match(joined, /-user_agent Mozilla/); // Granicus 403s a bare ffmpeg
  assert.ok(joined.endsWith('/tmp/c.mp4 -y'), 'writes to the requested path');
});

test('a short item still gets a sane minimum clip length', () => {
  const args = buildClipArgs({ mp4Url: 'https://cdn/x.mp4', startSeconds: 100, durationSeconds: 2, outPath: '/tmp/c.mp4' });
  assert.match(args.join(' '), /-t 30/); // floored to 30s
});

test('clipVideoMoment resolves the archive URL, then range-fetches the window with ffmpeg', async () => {
  const calls = [];
  const out = await clipVideoMoment(
    { eventMedia: 5226, startSeconds: 1466, durationSeconds: 90, outPath: '/tmp/clip.mp4' },
    {
      run: async (cmd, args) => {
        calls.push({ cmd, args });
        return { stdout: `${STREAM_URL}\n` };
      },
    },
  );
  assert.equal(calls[0].cmd, 'yt-dlp'); // extractor only
  assert.match(calls[0].args.join(' '), /-g .*clip_id=5226/);
  assert.equal(calls[1].cmd, 'ffmpeg'); // ffmpeg does the ranged fetch
  assert.match(calls[1].args.join(' '), /-ss 1466/);
  assert.match(calls[1].args.join(' '), /archive-video\.granicus\.com/);
  assert.equal(out, '/tmp/clip.mp4');
});

test('clipVideoMoment fails loudly when the archive MP4 cannot be resolved', async () => {
  await assert.rejects(
    clipVideoMoment(
      { eventMedia: 99, startSeconds: 10, outPath: '/tmp/c.mp4' },
      { run: async () => ({ stdout: 'https://example.com/not-granicus.m3u8' }) },
    ),
    /could not resolve an archive MP4/,
  );
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
