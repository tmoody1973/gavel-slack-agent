const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-06-12 00:00:00" / "2026-06-12T..." → "Jun 12". Passthrough if unparseable. */
function shortDate(value) {
  if (!value) return '';
  const [, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return Number.isFinite(m) && Number.isFinite(d) ? `${MONTHS[m - 1]} ${d}` : String(value);
}

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

/** One line per hit. Dynamic civic data (file #, address, type) stays English. */
function hitLine(hit) {
  if (hit.kind === 'matter') {
    const m = hit.matter;
    const head = [`File #${m.file}`, m.typeName, m.bodyName].filter(Boolean).join(' · ');
    return `👁 *${hit.entity}* — new matter · ${head}\n_${m.title}_`;
  }
  const p = hit.permit;
  const head = [p.type, p.status].filter(Boolean).join(' · ');
  return `👁 *${hit.entity}* — new permit · ${head}\nat *${p.address}*${p.date ? ` · opened ${shortDate(p.date)}` : ''}`;
}

const COPY = {
  en: {
    header: '👁 Watchlist hit',
    intro: (n) => `*${n}* new ${n === 1 ? 'filing matches' : 'filings match'} your watchlist:`,
  },
  es: {
    header: '👁 Coincidencia en tu lista',
    intro: (n) => `*${n}* ${n === 1 ? 'nuevo expediente coincide' : 'nuevos expedientes coinciden'} con tu lista:`,
  },
};

/**
 * The watch-sweep alert card (MOO-53). One channel's fresh hits (matters and/or
 * permits). EN framing always; when language === 'es' a divider + Spanish framing
 * is appended — file numbers / addresses / types stay English (the MOO-43 rule).
 * Pure.
 *
 * @param {{ hits: Array<{entity: string, kind: 'matter'|'permit', matter?: object, permit?: object}>, language?: 'en'|'es' }} input
 * @returns {{ text: string, blocks: object[] }}
 */
export function watchCard({ hits, language = 'en' }) {
  const lines = hits.map(hitLine).join('\n\n');
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: COPY.en.header, emoji: true } },
    mrkdwn(COPY.en.intro(hits.length)),
    mrkdwn(lines),
  ];
  if (language === 'es') {
    blocks.push({ type: 'divider' }, mrkdwn(`*🇪🇸 ${COPY.es.header}*`), mrkdwn(COPY.es.intro(hits.length)));
  }
  const text = `Watchlist: ${hits.length} new ${hits.length === 1 ? 'match' : 'matches'} for your watched entities.`;
  return { text, blocks };
}
