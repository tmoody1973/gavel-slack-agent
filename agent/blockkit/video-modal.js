// Meeting-video discovery (MOO-142). Reporters can't *find* what footage exists —
// MOO-113's search is query-only and goes silent on un-transcribed meetings. This is
// the library: a browse modal whose committee dropdown is built ONLY from committees
// that actually have recent video, so a journalist who doesn't know the term picks from
// what's there. Clones MOO-130's story-modal: pure builder, classic Block Kit, ≤100
// blocks, stateless filter re-rendered via views.update. The ▶ link is a Granicus webcast
// URL; the 🔍/🎥 tag says whether Gavel can already search what was said.

import { granicusMediaUrl } from '../transcripts/video.js';
import { dateLabel } from './story-labels.js';

const plain = (text) => ({ type: 'plain_text', text: String(text).slice(0, 75), emoji: true });
const mrkdwn = (text) => ({ type: 'section', text: { type: 'mrkdwn', text } });
const context = (text) => ({ type: 'context', elements: [{ type: 'mrkdwn', text }] });

// Slack caps a modal at 100 blocks; one block per meeting plus the filter/lead/divider
// chrome keeps the realistic ~30-meeting look-back window comfortably under the cap.
const MAX_MODAL_MEETINGS = 50;
const MAX_HOME_PREVIEW = 5;
// static_select option `value` caps at 75 chars; `c::` + a Milwaukee committee name fits.
const VALUE_MAX = 75;

const COPY = {
  en: {
    title: '🎥 Meeting video',
    close: 'Close',
    leadIn: 'Recent Milwaukee meetings with published video. Pick a committee to narrow it down.',
    allCommittees: 'All committees',
    filterLabel: 'Committee',
    searchable: '🔍 Searchable',
    videoOnly: '🎥 Video only',
    watch: '▶ Watch on Granicus',
    empty: 'No meeting video in the last 30 days.',
    legend: '🔍 = Gavel can search what was said · 🎥 = video only (not yet transcribed)',
    homeHeading: '*🎥 Meeting video*',
    homeLeadIn: 'Recent meetings you can watch — and search.',
    browse: '📋 Browse videos',
  },
  es: {
    title: '🎥 Video de reuniones',
    close: 'Cerrar',
    leadIn: 'Reuniones recientes de Milwaukee con video publicado. Elige un comité para filtrar.',
    allCommittees: 'Todos los comités',
    filterLabel: 'Comité',
    searchable: '🔍 Con búsqueda',
    videoOnly: '🎥 Solo video',
    watch: '▶ Ver en Granicus',
    empty: 'No hay video de reuniones en los últimos 30 días.',
    legend: '🔍 = Gavel puede buscar lo que se dijo · 🎥 = solo video (aún sin transcribir)',
    homeHeading: '*🎥 Video de reuniones*',
    homeLeadIn: 'Reuniones recientes que puedes ver — y buscar.',
    browse: '📋 Ver videos',
  },
};

/**
 * Join meetings against the set of eventIds Gavel has transcribed, marking each
 * `searchable` (🔍) or not (🎥). Pure — the one query the caller runs once instead
 * of an N-round-trip countByEvent per meeting.
 * @param {Array<{eventId:number}>} meetings
 * @param {number[]} ingestedEventIds
 */
export function tagSearchable(meetings, ingestedEventIds = []) {
  const ingested = new Set(ingestedEventIds);
  return (meetings ?? []).map((m) => ({ ...m, searchable: ingested.has(m.eventId) }));
}

/** "all" | "c::<committee>" → the committee name, or null for All. */
export function decodeCommittee(value) {
  if (!value || value === 'all') return null;
  return value.startsWith('c::') ? value.slice(3) : null;
}

const committeeValue = (committee) => `c::${committee}`.slice(0, VALUE_MAX);
const option = (text, value) => ({ text: plain(text), value: String(value).slice(0, VALUE_MAX) });

/** Distinct committees present in the meeting set, with their meeting counts. */
function committeeCounts(meetings) {
  const counts = new Map();
  for (const m of meetings) counts.set(m.eventBodyName, (counts.get(m.eventBodyName) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

/** The committee dropdown — options derived ONLY from committees that have video. */
function committeeFilterBlock(meetings, committee, copy) {
  const options = [option(copy.allCommittees, 'all')];
  for (const [name, count] of committeeCounts(meetings))
    options.push(option(`${name} (${count})`, committeeValue(name)));

  const select = { type: 'static_select', action_id: 'video_filter', placeholder: plain(copy.filterLabel), options };
  const activeValue = committee ? committeeValue(committee) : 'all';
  const initial = options.find((o) => o.value === activeValue);
  if (initial) select.initial_option = initial;
  return { type: 'actions', elements: [select] };
}

/** A meeting row: committee headline + date · tag + a ▶ Watch link button. */
function meetingRow(meeting, language, copy) {
  const tag = meeting.searchable ? copy.searchable : copy.videoOnly;
  const date = dateLabel(meeting.eventDate, language);
  const meta = [date, tag].filter(Boolean).join(' · ');
  return {
    type: 'section',
    text: { type: 'mrkdwn', text: `*${meeting.eventBodyName}*\n${meta}` },
    accessory: {
      type: 'button',
      action_id: 'video_watch',
      text: plain(copy.watch),
      url: granicusMediaUrl(meeting.eventMedia),
      value: String(meeting.eventId),
    },
  };
}

/**
 * The filterable meeting-video browse modal. Pure over a tagged meeting set
 * (`{eventId, eventBodyName, eventDate, eventMedia, searchable}`).
 * @param {Array<object>} meetings
 * @param {{ language?: 'en'|'es', committee?: string|null }} [opts]
 * @returns {object} a Block Kit modal view
 */
export function videoModal(meetings = [], { language = 'en', committee = null } = {}) {
  const copy = COPY[language] ?? COPY.en;
  const view = {
    type: 'modal',
    callback_id: 'video_browse_modal',
    private_metadata: JSON.stringify({ language, committee: committee ?? null }),
    title: plain(copy.title),
    close: plain(copy.close),
    blocks: [],
  };

  if (!meetings || meetings.length === 0) {
    view.blocks = [mrkdwn(copy.empty)];
    return view;
  }

  const visible = meetings.filter((m) => !committee || m.eventBodyName === committee).slice(0, MAX_MODAL_MEETINGS);

  view.blocks = [committeeFilterBlock(meetings, committee, copy), context(copy.leadIn), { type: 'divider' }];
  if (visible.length === 0) {
    view.blocks.push(mrkdwn(copy.empty));
  } else {
    for (const m of visible) view.blocks.push(meetingRow(m, language, copy));
  }
  view.blocks.push({ type: 'divider' }, context(copy.legend));
  return view;
}

/**
 * The reporter-gated "🎥 Meeting video" App Home section: a compact preview of the
 * most recent meetings + a 📋 Browse videos button that opens the same modal. Pure.
 * @param {Array<object>} meetings - tagged meetings (searchable flag set)
 * @param {'en'|'es'} [language]
 * @returns {object[]} Block Kit blocks
 */
export function meetingVideoSection(meetings = [], language = 'en') {
  const copy = COPY[language] ?? COPY.en;
  const blocks = [mrkdwn(copy.homeHeading), context(copy.homeLeadIn)];

  if (!meetings || meetings.length === 0) {
    blocks.push(context(copy.empty));
  } else {
    for (const m of meetings.slice(0, MAX_HOME_PREVIEW)) {
      const tag = m.searchable ? copy.searchable : copy.videoOnly;
      const date = dateLabel(m.eventDate, language);
      const link = `<${granicusMediaUrl(m.eventMedia)}|${copy.watch}>`;
      blocks.push(context(`*${m.eventBodyName}* · ${[date, tag].filter(Boolean).join(' · ')} · ${link}`));
    }
  }

  blocks.push({
    type: 'actions',
    elements: [{ type: 'button', action_id: 'video_browse', text: plain(copy.browse), style: 'primary' }],
  });
  blocks.push({ type: 'divider' });
  return blocks;
}
