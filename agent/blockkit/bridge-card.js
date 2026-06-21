// The community-memory bridge proposal card (MOO-125). When Gavel detects that a channel has
// been discussing something that's now on an upcoming agenda, it posts this: "you've been
// talking about X — it's up for a vote; want alerts?" Pure builder, bilingual (EN section +
// divider + ES section), reusing the alert_watch action so 👁 Watch flows into the same
// add-watch handler the alert cards use.
//
// COMPLIANCE: this card NEVER quotes or embeds any Slack message — it names only the
// agenda-derived entity, committee, and date. The "searched live, never stored" note is the
// privacy promise made visible.

import { dateLabel } from './story-labels.js';

const COPY = {
  en: {
    header: '💬 You’ve been talking about this',
    body: (entity, committee, dateBit) =>
      `*${entity}* has come up in this channel — and it’s on the *${committee}* agenda${dateBit}.\nWant Gavel to alert this channel when it moves?`,
    privacy: '🔒 _I searched this channel’s history live to spot the match — your messages are never stored._',
    watch: '👁 Watch this',
    on: ' on ',
  },
  es: {
    header: '💬 Han estado hablando de esto',
    body: (entity, committee, dateBit) =>
      `*${entity}* se ha mencionado en este canal — y está en la agenda de *${committee}*${dateBit}.\n¿Quieren que Gavel avise a este canal cuando avance?`,
    privacy:
      '🔒 _Busqué el historial de este canal en vivo para detectar la coincidencia — sus mensajes nunca se guardan._',
    watch: '👁 Seguir',
    on: ' el ',
  },
};

const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

/**
 * Build the bilingual bridge proposal card. Pure — returns { text, blocks }.
 * @param {{ item: {eventItemId: number, title?: string, eventBodyName?: string, eventDate?: string}, entity: string, language?: 'en'|'es' }} match
 * @returns {{ text: string, blocks: object[] }}
 */
export function buildBridgeCard({ item, entity, language = 'en' }) {
  const value = String(item.eventItemId);
  const committee = item.eventBodyName ?? '';
  const en = COPY.en;
  const dateEn = dateLabel(item.eventDate, 'en');
  const dateBitEn = dateEn ? `${en.on}${dateEn.replace('🗓 ', '')}` : '';

  const blocks = [
    { type: 'header', text: { type: 'plain_text', text: en.header, emoji: true } },
    section(en.body(entity, committee, dateBitEn)),
    context(en.privacy),
  ];

  if (language === 'es') {
    const es = COPY.es;
    const dateEs = dateLabel(item.eventDate, 'es');
    const dateBitEs = dateEs ? `${es.on}${dateEs.replace('🗓 ', '')}` : '';
    blocks.push(
      { type: 'divider' },
      section(`*🇪🇸 En español*\n${es.body(entity, committee, dateBitEs)}`),
      context(es.privacy),
    );
  }

  const watchText = language === 'es' ? COPY.es.watch : COPY.en.watch;
  blocks.push({
    type: 'actions',
    elements: [
      {
        type: 'button',
        action_id: 'alert_watch',
        text: { type: 'plain_text', text: watchText, emoji: true },
        value,
        style: 'primary',
      },
    ],
  });

  const text = `You’ve been discussing ${entity} — it’s on the ${committee} agenda.`;
  return { text, blocks };
}
