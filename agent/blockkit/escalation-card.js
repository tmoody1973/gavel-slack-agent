const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-05-20" / "2026-05-20T..." → "May 20". Passthrough if unparseable. */
function shortDate(value) {
  if (!value) return '';
  const [, m, d] = String(value).slice(0, 10).split('-').map(Number);
  return Number.isFinite(m) && Number.isFinite(d) ? `${MONTHS[m - 1]} ${d}` : String(value);
}

const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });

const COPY = {
  en: {
    header: '🏛️ Headed to the full Council',
    body: (file, committee, date) =>
      `*File #${file}* cleared *${committee}*${date ? ` on ${shortDate(date)}` : ''} (recommended for adoption) ` +
      'and is now headed to the full *Common Council* for the final vote.',
    note: '_You were alerted about this item in committee — this is your heads-up before it’s decided._',
    link: 'View the file on Legistar',
  },
  es: {
    header: '🏛️ Rumbo al Concejo en pleno',
    body: (file, committee, date) =>
      `*File #${file}* fue aprobado por *${committee}*${date ? ` el ${shortDate(date)}` : ''} (recomendado para adopción) ` +
      'y ahora pasa al *Concejo Común* en pleno para la votación final.',
    note: '_Recibiste una alerta sobre este asunto en el comité — este es tu aviso antes de que se decida._',
    link: 'Ver el expediente en Legistar',
  },
};

/** One language's body: headline summary, the matter title, the heads-up note, optional link. */
function section(copy, { fileNumber, title, committee, recommendedDate, url }, label) {
  const blocks = [];
  if (label) blocks.push(mrkdwn(`*🇪🇸 ${label}*`));
  blocks.push(mrkdwn(copy.body(fileNumber, committee, recommendedDate)));
  if (title) blocks.push(mrkdwn(`_${title}_`));
  blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: copy.note }] });
  if (url) blocks.push({ type: 'context', elements: [{ type: 'mrkdwn', text: `🔗 <${url}|${copy.link}>` }] });
  return blocks;
}

/**
 * Escalation ping (MOO-52). A matter we alerted on in committee has cleared it
 * and is bound for the full Common Council. EN always; ES framing appended for
 * ES channels (file #/committee stay English, the MOO-43 rule). Pure.
 *
 * @param {{ fileNumber: string, title?: string, committee?: string, recommendedDate?: string, url?: string, language?: 'en'|'es' }} info
 * @returns {{ text: string, blocks: object[] }}
 */
export function escalationCard(info) {
  const { language = 'en' } = info;
  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: COPY.en.header, emoji: true } },
    ...section(COPY.en, info, null),
  ];
  if (language === 'es') {
    blocks.push({ type: 'divider' }, ...section(COPY.es, info, 'Rumbo al Concejo'));
  }
  const text = `File #${info.fileNumber} is headed to the full Common Council for the final vote.`;
  return { text, blocks };
}
