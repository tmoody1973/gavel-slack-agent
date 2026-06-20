// Story Radar render (MOO-127). Two surfaces over the same lead shape:
//   storyLeadsSection — the App Home "📰 Story leads this week" strip (tags only, fast).
//   storyLeadCards    — the richer `/gavel stories` response (grounded angle + the
//                       reporting starting points already in Gavel).
//
// Both keep the project's leads-not-verdicts framing in the copy itself, render the
// newsworthiness tags so the ranking is explainable, and stay bilingual.

import { clusterLeads } from '../stories/cluster.js';
import { metaLine, tagText, themeLabel } from './story-labels.js';
import { sponsorCard } from './sponsor-card.js';

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

// Slack caps a message at 50 blocks. Each slash card is ≤6 blocks + a divider, so 6
// leads (~45 blocks) is the safe ceiling — cap defensively so a future STORY_LEAD_CAP
// bump can't silently truncate the response.
const MAX_SLASH_LEADS = 6;

const COPY = {
  en: {
    heading: '*📰 Story leads this week*',
    leadIn: 'Potential stories on the upcoming agenda — worth a look, ranked by why they matter.',
    quiet: 'Quiet week — nothing on the upcoming agenda is jumping out as a story yet.',
    disclaimer: '_Leads, not conclusions — Gavel points you to what’s worth a look and the public record behind it._',
    watch: '👁 Watch',
    sponsor: 'Sponsor',
    startingPoints: 'Reporting starting points',
    file: 'File',
    transcript: '🎙 Ask Gavel to *search transcripts* for past discussion of this',
    headerPrefix: '📰 Story leads',
    items: 'items',
    item: 'item',
    more: (n) => `➕ ${n} more — \`/gavel stories\` to see them all`,
    browse: '📋 Browse story leads',
  },
  es: {
    heading: '*📰 Pistas de reportaje esta semana*',
    leadIn: 'Posibles reportajes en la próxima agenda — vale la pena revisarlos, ordenados por relevancia.',
    quiet: 'Semana tranquila — nada en la próxima agenda destaca como reportaje todavía.',
    disclaimer: '_Pistas, no conclusiones — Gavel te señala lo que vale la pena revisar y el registro público detrás._',
    watch: '👁 Seguir',
    sponsor: 'Patrocinador',
    startingPoints: 'Puntos de partida para el reportaje',
    file: 'Expediente',
    transcript: '🎙 Pídele a Gavel que *busque en las transcripciones* discusiones previas sobre esto',
    headerPrefix: '📰 Pistas de reportaje',
    items: 'puntos',
    item: 'punto',
    more: (n) => `➕ ${n} más — \`/gavel stories\` para verlas todas`,
    browse: '📋 Explorar pistas',
  },
};

// Lean-triage cap (MOO-130): the App Home shows compact one-liners; the full,
// filterable set lives behind the 📋 Browse modal, so the Home never needs more than
// a handful of rows. Keeps us far under Slack's 100-block home ceiling.
const MAX_HOME_ENTRIES = 8;

const storyWatchButton = (item, copy) => ({
  type: 'button',
  action_id: 'story_watch',
  text: { type: 'plain_text', text: copy.watch, emoji: true },
  value: String(item.title ?? '').slice(0, 1900),
});

/** Earliest meeting date across a cluster's members (the soonest thing to cover). */
function clusterDate(cluster) {
  return cluster.members
    .map((member) => member.item?.eventDate)
    .filter(Boolean)
    .sort()[0];
}

/**
 * App Home reporter section, MOO-130 lean triage: ONE compact line per cluster/single
 * (subject beat + count or title, plus the committee · district · date · why meta line),
 * then a single 📋 Browse story leads button into the filterable modal. No per-item
 * watches, no inline cluster members — that richness lives in the modal. LLM-free.
 * @param {Array<object>} leads - ranked story leads (from state.storyLeads)
 * @param {'en'|'es'} language
 * @returns {object[]} Block Kit blocks
 */
export function storyLeadsSection(leads, language = 'en') {
  const copy = COPY[language] ?? COPY.en;
  if (!leads || leads.length === 0) {
    return [mrkdwn(`${copy.heading}\n${copy.quiet}`), { type: 'divider' }];
  }

  const entries = clusterLeads(leads);
  const blocks = [mrkdwn(copy.heading), context(copy.leadIn)];
  for (const entry of entries.slice(0, MAX_HOME_ENTRIES)) {
    blocks.push(entry.kind === 'cluster' ? clusterLine(entry, copy, language) : singleLine(entry, language));
    blocks.push(context(entryMeta(entry, language)));
  }
  blocks.push(browseActions(copy));
  blocks.push(context(copy.disclaimer));
  blocks.push({ type: 'divider' });
  return blocks;
}

/** The compact headline block for one entry. */
function clusterLine(cluster, copy, language) {
  const count = `${cluster.members.length} ${cluster.members.length === 1 ? copy.item : copy.items}`;
  return mrkdwn(`*${themeLabel(cluster.theme, language)}* — ${count}`);
}

function singleLine(lead, _language) {
  return mrkdwn(`*${lead.item.title}*`);
}

/** "🏛️ {committee} · 📍 District N · 🗓 Tue Jun 23 · {tags}" for either entry kind. */
function entryMeta(entry, language) {
  return entry.kind === 'cluster'
    ? metaLine(
        { committee: entry.committee, district: entry.district, date: clusterDate(entry), tags: entry.tags },
        language,
      )
    : metaLine(
        { committee: entry.item.eventBodyName, district: entry.district, date: entry.item.eventDate, tags: entry.tags },
        language,
      );
}

/** The single 📋 Browse story leads button → the filterable modal (story_browse). */
function browseActions(copy) {
  return {
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: 'story_browse',
        text: { type: 'plain_text', text: copy.browse, emoji: true },
        style: 'primary',
      },
    ],
  };
}

/**
 * `/gavel stories` response: a header + one card per lead (grounded angle, tags,
 * sponsor contact, reporting starting points, watch), then the safety line.
 * @param {Array<object>} leads - enriched via composeLeadAngles
 * @param {{ label: string, language: 'en'|'es' }} opts
 * @returns {object[]} Block Kit blocks
 */
export function storyLeadCards(leads, { label, language = 'en' } = {}) {
  const copy = COPY[language] ?? COPY.en;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: `${copy.headerPrefix} — ${label}`, emoji: true } },
    context(copy.leadIn),
    { type: 'divider' },
  ];
  for (const lead of leads.slice(0, MAX_SLASH_LEADS)) {
    blocks.push(...storyLeadCard(lead, copy, language));
    blocks.push({ type: 'divider' });
  }
  blocks.push(context(copy.disclaimer));
  return blocks;
}

/** One lead's blocks for the slash response. */
function storyLeadCard(lead, copy, language) {
  const out = [
    {
      type: 'section',
      text: { type: 'mrkdwn', text: `*${lead.item.title}*` },
      accessory: storyWatchButton(lead.item, copy),
    },
    context(`🏛️ ${lead.item.eventBodyName ?? ''}  ·  ${tagText(lead.tags, language)}`),
  ];

  if (lead.angle) out.push(mrkdwn(`💡 *${lead.angle.hook}*\n${lead.angle.whyStory}`));

  // Reporting starting points already in Gavel: sponsor + contact (MOO-72), the file
  // number to pull in Legistar (MOO-52 history lives there), and a transcript hint.
  if (lead.member) out.push(sponsorCard(lead.member));

  const starts = [`*${copy.startingPoints}:*`];
  if (lead.fileNumber) starts.push(`🗂️ ${copy.file} #${lead.fileNumber}`);
  if (lead.hasTranscript) starts.push(copy.transcript);
  if (starts.length > 1) out.push(context(starts.join('  ·  ')));

  return out;
}
