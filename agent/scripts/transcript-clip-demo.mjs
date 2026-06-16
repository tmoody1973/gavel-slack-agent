// MOO-113 task C (tier 2): clip a real committee-debate moment from the Granicus
// webcast and drop it INLINE in Slack so it plays in the channel. The hero demo
// beat — "what did the committee say about the Hopkins Street sale?" → a clip.
//
//   DEMO_CHANNEL_ID=C0XXXX node scripts/transcript-clip-demo.mjs [eventId] [startSeconds] [durationSeconds]
//   DEMO_CHANNEL_ID=C0B8KS5VCCC node scripts/transcript-clip-demo.mjs 13441 787 90
import { execFile } from 'node:child_process';
import { rmSync } from 'node:fs';
import { promisify } from 'node:util';

import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { WebClient } from '@slack/web-api';

import { clipVideoMoment, uploadClipToSlack, videoMomentDeepLink } from '../transcripts/video.js';

const LEGISTAR = 'https://webapi.legistar.com/v1/milwaukee';
const UA = { 'User-Agent': 'GavelCivicAgent/0.1 (tarik@radiomilwaukee.org)' };

const channel = process.env.DEMO_CHANNEL_ID;
if (!channel) {
  console.error('Set DEMO_CHANNEL_ID (a channel the Gavel bot is in).');
  process.exit(1);
}

const eventId = Number(process.argv[2] ?? 13441);
const startSeconds = Number(process.argv[3] ?? 787); // the Hopkins St repurchase moment
const durationSeconds = Number(process.argv[4] ?? 90);
const outPath = `/tmp/gavel-clip-${eventId}-${startSeconds}.mp4`;

const run = promisify(execFile);
const slack = new WebClient(process.env.SLACK_BOT_TOKEN || process.env.SLACK_USER_TOKEN);
const legistar = async (path) => (await fetch(LEGISTAR + path, { headers: UA })).json();

async function main() {
  const event = await legistar(`/events/${eventId}`);
  const eventMedia = Number(event.EventMedia); // single-event endpoint returns a string
  if (!Number.isFinite(eventMedia)) throw new Error('event has no numeric EventMedia (no published video)');
  const deepLink = videoMomentDeepLink(eventMedia, startSeconds);
  console.log(`Clip: clip ${eventMedia} @ ${startSeconds}s for ${durationSeconds}s`);
  console.log(`Source moment: ${deepLink}`);

  rmSync(outPath, { force: true });
  console.log('  downloading the section (yt-dlp handles Granicus auth)…');
  await clipVideoMoment({ eventMedia, startSeconds, durationSeconds, outPath }, { run });

  console.log('  uploading to Slack (files.uploadV2)…');
  const res = await uploadClipToSlack(slack, {
    channel,
    filePath: outPath,
    title: `${event.EventBodyName} — moment at ${new Date(startSeconds * 1000).toISOString().slice(11, 19)}`,
    initialComment: `▶ The exact moment from the webcast. Full video: ${deepLink}`,
  });

  const fileId = res?.files?.[0]?.id ?? res?.file?.id ?? '(see channel)';
  console.log(`\n✓ Uploaded clip ${fileId} to ${channel}. Open Slack (desktop + mobile) to confirm it plays inline.`);
}

main().catch((err) => {
  console.error('transcript-clip-demo FAILED:', err.message);
  process.exitCode = 1;
});
