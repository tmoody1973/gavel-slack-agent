// The "📬 From the city" digest card (MOO-153). One Block Kit card per channel that
// renders the aggregate (digest-card consumes aggregate.js + the batch briefing from
// digest-prompt.js): a calm headline, the bilingual briefing, the routine folded into
// counts, a few actionable highlights with the "How to be heard" footer the PRD
// protects, and a search affordance for everything that folded. Pure — returns
// { text, blocks }. Mirrors the per-email card's bilingual layout (EN, then an ES
// section when the channel's language is 'es').

const CATEGORY_DISPLAY = {
  neighborhood_services: { emoji: '🏗️', label: 'Permits & records' },
  licenses: { emoji: '📋', label: 'Licenses' },
  meetings: { emoji: '🏛️', label: 'Public meetings' },
  newsletter: { emoji: '📰', label: 'Newsletters' },
  other: { emoji: '⚖️', label: 'Other notices' },
};

// Highlight categories are time-boxed, so each gets a tailored "how to be heard" verb.
const HIGHLIGHT_META = {
  meetings: { emoji: '🏛️', heard: 'Attend or watch the live webcast — public comment is taken at the meeting.' },
  licenses: { emoji: '📋', heard: 'To support or object, contact the License Division before the hearing.' },
};

const ORDER = ['meetings', 'licenses', 'neighborhood_services', 'newsletter', 'other'];

/** "📋 3 licenses · 🏗️ 4 permit records · 🏛️ 2 meetings" — the one-line headline. */
function countsHeadline(categoryCounts) {
  return ORDER.filter((cat) => categoryCounts[cat])
    .map((cat) => {
      const meta = CATEGORY_DISPLAY[cat];
      return `${meta.emoji} ${categoryCounts[cat]} ${meta.label.toLowerCase()}`;
    })
    .join('  ·  ');
}

/** "13 Code Enforcement · 7 ROW Excavation · …" capped so the card stays scannable. */
function renderBreakdown(breakdown, max = 6) {
  const shown = breakdown.slice(0, max).map((b) => `${b.count} ${b.label}`);
  const remainder = breakdown.slice(max).reduce((sum, b) => sum + b.count, 0);
  if (remainder > 0) shown.push(`+${remainder} more`);
  return shown.join(' · ');
}

/** One highlight line: "🏛️ Zoning… Committee 6/16" / "📋 Class B Tavern License — COZUMEL III, LLC (District 12)". */
function highlightLine(highlight) {
  const meta = HIGHLIGHT_META[highlight.category] ?? { emoji: '•' };
  const who = highlight.business ? ` — ${highlight.business}` : '';
  const where = highlight.district ? ` _(District ${highlight.district})_` : '';
  const label = highlight.detailUrl ? `<${highlight.detailUrl}|${highlight.subject}>` : highlight.subject;
  return `${meta.emoji} ${label}${who}${where}`;
}

/**
 * Assemble the "From the city" digest card.
 *
 * @param {{
 *   aggregate: object,                       // aggregateCivicMail(...) result
 *   briefing: { en: {briefing: string, pattern: string}, es: {briefing: string, pattern: string} },
 *   language?: 'en' | 'es',
 *   snapshotNote?: string,                   // provenance disclosure (e.g. "sample week of 2026-06-10")
 * }} input
 * @returns {{ text: string, blocks: object[] }}
 */
export function buildFromTheCityCard({ aggregate, briefing, language = 'en', snapshotNote }) {
  const { categoryCounts, breakdowns, highlights } = aggregate;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: '📬 From the city — this week', emoji: true } },
    {
      type: 'context',
      elements: [
        { type: 'mrkdwn', text: countsHeadline(categoryCounts) || 'A quiet week — nothing new from the city.' },
      ],
    },
    { type: 'section', text: { type: 'mrkdwn', text: briefing.en.briefing } },
    { type: 'context', elements: [{ type: 'mrkdwn', text: `👀 *Worth noting:* ${briefing.en.pattern}` }] },
  ];

  const breakdownLines = [];
  if (breakdowns.neighborhood_services.length) {
    const meta = CATEGORY_DISPLAY.neighborhood_services;
    breakdownLines.push(`${meta.emoji} *${meta.label}:* ${renderBreakdown(breakdowns.neighborhood_services)}`);
  }
  if (breakdowns.licenses.length) {
    const meta = CATEGORY_DISPLAY.licenses;
    breakdownLines.push(`${meta.emoji} *${meta.label}:* ${renderBreakdown(breakdowns.licenses)}`);
  }
  if (breakdownLines.length) {
    blocks.push({ type: 'divider' }, { type: 'section', text: { type: 'mrkdwn', text: breakdownLines.join('\n') } });
  }

  if (highlights.length) {
    blocks.push(
      { type: 'divider' },
      {
        type: 'section',
        text: { type: 'mrkdwn', text: `*Worth a look this week*\n${highlights.map(highlightLine).join('\n')}` },
      },
    );
    const heard = HIGHLIGHT_META[highlights.find((h) => HIGHLIGHT_META[h.category])?.category]?.heard;
    if (heard) {
      blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `🗣️ *How to be heard:* ${heard}` }] });
    }
  }

  if (language === 'es') {
    blocks.push(
      { type: 'divider' },
      { type: 'section', text: { type: 'mrkdwn', text: `*🇪🇸 En español*\n${briefing.es.briefing}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `👀 *Vale la pena observar:* ${briefing.es.pattern}` }] },
    );
  }

  blocks.push(
    { type: 'divider' },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: '🔎 *See it all:* ask `/gavel search <address, owner, or record #>` to dig into any record.',
        },
      ],
    },
  );

  const provenance = snapshotNote
    ? `Public records via Milwaukee E-Notify · ${snapshotNote}`
    : 'Public records via Milwaukee E-Notify';
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: provenance }] });

  return { text: `📬 From the city — ${briefing.en.briefing}`, blocks };
}
