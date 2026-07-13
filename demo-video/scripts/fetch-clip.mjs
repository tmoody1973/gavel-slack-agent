// Produce captures/clip-source.mp4 (with audio) — the S5b full-bleed source.
// Cuts locally from the Granicus webcast (same tool that made the posted clip; Granicus
// only 403s our cloud host, not this machine). Slack files.list needs files:read, which
// the bot token doesn't have — so we re-cut instead of downloading.
// Run from agent/:  node ../demo-video/scripts/fetch-clip.mjs
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

config({ path: fileURLToPath(new URL('../../agent/.env.local', import.meta.url)) });
config({ path: fileURLToPath(new URL('../../agent/.env', import.meta.url)) });

const { clipVideoMoment } = await import('../../agent/transcripts/video.js');

// June 29 City Plan Commission, the "computational research facility" moment —
// same params as the clip posted in #general (gavel-clip-13556-1455.mp4).
const EVENT_ID = 13556;
const START_SECONDS = 1455;
const DURATION_SECONDS = 60;

const run = promisify(execFile);
const event = await (
  await fetch(`https://webapi.legistar.com/v1/milwaukee/events/${EVENT_ID}`, {
    headers: { 'User-Agent': 'GavelCivicAgent/0.1 (tarik@radiomilwaukee.org)' },
  })
).json();
const eventMedia = Number(event.EventMedia); // single-event endpoint returns a string
if (!Number.isFinite(eventMedia)) throw new Error('event has no numeric EventMedia');

const outPath = fileURLToPath(new URL('../captures/clip-source.mp4', import.meta.url));
await clipVideoMoment({ eventMedia, startSeconds: START_SECONDS, durationSeconds: DURATION_SECONDS, outPath }, { run });
console.log('cut →', outPath);
