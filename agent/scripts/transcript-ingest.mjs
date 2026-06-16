// MOO-113 ingest: a real Milwaukee committee webcast → diarized transcript →
// per-agenda-item chunks → transcripts vector namespace. Bounded window keeps the
// verify fast/cheap; production runs the whole meeting with the same code.
//
//   node scripts/transcript-ingest.mjs [eventId] [windowSeconds]
//   node scripts/transcript-ingest.mjs 13441 1200
import { execFile } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { promisify } from 'node:util';

import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api.js';
import { buildTranscriptChunks } from '../transcripts/chunk.js';
import { transcribeAudio } from '../transcripts/deepgram.js';
import { granicusMediaUrl } from '../transcripts/video.js';
import { embedTexts } from '../zoning/embed.js';

const run = promisify(execFile);
const LEGISTAR = 'https://webapi.legistar.com/v1/milwaukee';
const UA = { 'User-Agent': 'GavelCivicAgent/0.1 (tarik@radiomilwaukee.org)' };
const eventId = Number(process.argv[2] ?? 13441);
const windowSeconds = Number(process.argv[3] ?? 1200);

const convex = new ConvexHttpClient(process.env.CONVEX_URL);

const legistar = async (path) => (await fetch(LEGISTAR + path, { headers: UA })).json();

async function main() {
  console.log(`Ingesting transcript for EventId ${eventId} (first ${windowSeconds}s)…`);
  const event = await legistar(`/events/${eventId}`);
  const items = await legistar(`/events/${eventId}/eventitems?$top=300`);
  const eventMedia = Number(event.EventMedia); // API may return it as a string
  const eventDate = (event.EventDate ?? '').slice(0, 10);
  const eventBodyName = event.EventBodyName;
  if (!Number.isFinite(eventMedia)) throw new Error('event has no numeric EventMedia (no published video)');

  const boundaries = items
    .filter((i) => i.EventItemVideoIndex != null)
    .map((i) => ({
      eventItemId: i.EventItemId,
      agendaNumber: i.EventItemAgendaNumber ?? undefined,
      matterId: i.EventItemMatterId ?? undefined,
      videoIndex: i.EventItemVideoIndex,
    }))
    .sort((a, b) => a.videoIndex - b.videoIndex);
  console.log(
    `  committee: ${eventBodyName} · date ${eventDate} · clip ${eventMedia} · ${boundaries.length} items with video index`,
  );

  console.log('  downloading audio window…');
  rmSync('/tmp/t_ingest.mp4', { force: true });
  rmSync('/tmp/t_ingest.wav', { force: true });
  await run('yt-dlp', [
    '--no-warnings',
    '--quiet',
    '--download-sections',
    `*0-${windowSeconds}`,
    '-o',
    '/tmp/t_ingest.mp4',
    granicusMediaUrl(eventMedia),
  ]);
  await run('ffmpeg', [
    '-nostdin',
    '-loglevel',
    'error',
    '-i',
    '/tmp/t_ingest.mp4',
    '-vn',
    '-ac',
    '1',
    '-ar',
    '16000',
    '/tmp/t_ingest.wav',
    '-y',
  ]);

  console.log('  transcribing (Deepgram Nova-3, diarized)…');
  const utterances = await transcribeAudio(readFileSync('/tmp/t_ingest.wav'), { apiKey: process.env.DEEPGRAM_API_KEY });
  console.log(`  ${utterances.length} utterances`);

  const chunks = buildTranscriptChunks(utterances, boundaries, { eventId, eventDate });
  console.log(`  ${chunks.length} chunks across ${new Set(chunks.map((c) => c.eventItemId)).size} agenda items`);

  console.log('  embedding…');
  const vectors = await embedTexts(
    chunks.map((c) => c.text),
    { apiKey: process.env.OPENAI_API_KEY },
  );

  const rows = chunks.map((c, i) => ({ ...c, eventBodyName, eventMedia, embedding: vectors[i] }));
  await convex.mutation(api.transcripts.clearEvent, { eventId });
  const inserted = await convex.mutation(api.transcripts.insertChunks, { chunks: rows });
  const total = await convex.query(api.transcripts.countByEvent, { eventId });
  console.log(`✓ stored ${inserted} chunks (table now holds ${total} for this event).`);
}

main().catch((err) => {
  console.error('transcript-ingest FAILED:', err.message);
  process.exitCode = 1;
});
