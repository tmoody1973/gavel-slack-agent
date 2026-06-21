/**
 * Transcript memory orchestrators, formatted for Claude to quote FROM. Pure: all
 * I/O (embeddings, Convex vector search, Legistar lookups, speaker maps) is injected,
 * so the Slack-thread tools (`search_transcripts`, `get_video_moment`) are unit-tested
 * without the network. Indexed from the PUBLIC webcast only — never Slack content.
 */

import { formatSpeakerLabel } from '../../transcripts/speakers.js';

/** Seconds → HH:MM:SS (the form Granicus deep links and humans both read). */
function hms(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  return [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatReceipt(hit, deepLink, speakerMap) {
  const who = formatSpeakerLabel(hit.speakers, speakerMap);
  const item = hit.agendaNumber ? `agenda item ${hit.agendaNumber}` : 'the meeting';
  const link = deepLink(hit.eventMedia, hit.startTime);
  return `### ${who} · ${item} · ${hit.eventDate} @ ${hms(hit.startTime)}\n«${hit.text.trim()}»\n▶ ${link}`;
}

/**
 * Semantic search over meeting transcripts → quotable receipts.
 * @param {{query:string, eventId?:number, committee?:string, limit?:number}} input
 * @param {{
 *   embedQuery:(text:string)=>Promise<number[]>,
 *   search:(q:{embedding:number[], eventId?:number, eventBodyName?:string, limit?:number})=>Promise<Array<object>>,
 *   deepLink:(eventMedia:number, startSeconds:number)=>string,
 *   getSpeakerMap?:(eventId:number)=>Promise<Record<number,object>|null>,
 * }} deps
 * @returns {Promise<string>}
 */
export async function runTranscriptSearch({ query, eventId, committee, limit = 6 }, deps) {
  const embedding = await deps.embedQuery(query);
  const hits = await deps.search({ embedding, eventId, eventBodyName: committee, limit });
  if (hits.length === 0) {
    return `information_unavailable: no meeting-transcript passage matched "${query}". Say you don't have a transcript quote for that and don't invent one.`;
  }
  const speakerMaps = await loadSpeakerMaps(hits, deps.getSpeakerMap);
  const header = [
    'From Milwaukee committee meeting transcripts (the public webcast). These are REAL quotes —',
    'present them with the speaker, agenda item, and the ▶ video link. Quote only what appears here; never invent a quote.',
  ].join(' ');
  const body = hits.map((hit) => formatReceipt(hit, deps.deepLink, speakerMaps.get(hit.eventId))).join('\n\n');
  return `${header}\n\n${body}`;
}

/** Fetch each hit-event's gated speaker map once (MOO-143), so receipts can name the speaker. */
async function loadSpeakerMaps(hits, getSpeakerMap) {
  const maps = new Map();
  if (typeof getSpeakerMap !== 'function') return maps;
  const eventIds = [...new Set(hits.map((hit) => hit.eventId).filter((id) => id != null))];
  await Promise.all(
    eventIds.map(async (eventId) => {
      try {
        maps.set(eventId, await getSpeakerMap(eventId));
      } catch {
        maps.set(eventId, null); // a missing map degrades to a generic label, never blocks the quote
      }
    }),
  );
  return maps;
}

/**
 * Resolve an agenda item to a timestamped video deep link (tier 1) at the second
 * the item begins (`EventItemVideoIndex`). Legistar exposes an item only within its
 * meeting (`/events/{eventId}/eventitems/{itemId}`), so the meeting's eventId is
 * required — the agent has it from get_event_agenda / get_upcoming_events.
 * @param {{eventItemId:number, eventId?:number}} input
 * @param {{
 *   getEventItem:(eventId:number, itemId:number)=>Promise<object|null>,
 *   getEvent:(eventId:number)=>Promise<object|null>,
 *   deepLink:(eventMedia:number, startSeconds:number)=>string,
 * }} deps
 * @returns {Promise<string>}
 */
export async function runVideoMoment({ eventItemId, eventId }, deps) {
  if (eventId == null) {
    return `information_unavailable: tell me which meeting (its EventId) agenda item ${eventItemId} is from — Legistar only exposes an item within its meeting.`;
  }
  const item = await deps.getEventItem(eventId, eventItemId);
  if (item?.EventItemVideoIndex == null) {
    return `information_unavailable: agenda item ${eventItemId} has no video index — the webcast hasn't been indexed to that item, so there's no timestamped moment to link.`;
  }
  const event = await deps.getEvent(eventId);
  const eventMedia = Number(event?.EventMedia); // single-event endpoint returns a string
  if (!Number.isFinite(eventMedia)) {
    return `information_unavailable: that meeting has no published video, so there's no moment to link.`;
  }
  const start = item.EventItemVideoIndex;
  const label = item.EventItemAgendaNumber ? `agenda item ${item.EventItemAgendaNumber}` : `item ${eventItemId}`;
  return `Watch where ${label} begins (${hms(start)} into the meeting):\n▶ ${deps.deepLink(eventMedia, start)}`;
}
