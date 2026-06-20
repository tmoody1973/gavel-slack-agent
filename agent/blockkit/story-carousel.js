// `/gavel stories` carousel (MOO-130). The slash response is a swipeable carousel of
// story cards — the "review these N one at a time" surface, where the grounded angle
// (composeLeadAngles) is the card body. Carousels are message-only and were confirmed to
// render on the deployed app (feasibility spike); runStories falls back to the classic
// storyLeadCards list if Slack ever rejects the block.
//
// Slack card limits: title ≤150, subtitle ≤150, body ≤200, ≤3 action buttons; carousel
// holds ≤10 cards.

import { dateLabel, tagText } from './story-labels.js';

const TITLE_MAX = 150;
const SUBTITLE_MAX = 150;
const BODY_MAX = 200;
const MAX_CARDS = 10;

const clamp = (text, max) => String(text ?? '').slice(0, max);
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

const COPY = {
  en: {
    headerPrefix: '📰 Story leads',
    leadIn: 'Potential stories on the upcoming agenda — swipe through, ranked by why they matter.',
    quiet: 'No story leads jumped out — quiet week on the upcoming agenda.',
    watch: '👁 Watch',
    ask: '💬 Ask Gavel',
    disclaimer: '_Leads, not conclusions — Gavel points you to what’s worth a look and the public record behind it._',
  },
  es: {
    headerPrefix: '📰 Pistas de reportaje',
    leadIn: 'Posibles reportajes en la próxima agenda — desliza, ordenados por relevancia.',
    quiet: 'No surgieron pistas — semana tranquila en la próxima agenda.',
    watch: '👁 Seguir',
    ask: '💬 Pregúntale a Gavel',
    disclaimer: '_Pistas, no conclusiones — Gavel te señala lo que vale la pena revisar y el registro público detrás._',
  },
};

/** "🏛️ COMMON COUNCIL  ·  🗓 Tue Jun 23" — the card subtitle. */
function subtitle(lead, language) {
  return clamp(
    [lead.item?.eventBodyName ? `🏛️ ${lead.item.eventBodyName}` : null, dateLabel(lead.item?.eventDate, language)]
      .filter(Boolean)
      .join('  ·  '),
    SUBTITLE_MAX,
  );
}

/** The grounded angle as the card body, degrading to the explainable tags, never blank. */
function body(lead, language) {
  if (lead.angle?.hook) {
    return clamp(`${lead.angle.hook} ${lead.angle.whyStory ?? ''}`.trim(), BODY_MAX);
  }
  const tags = tagText(lead.tags, language);
  return clamp(tags || lead.item?.title || '', BODY_MAX);
}

/** One card for a lead: title / committee·date / angle / Watch + Ask Gavel. */
function storyCard(lead, copy, language) {
  const title = clamp(lead.item?.title ?? '', TITLE_MAX);
  return {
    type: 'card',
    title: { type: 'mrkdwn', text: title },
    subtitle: { type: 'mrkdwn', text: subtitle(lead, language) },
    body: { type: 'mrkdwn', text: body(lead, language) },
    actions: [
      {
        type: 'button',
        action_id: 'story_watch',
        text: { type: 'plain_text', text: copy.watch, emoji: true },
        value: String(lead.item?.title ?? '').slice(0, 1900),
      },
      {
        type: 'button',
        action_id: 'story_ask',
        text: { type: 'plain_text', text: copy.ask, emoji: true },
        value: String(lead.item?.eventItemId ?? 0),
      },
    ],
  };
}

/**
 * `/gavel stories` response: a header + a swipeable carousel of story cards + the safety
 * line. Empty leads degrade to a friendly line (no carousel block).
 * @param {Array<object>} leads - enriched via composeLeadAngles
 * @param {{ label: string, language?: 'en'|'es' }} opts
 * @returns {object[]} Block Kit blocks
 */
export function storyCarousel(leads = [], { label, language = 'en' } = {}) {
  const copy = COPY[language] ?? COPY.en;
  const header = {
    type: 'header',
    text: { type: 'plain_text', text: `${copy.headerPrefix} — ${label}`, emoji: true },
  };

  if (!leads || leads.length === 0) {
    return [header, context(copy.quiet)];
  }

  const cards = leads.slice(0, MAX_CARDS).map((lead) => storyCard(lead, copy, language));
  return [header, context(copy.leadIn), { type: 'carousel', elements: cards }, context(copy.disclaimer)];
}
