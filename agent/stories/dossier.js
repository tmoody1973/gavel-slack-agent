// Assemble the reporter dossier (MOO-129) — the orchestrator behind "📋 Brief me". Fuses the
// threads Gavel already indexes for one story lead: the sponsor + contact (enrich + directory
// match), the matter's history, its recorded outcome, the moment it was discussed on the public
// webcast (transcript + video), and a grounded plain-English angle. Every boundary (Legistar,
// Convex, the transcript search, Claude) is injected, so this stays pure and unit-testable. One
// failing source degrades to an empty section — it never sinks the whole brief.

import { findMember } from '../alerts/council.js';
import { generateStoryAngle } from './angle.js';

// A matter is "discussed on video" only when the top transcript hit is genuinely relevant —
// a weak vector match would surface a misleading quote, and accuracy is the whole point for a
// reporter. Gate on the score; below it, the dossier shows the honest "not yet discussed" state.
const DEFAULT_MIN_SCORE = 0.5;

/**
 * Find the most relevant transcript moment for a matter across ALL ingested meetings (the matter
 * may have been heard at a prior committee stage). Returns the top hit or null. Boundaries injected.
 * @param {{title?:string}} item
 * @param {{ embedQuery:(t:string)=>Promise<number[]>, search:(q:{embedding:number[], limit?:number})=>Promise<Array<{score?:number}>>, minScore?:number }} deps
 * @returns {Promise<object|null>}
 */
export async function findMatterMoment(item, { embedQuery, search, minScore = DEFAULT_MIN_SCORE }) {
  const query = (item?.title ?? '').trim();
  if (!query) return null;
  const embedding = await embedQuery(query);
  const hits = await search({ embedding, limit: 2 });
  const top = hits?.[0];
  if (!top || (top.score ?? 0) < minScore) return null;
  return top;
}

async function safe(fn, fallback) {
  try {
    return await fn();
  } catch {
    return fallback;
  }
}

/** The most recent recorded outcome (a matter can be acted on across several committee stages). */
function latestOutcome(outcomes) {
  if (!outcomes?.length) return null;
  return [...outcomes].sort((a, b) => String(b.eventDate ?? '').localeCompare(String(a.eventDate ?? '')))[0];
}

/**
 * @param {{eventItemId:number, eventId?:number, matterId?:number, title?:string, eventBodyName?:string, eventDate?:string, tags?:Array<object>}} item
 * @param {{
 *   enrich: (item:object)=>Promise<{matter?:{fileNumber?:string}, event?:object, person?:{name?:string}|null}>,
 *   listMembers: ()=>Promise<Array<object>>,
 *   getMatterHistory: (matterId:number)=>Promise<Array<object>>,
 *   getOutcomes: (matterId:number)=>Promise<Array<object>>,
 *   searchMoment: (item:object)=>Promise<object|null>,
 *   generate?: (input:{system:string, prompt:string})=>Promise<any>,
 *   language?: 'en'|'es',
 * }} deps
 * @returns {Promise<object>} the assembled dossier (consumed by dossierModal)
 */
export async function assembleDossier(item, deps) {
  const { enrich, listMembers, getMatterHistory, getOutcomes, searchMoment, generate, language = 'en' } = deps;
  const matterId = item.matterId;

  const [enriched, members, history, outcomes, moment] = await Promise.all([
    safe(() => enrich(item), null),
    safe(() => listMembers(), []),
    matterId != null ? safe(() => getMatterHistory(matterId), []) : Promise.resolve([]),
    matterId != null ? safe(() => getOutcomes(matterId), []) : Promise.resolve([]),
    safe(() => searchMoment(item), null),
  ]);

  const sponsorName = enriched?.person?.name ?? null;
  const member = findMember(sponsorName ?? undefined, members);

  let angle = null;
  if (generate) {
    angle = await safe(
      () => generateStoryAngle({ item, tags: item.tags ?? [], sponsorName }, { generate, language }),
      null,
    );
  }

  return {
    item,
    fileNumber: enriched?.matter?.fileNumber,
    angle,
    member,
    sponsorName,
    person: enriched?.person ?? null,
    history: history ?? [],
    outcome: latestOutcome(outcomes),
    moment,
    event: enriched?.event ?? null,
    language,
  };
}
