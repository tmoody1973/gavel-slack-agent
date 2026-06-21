// MOO-143 demo asset: ingest a TIME-WINDOWED segment of a long meeting webcast, for
// items that sit deep in the agenda (e.g. a contested revocation held until the end).
// Same pipeline as transcript-ingest.mjs but downloads [startSeconds, endSeconds] and
// offsets every utterance timestamp back to ABSOLUTE webcast seconds — so video-index
// bucketing and the ▶ deep links stay correct.
//
//   node scripts/transcript-ingest-segment.mjs <eventId> <startSeconds> <endSeconds>
//   node scripts/transcript-ingest-segment.mjs 13632 15800 16403
import { execFile } from 'node:child_process';
import { readFileSync, rmSync } from 'node:fs';
import { promisify } from 'node:util';

import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api.js';
import { createClaudeGenerate } from '../summarizer/client.js';
import { buildTranscriptChunks } from '../transcripts/chunk.js';
import { transcribeAudio } from '../transcripts/deepgram.js';
import { buildSpeakerMapEntries, SPEAKER_MAP_SCHEMA } from '../transcripts/speakers.js';
import { granicusMediaUrl } from '../transcripts/video.js';
import { embedTexts } from '../zoning/embed.js';

const run = promisify(execFile);
const LEGISTAR = 'https://webapi.legistar.com/v1/milwaukee';
const UA = { 'User-Agent': 'GavelCivicAgent/0.1 (tarik@radiomilwaukee.org)' };

const eventId = Number(process.argv[2]);
const startSeconds = Number(process.argv[3]);
const endSeconds = Number(process.argv[4]);
if (![eventId, startSeconds, endSeconds].every(Number.isFinite) || endSeconds <= startSeconds) {
  console.error('Usage: node scripts/transcript-ingest-segment.mjs <eventId> <startSeconds> <endSeconds>');
  process.exit(1);
}

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = async (path) => (await fetch(LEGISTAR + path, { headers: UA })).json();

async function main() {
  console.log(`Ingesting EventId ${eventId} segment [${startSeconds}s–${endSeconds}s]…`);
  const event = await legistar(`/events/${eventId}`);
  const items = await legistar(`/events/${eventId}/eventitems?$top=300`);
  const eventMedia = Number(event.EventMedia);
  const eventDate = (event.EventDate ?? '').slice(0, 10);
  const eventBodyName = event.EventBodyName;
  if (!Number.isFinite(eventMedia)) throw new Error('event has no numeric EventMedia (no published video)');

  // Keep ALL boundaries: utterances carry absolute timestamps after the offset below,
  // so itemForTime buckets each into the agenda item whose window contains it.
  const boundaries = items
    .filter((i) => i.EventItemVideoIndex != null)
    .map((i) => ({
      eventItemId: i.EventItemId,
      agendaNumber: i.EventItemAgendaNumber ?? undefined,
      matterId: i.EventItemMatterId ?? undefined,
      videoIndex: i.EventItemVideoIndex,
    }))
    .sort((a, b) => a.videoIndex - b.videoIndex);
  const inWindow = boundaries.filter((b) => b.videoIndex >= startSeconds && b.videoIndex <= endSeconds);
  console.log(
    `  committee ${eventBodyName} · ${eventDate} · clip ${eventMedia} · ${inWindow.length} agenda items begin in this window`,
  );

  console.log('  downloading audio segment…');
  rmSync('/tmp/t_seg.mp4', { force: true });
  rmSync('/tmp/t_seg.wav', { force: true });
  await run('yt-dlp', [
    '--no-warnings',
    '--quiet',
    '--download-sections',
    `*${startSeconds}-${endSeconds}`,
    '-o',
    '/tmp/t_seg.mp4',
    granicusMediaUrl(eventMedia),
  ]);
  await run('ffmpeg', ['-nostdin', '-loglevel', 'error', '-i', '/tmp/t_seg.mp4', '-vn', '-ac', '1', '-ar', '16000', '/tmp/t_seg.wav', '-y']);

  console.log('  transcribing (Deepgram Nova-3, diarized)…');
  const raw = await transcribeAudio(readFileSync('/tmp/t_seg.wav'), { apiKey: process.env.DEEPGRAM_API_KEY });
  // Restore absolute webcast time: the clip starts at startSeconds.
  const utterances = raw.map((u) => ({ ...u, start: u.start + startSeconds, end: u.end + startSeconds }));
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

  console.log('  mapping speakers → council members…');
  const councilMembers = await convex.query(api.councilMembers.listMembers, {});
  const generate = createClaudeGenerate({ schema: SPEAKER_MAP_SCHEMA });
  const entries = await buildSpeakerMapEntries({ utterances, councilMembers, committee: eventBodyName, eventDate }, { generate });
  await convex.mutation(api.speakerMaps.upsertByEvent, { eventId, eventBodyName, entries });
  console.log(`✓ speaker map: ${entries.filter((e) => e.name).length}/${entries.length} labels named.`);
}

main().catch((err) => {
  console.error('segment-ingest FAILED:', err.message);
  process.exitCode = 1;
});
