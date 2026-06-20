// Story Radar render (MOO-127). Two surfaces over the same lead shape:
//   storyLeadsSection — the App Home "📰 Story leads this week" strip (tags only, fast).
//   storyLeadCards    — the richer `/gavel stories` response (grounded angle + the
//                       reporting starting points already in Gavel).
//
// Both keep the project's leads-not-verdicts framing in the copy itself, render the
// newsworthiness tags so the ranking is explainable, and stay bilingual.

import { sponsorCard } from './sponsor-card.js';

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

const MAX_HOME_LEADS = 5;
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
  },
};

// Each tag → an explainable chip. Functions take the optional `detail` (district,
// walk-on vs consent, recurrence entity). Committee/proper names stay English (ES too).
const TAG_LABEL = {
  en: {
    money: () => '💰 Money',
    accountability: () => '🛡️ Power & accountability',
    equity: (d) => (d ? `👥 Equity · District ${d}` : '👥 Equity / displacement'),
    conflict: () => '⚔️ Conflict',
    novelty: () => '✨ First-of-its-kind',
    anomaly: (d) => (d === 'consent' ? '⚠️ Buried on consent' : '⚠️ Added late'),
    recurrence: (d) => `🔁 ${d ?? 'Repeat entity'}`,
  },
  es: {
    money: () => '💰 Dinero',
    accountability: () => '🛡️ Poder y rendición de cuentas',
    equity: (d) => (d ? `👥 Equidad · Distrito ${d}` : '👥 Equidad / desplazamiento'),
    conflict: () => '⚔️ Conflicto',
    novelty: () => '✨ Primero en su tipo',
    anomaly: (d) => (d === 'consent' ? '⚠️ Oculto en consentimiento' : '⚠️ Añadido tarde'),
    recurrence: (d) => `🔁 ${d ?? 'Entidad recurrente'}`,
  },
};

/** "💰 Money · 🛡️ Power & accountability · ⚠️ Added late" — the explainable why. */
function tagText(tags, language) {
  const labels = TAG_LABEL[language] ?? TAG_LABEL.en;
  return (tags ?? [])
    .map((tag) => labels[tag.kind]?.(tag.detail))
    .filter(Boolean)
    .join('  ·  ');
}

const storyWatchButton = (item, copy) => ({
  type: 'button',
  action_id: 'story_watch',
  text: { type: 'plain_text', text: copy.watch, emoji: true },
  value: String(item.title ?? '').slice(0, 1900),
});

/**
 * App Home reporter section. Tags + title only — no Claude call on the render path.
 * @param {Array<{item: object, tags: Array<object>}>} leads
 * @param {'en'|'es'} language
 * @returns {object[]} Block Kit blocks
 */
export function storyLeadsSection(leads, language = 'en') {
  const copy = COPY[language] ?? COPY.en;
  if (!leads || leads.length === 0) {
    return [mrkdwn(`${copy.heading}\n${copy.quiet}`), { type: 'divider' }];
  }

  const blocks = [mrkdwn(copy.heading), context(copy.leadIn)];
  for (const lead of leads.slice(0, MAX_HOME_LEADS)) {
    blocks.push({
      type: 'section',
      text: { type: 'mrkdwn', text: `*${lead.item.title}*` },
      accessory: storyWatchButton(lead.item, copy),
    });
    blocks.push(context(`🏛️ ${lead.item.eventBodyName ?? ''}  ·  ${tagText(lead.tags, language)}`));
  }
  blocks.push(context(copy.disclaimer));
  blocks.push({ type: 'divider' });
  return blocks;
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
