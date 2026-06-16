// MOO-113 task D: ingest a real meeting's minutes / vote record — the structured
// "what was decided" layer. Legistar populates each item's outcome post-meeting
// (action / pass-flag / mover) plus the official minutes PDF on the event.
//
//   node scripts/minutes-ingest.mjs [eventId]
//   node scripts/minutes-ingest.mjs 13441
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { ConvexHttpClient } from 'convex/browser';

import { api } from '../convex/_generated/api.js';
import { buildMatterOutcomes } from '../transcripts/outcomes.js';

const LEGISTAR = 'https://webapi.legistar.com/v1/milwaukee';
const UA = { 'User-Agent': 'GavelCivicAgent/0.1 (tarik@radiomilwaukee.org)' };
const eventId = Number(process.argv[2] ?? 13441);

const convex = new ConvexHttpClient(process.env.CONVEX_URL);
const legistar = async (path) => (await fetch(LEGISTAR + path, { headers: UA })).json();

async function main() {
  console.log(`Ingesting minutes / vote record for EventId ${eventId}…`);
  const event = await legistar(`/events/${eventId}`);
  const items = await legistar(`/events/${eventId}/eventitems?$top=300`);
  const ctx = {
    eventId,
    eventDate: (event.EventDate ?? '').slice(0, 10),
    eventMinutesFile: event.EventMinutesFile ?? undefined,
  };
  console.log(
    `  committee: ${event.EventBodyName} · date ${ctx.eventDate} · minutes ${event.EventMinutesStatusName ?? 'none'}`,
  );

  const outcomes = buildMatterOutcomes(items, ctx);
  console.log(`  ${outcomes.length} of ${items.length} agenda items have a recorded action`);
  if (outcomes.length === 0) {
    console.log('  (nothing decided yet — minutes likely not final)');
    return;
  }

  const recordedAt = Date.now();
  await convex.mutation(api.outcomes.clearEvent, { eventId });
  const inserted = await convex.mutation(api.outcomes.insertOutcomes, { outcomes, recordedAt });
  const total = await convex.query(api.outcomes.countByEvent, { eventId });
  console.log(`✓ stored ${inserted} outcomes (table now holds ${total} for this event).`);
  for (const o of outcomes.slice(0, 3)) {
    console.log(
      `    • item ${o.agendaNumber ?? o.eventItemId} (file ${o.matterFile ?? '?'}): ${o.actionName} → ${o.passedFlag ?? '?'} (moved by ${o.mover ?? '?'})`,
    );
  }
}

main().catch((err) => {
  console.error('minutes-ingest FAILED:', err.message);
  process.exitCode = 1;
});
