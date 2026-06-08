#!/usr/bin/env node
// Calls >=3 tools against LIVE Legistar and prints real responses.
// Proves: get_upcoming_events, get_event_agenda, get_sponsors (alderperson + contact).
// If the upcoming agenda has no sponsor with contact, falls back to a recent known matter.
import { createLegistarClient } from '../src/legistar.js';

const UA = 'GavelCivicMCP/0.1 (+https://github.com/tmoody1973/gavel-slack-agent; contact tarik@radiomilwaukee.org)';
const client = createLegistarClient({ fetch, client: 'milwaukee', userAgent: UA });

// --- Tool 1: get_upcoming_events ---
const events = await client.fetchUpcomingFinalEvents();
console.log(`\n=== get_upcoming_events ===`);
console.log(`total: ${events.length} events`);
console.log('first event:', events[0] ?? '(none)');

// --- Tool 2: get_event_agenda (first event that exists) ---
let sponsorMatterId = null;

if (events[0]) {
  const items = await client.fetchEventItems(events[0].eventId);
  const withMatter = items.find((i) => i.eventItemId && i.matterId);
  console.log(`\n=== get_event_agenda(${events[0].eventId}) ===`);
  console.log(`total: ${items.length} items`);
  console.log('first item with matterId:', withMatter ?? '(none)');
  if (withMatter) sponsorMatterId = withMatter.matterId;
}

// --- Tool 3: get_sponsors + getPerson ---
// If upcoming agenda had a matter, try that first; otherwise fall back to a recent known matter.
const FALLBACK_MATTER_ID = 73181; // Common Council file — typically has sponsors on record

const resolvedMatterId = sponsorMatterId ?? FALLBACK_MATTER_ID;
console.log(`\n=== get_sponsors(matterId=${resolvedMatterId}) ===`);
const sponsors = await client.getMatterSponsors(resolvedMatterId);
console.log(`sponsor count: ${sponsors.length}`);

if (sponsors.length > 0) {
  const firstSponsor = sponsors[0];
  console.log('first sponsor (raw):', firstSponsor);
  const person = await client.getPerson(firstSponsor.personId);
  console.log('person contact:', person);
  console.log('\n--- VERIFICATION SUMMARY ---');
  console.log(`alderperson: ${person.name ?? firstSponsor.name}`);
  console.log(`email: ${person.email ?? '(not present)'}`);
  console.log(`phone: ${person.phone ?? '(not present)'}`);
} else {
  // No sponsors on that matter — search for one with a sponsor
  console.log('(no sponsors on that matter — searching recent matters for one with a sponsor)');
  const recent = await client.searchMatters({ query: 'aldermanic', top: 5 });
  for (const m of recent) {
    const sp = await client.getMatterSponsors(m.matterId);
    if (sp.length > 0) {
      const person = await client.getPerson(sp[0].personId);
      console.log(`\nFound sponsor via matter ${m.matterId} (${m.title}):`);
      console.log('sponsor:', sp[0]);
      console.log('person contact:', person);
      break;
    }
  }
}
