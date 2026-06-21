// The reporter dossier (MOO-129) — Story Radar v2. Tapping "📋 Brief me" on a story lead
// opens this: every reporting thread Gavel already indexes, assembled in one place — the
// plain-English angle, who sponsored it + their contact, the matter's history, the moment it
// was discussed on the public webcast (quote + ▶ timestamped video), and the vote outcome if
// one is on record. Pure builder over an already-assembled `dossier` (all fetching is done in
// the handler/orchestrator). Leads-not-verdicts: every element is the real record or an honest
// empty state — never a fabricated quote, vote, or link.

import { videoMomentDeepLink } from '../transcripts/video.js';
import { historyTimeline } from './history-timeline.js';
import { sponsorCard } from './sponsor-card.js';

const plain = (text) => ({ type: 'plain_text', text: String(text).slice(0, 150), emoji: true });
const section = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });
const divider = () => ({ type: 'divider' });

const SNIPPET_MAX = 600;

const COPY = {
  en: {
    title: '📋 Story brief',
    close: 'Close',
    angle: '💡 The angle',
    thinAngle: '_Thin record — here’s what’s on file; worth a closer look._',
    sponsor: '📞 Sponsor',
    noContact: (name) => `Sponsor: *${name}* — no contact on file.`,
    moment: '🎥 What was said on the webcast',
    noMoment: '_Not yet discussed on the public webcast (or not transcribed). Nothing to quote yet._',
    outcome: '🗳️ Outcome',
    noOutcome: '_No vote on record yet — this is still upcoming._',
    noHistory: '_No recorded actions yet._',
    watch: '👁 Watch',
    send: '📨 Send it to me',
    speaker: (s) => (s?.length ? `Speaker ${s.join(', ')}` : 'A speaker'),
    watchMoment: 'Watch',
    disclaimer: '_Leads, not verdicts — Gavel points you to the record, never asserts wrongdoing._',
    legistar: 'Open in Legistar',
  },
  es: {
    title: '📋 Resumen para prensa',
    close: 'Cerrar',
    angle: '💡 El ángulo',
    thinAngle: '_Registro breve — esto es lo que consta; vale la pena revisarlo._',
    sponsor: '📞 Patrocinador',
    noContact: (name) => `Patrocinador: *${name}* — sin contacto registrado.`,
    moment: '🎥 Qué se dijo en la transmisión',
    noMoment: '_Aún no se ha discutido en la transmisión pública (o no está transcrito)._',
    outcome: '🗳️ Resultado',
    noOutcome: '_Aún no hay votación registrada — esto es próximo._',
    noHistory: '_Sin acciones registradas todavía._',
    watch: '👁 Seguir',
    send: '📨 Envíamelo',
    speaker: (s) => (s?.length ? `Persona ${s.join(', ')}` : 'Una persona'),
    watchMoment: 'Ver',
    disclaimer: '_Pistas, no veredictos — Gavel te señala el registro, nunca afirma irregularidades._',
    legistar: 'Abrir en Legistar',
  },
};

/** Seconds → H:MM:SS for the moment label. */
function hms(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

function angleBlocks(angle, copy) {
  if (!angle?.hook) return [section(`*${copy.angle}*`), context(copy.thinAngle)];
  const why = angle.whyStory ? `\n💡 _${angle.whyStory}_` : '';
  return [section(`*${copy.angle}*\n${angle.hook}${why}`)];
}

function sponsorBlocks(dossier, copy) {
  if (dossier.member?.imageUrl) return [section(`*${copy.sponsor}*`), sponsorCard(dossier.member)];
  if (dossier.sponsorName) return [section(`*${copy.sponsor}*`), context(copy.noContact(dossier.sponsorName))];
  return [];
}

function historyBlocks(dossier, copy) {
  if (dossier.history?.length) return historyTimeline({ fileNumber: dossier.fileNumber, actions: dossier.history });
  return [section('*🕓 History*'), context(copy.noHistory)];
}

function momentBlocks(moment, copy) {
  if (!moment?.text) return [section(`*${copy.moment}*`), context(copy.noMoment)];
  const link = videoMomentDeepLink(moment.eventMedia, moment.startTime);
  const meta = [copy.speaker(moment.speakers), moment.eventDate, `@ ${hms(moment.startTime)}`]
    .filter(Boolean)
    .join(' · ');
  const quote = moment.text.trim().slice(0, SNIPPET_MAX);
  return [section(`*${copy.moment}*\n«${quote}»`), context(`🗣 ${meta} · ▶ <${link}|${copy.watchMoment}>`)];
}

function outcomeBlocks(outcome, copy) {
  if (!outcome?.actionName) return [section(`*${copy.outcome}*`), context(copy.noOutcome)];
  const bits = [
    outcome.passedFlag ? `*${outcome.passedFlag}*` : null,
    outcome.tally ? `🗳 ${outcome.tally}` : null,
    outcome.mover ? `moved by ${outcome.mover}` : null,
    outcome.eventDate ? outcome.eventDate.slice(0, 10) : null,
    outcome.minutesFile ? `<${outcome.minutesFile}|minutes>` : null,
  ].filter(Boolean);
  return [section(`*${copy.outcome}*\n${outcome.actionName}`), bits.length ? context(bits.join(' · ')) : null].filter(
    Boolean,
  );
}

/**
 * Build the reporter dossier modal from an already-assembled dossier.
 * @param {{
 *   item: {eventItemId:number, title?:string, eventBodyName?:string, eventDate?:string, agendaNumber?:string},
 *   fileNumber?: string,
 *   angle?: {hook:string, whyStory?:string}|null,
 *   member?: object|null, sponsorName?: string|null,
 *   history?: Array<object>, outcome?: object|null, moment?: object|null,
 *   event?: {inSiteUrl?:string}|null,
 * }} dossier
 * @param {{ language?: 'en'|'es' }} [opts]
 * @returns {object} a Block Kit modal view
 */
export function dossierModal(dossier, { language = 'en' } = {}) {
  const copy = COPY[language] ?? COPY.en;
  const item = dossier.item ?? {};
  const value = String(item.eventItemId ?? 0);

  const metaLine = [
    item.eventBodyName ? `🏛️ ${item.eventBodyName}` : null,
    item.eventDate ? `🗓 ${item.eventDate.slice(0, 10)}` : null,
    dossier.fileNumber ? `📄 File #${dossier.fileNumber}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const blocks = [
    section(`*${item.title ?? '(untitled item)'}*`),
    metaLine ? context(metaLine) : null,
    divider(),
    ...angleBlocks(dossier.angle, copy),
    ...sponsorBlocks(dossier, copy),
    divider(),
    ...historyBlocks(dossier, copy),
    ...momentBlocks(dossier.moment, copy),
    ...outcomeBlocks(dossier.outcome, copy),
    divider(),
    {
      type: 'actions',
      elements: [
        { type: 'button', action_id: 'dossier_watch', text: plain(copy.watch), value, style: 'primary' },
        { type: 'button', action_id: 'dossier_send', text: plain(copy.send), value },
      ],
    },
    context(
      [dossier.event?.inSiteUrl ? `<${dossier.event.inSiteUrl}|${copy.legistar}>` : null, copy.disclaimer]
        .filter(Boolean)
        .join('  ·  '),
    ),
  ].filter(Boolean);

  return {
    type: 'modal',
    callback_id: 'story_dossier_modal',
    private_metadata: JSON.stringify({ eventItemId: item.eventItemId ?? null, language }),
    title: plain(copy.title),
    close: plain(copy.close),
    blocks: blocks.slice(0, 100),
  };
}
