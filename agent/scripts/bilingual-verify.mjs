#!/usr/bin/env node
// MOO-43 verification: native bilingual generation against REAL Milwaukee matters.
//
//   node scripts/bilingual-verify.mjs
//
// Pulls real agenda items from this week's Final agendas, runs the real Claude
// bilingual summarizer on 3 of them, renders the EN-only and EN+ES cards from
// the same matter, and prints the 3 Spanish texts for native-speaker review.
import 'dotenv/config';

import { buildAlertCard } from '../alerts/card.js';
import { summarizeMatterBilingual } from '../summarizer/bilingual.js';
import { createClaudeGenerate } from '../summarizer/client.js';
import { BILINGUAL_OUTPUT_SCHEMA } from '../summarizer/prompt.js';

const BASE = 'https://webapi.legistar.com/v1/milwaukee';
const UA = { 'User-Agent': 'gavel-civic-agent/0.1 (bilingual-verify)' };
const SAMPLE_SIZE = 3;

async function getJson(path) {
  const res = await fetch(`${BASE}/${path}`, { headers: UA });
  if (!res.ok) throw new Error(`Legistar ${res.status} for ${path}`);
  return res.json();
}

const today = new Date().toISOString().slice(0, 10);
const events = await getJson(
  `events?$filter=EventDate ge datetime'${today}' and EventAgendaStatusName eq 'Final'&$orderby=EventDate&$top=5`,
);
if (events.length === 0) throw new Error('No upcoming Final events to sample.');

const sampled = [];
const seenFiles = new Set();
for (const event of events) {
  if (sampled.length >= SAMPLE_SIZE) break;
  const items = await getJson(`events/${event.EventId}/eventitems?AgendaNote=1&Attachments=1`);
  for (const item of items) {
    if (sampled.length >= SAMPLE_SIZE) break;
    const file = item.EventItemMatterFile;
    if (file && !seenFiles.has(file) && item.EventItemTitle && item.EventItemTitle.length > 40) {
      seenFiles.add(file);
      sampled.push({ event, item });
    }
  }
}
if (sampled.length < SAMPLE_SIZE) throw new Error(`Only found ${sampled.length} substantive items.`);

const generate = createClaudeGenerate({ schema: BILINGUAL_OUTPUT_SCHEMA });

let first = true;
for (const { event, item } of sampled) {
  const matter = {
    fileNumber: item.EventItemMatterFile,
    title: item.EventItemTitle,
    matterText: '',
    attachments: [],
  };
  const summary = await summarizeMatterBilingual(matter, { generate });

  console.log(`\n━━━ File #${matter.fileNumber} — ${event.EventBodyName} (${event.EventDate?.slice(0, 10)})`);
  console.log(`LEGAL TITLE (EN, source): ${matter.title.slice(0, 140)}`);
  console.log(`EN: ${summary.en.summary}`);
  console.log(`EN why: ${summary.en.whyItMatters}`);
  console.log(`ES: ${summary.es.summary}`);
  console.log(`ES why: ${summary.es.whyItMatters}`);

  if (first) {
    first = false;
    const row = { eventItemId: item.EventItemId, eventBodyName: event.EventBodyName, title: matter.title };
    const footer = { text: '🗣️ *How to be heard / Cómo participar*' };
    const base = { row, matter: { fileNumber: matter.fileNumber }, event: { inSiteUrl: undefined }, summary, footer };
    const enCard = buildAlertCard({ ...base, language: 'en' });
    const esCard = buildAlertCard({ ...base, language: 'es' });
    const enHasSpanish = JSON.stringify(enCard.blocks).includes('En español');
    const esHasSpanish = JSON.stringify(esCard.blocks).includes('En español');
    const fileUntranslated = [enCard, esCard].every((c) =>
      JSON.stringify(c.blocks).includes(`File #${matter.fileNumber}`),
    );
    console.log(`\nSAME-MATTER CARD CHECK: EN-only card has ES section? ${enHasSpanish} (want false)`);
    console.log(`SAME-MATTER CARD CHECK: ES card has ES section? ${esHasSpanish} (want true)`);
    console.log(`FILE NUMBER untranslated in both cards? ${fileUntranslated} (want true)`);
    console.log(`EN card blocks: ${enCard.blocks.length} · ES card blocks: ${esCard.blocks.length}`);
  }
}

console.log(`\n${SAMPLE_SIZE} real bilingual cards generated. Hand the ES texts above to a native speaker for the fluency review.`);
