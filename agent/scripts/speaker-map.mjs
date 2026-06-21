// MOO-143 re-map: name the diarized speakers of an ALREADY-INGESTED meeting from the
// public council roster — no re-transcription. Reconstructs an attributable utterance
// stream from the stored transcriptChunks, asks Claude to map labels → members behind a
// hard confidence gate, persists the map, and prints it for the verification eyeball.
//
//   node scripts/speaker-map.mjs <eventId>
//   node scripts/speaker-map.mjs 13441
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { ConvexHttpClient } from 'convex/browser';
import { api } from '../convex/_generated/api.js';
import { createClaudeGenerate } from '../summarizer/client.js';
import {
  buildSpeakerMapEntries,
  reconstructUtterancesFromChunks,
  SPEAKER_MAP_SCHEMA,
} from '../transcripts/speakers.js';

const eventId = Number(process.argv[2] ?? 13441);
const convex = new ConvexHttpClient(process.env.CONVEX_URL);

async function main() {
  console.log(`Re-mapping speakers for EventId ${eventId} (from stored chunks, no re-transcription)…`);
  const chunks = await convex.query(api.transcripts.listByEvent, { eventId });
  if (chunks.length === 0) throw new Error(`no transcript chunks for event ${eventId} — ingest it first`);

  const eventBodyName = chunks.find((c) => c.eventBodyName)?.eventBodyName;
  const eventDate = chunks.find((c) => c.eventDate)?.eventDate;
  const utterances = reconstructUtterancesFromChunks(chunks);
  const speakerLabels = [...new Set(chunks.flatMap((c) => c.speakers))].sort((a, b) => a - b);
  console.log(
    `  ${chunks.length} chunks · committee ${eventBodyName} · date ${eventDate} · ` +
      `${speakerLabels.length} diarized labels [${speakerLabels.join(', ')}] · ${utterances.length} attributable utterances`,
  );

  const councilMembers = await convex.query(api.councilMembers.listMembers, {});
  console.log(`  roster: ${councilMembers.length} council members`);

  const generate = createClaudeGenerate({ schema: SPEAKER_MAP_SCHEMA });
  const entries = await buildSpeakerMapEntries(
    { utterances, councilMembers, committee: eventBodyName, eventDate },
    { generate },
  );

  await convex.mutation(api.speakerMaps.upsertByEvent, { eventId, eventBodyName, entries });

  console.log('\n  speaker map (gated — names only when confident AND in roster):');
  for (const e of entries.sort((a, b) => a.speaker - b.speaker)) {
    const who = e.name ? `${e.title ?? ''} ${e.name}`.trim() : `(${e.role})`;
    console.log(`    Speaker ${e.speaker} → ${who}  [conf ${e.confidence}]`);
  }
  const named = entries.filter((e) => e.name).length;
  console.log(`\n✓ persisted speakerMaps for event ${eventId}: ${named}/${entries.length} labels named.`);
}

main().catch((err) => {
  console.error('speaker-map FAILED:', err.message);
  process.exitCode = 1;
});
