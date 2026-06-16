/**
 * Turn a diarized Deepgram transcript into per-agenda-item, time-windowed chunks
 * ready to embed into the `transcripts` vector namespace.
 *
 * The slicing key is `EventItemVideoIndex` — Legistar marks the second into the
 * webcast where each agenda item begins, so utterances are bucketed to the item
 * whose window contains them, then split into 30-60s windows (with overlap for
 * retrieval continuity). Pure and deterministic — the Deepgram call is the only
 * non-deterministic boundary and lives elsewhere.
 */

const DEFAULT_WINDOW_SECONDS = 45;
const DEFAULT_MAX_WINDOW_SECONDS = 60;

/**
 * Tag each utterance with the agenda item whose video-index window contains it.
 * Items must be sorted ascending by videoIndex; an utterance before the first
 * boundary rolls into the first item (the call-to-order leads into item one).
 *
 * @param {Array<{speaker:number, transcript:string, start:number, end:number}>} utterances
 * @param {Array<{eventItemId:number, agendaNumber?:string, matterId?:number, videoIndex:number}>} items
 */
export function assignUtterancesToItems(utterances, items) {
  const sorted = [...items].sort((a, b) => a.videoIndex - b.videoIndex);
  return utterances.map((utterance) => ({ ...utterance, ...itemForTime(utterance.start, sorted) }));
}

function itemForTime(time, sortedItems) {
  let chosen = sortedItems[0] ?? {};
  for (const item of sortedItems) {
    if (item.videoIndex <= time) chosen = item;
    else break;
  }
  const { videoIndex, ...meta } = chosen;
  return meta;
}

/**
 * Build embeddable transcript chunks.
 *
 * @param {Array<{speaker:number, transcript:string, start:number, end:number}>} utterances
 * @param {Array<{eventItemId:number, agendaNumber?:string, matterId?:number, videoIndex:number}>} items
 * @param {{eventId:number, eventDate:string, windowSeconds?:number, maxWindowSeconds?:number}} options
 * @returns {Array<{text:string, eventId:number, eventDate:string, eventItemId:number,
 *   agendaNumber?:string, matterId?:number, speakers:number[], startTime:number, endTime:number}>}
 */
export function buildTranscriptChunks(utterances, items, options) {
  const {
    eventId,
    eventDate,
    windowSeconds = DEFAULT_WINDOW_SECONDS,
    maxWindowSeconds = DEFAULT_MAX_WINDOW_SECONDS,
  } = options;
  if (utterances.length === 0) return [];

  const tagged = assignUtterancesToItems(utterances, items);
  const byItem = groupConsecutiveByItem(tagged);

  const chunks = [];
  for (const group of byItem) {
    for (const window of windowUtterances(group, windowSeconds, maxWindowSeconds)) {
      const meta = window[0];
      chunks.push({
        text: window.map((u) => u.transcript).join('\n'),
        eventId,
        eventDate,
        eventItemId: meta.eventItemId,
        ...(meta.agendaNumber != null ? { agendaNumber: meta.agendaNumber } : {}),
        ...(meta.matterId != null ? { matterId: meta.matterId } : {}),
        speakers: [...new Set(window.map((u) => u.speaker))],
        startTime: window[0].start,
        endTime: window[window.length - 1].end,
      });
    }
  }
  return chunks;
}

/** Group utterances into runs that share the same eventItemId (already time-ordered). */
function groupConsecutiveByItem(tagged) {
  const groups = [];
  for (const utterance of tagged) {
    const last = groups[groups.length - 1];
    if (last && last[0].eventItemId === utterance.eventItemId) last.push(utterance);
    else groups.push([utterance]);
  }
  return groups;
}

/**
 * Split one item's utterances into ~windowSeconds windows, hard-capped at
 * maxWindowSeconds, carrying the previous window's last utterance into the next
 * for overlap. Always emits at least one utterance per window (a long monologue
 * becomes its own chunk).
 */
function windowUtterances(utterances, windowSeconds, maxWindowSeconds) {
  const windows = [];
  let index = 0;
  let carry = null;

  while (index < utterances.length) {
    const slice = carry ? [carry] : [];
    const start = (carry ?? utterances[index]).start;

    while (index < utterances.length) {
      const next = utterances[index];
      const wouldExceedMax = next.end - start > maxWindowSeconds;
      const reachedTarget = slice.length > 0 && next.end - start > windowSeconds;
      if (wouldExceedMax || reachedTarget) break;
      slice.push(next);
      index += 1;
    }
    if (slice.length === 0) {
      slice.push(utterances[index]);
      index += 1;
    }

    windows.push(slice);
    carry = index < utterances.length ? slice[slice.length - 1] : null;
  }
  return windows;
}
