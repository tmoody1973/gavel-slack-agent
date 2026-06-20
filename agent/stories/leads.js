// Story Radar orchestration (MOO-127). Two paths, deliberately split by latency:
//
//   selectStoryLeads(upcoming)  — PURE, LLM-free. The App Home "📰 Story leads" path.
//                                 Tags + ranking only, so the Home renders fast.
//   composeLeadAngles(leads)    — ASYNC, injected. The `/gavel stories` path, which can
//                                 afford a Claude call: enrich the top leads, re-score
//                                 with the matter body, attach the sponsor, write angles.
//
// Both reuse the MOO-123 salience spine (selectSalient / districtOf) and the MOO-51
// walk-on/consent flags already on the detected rows — no new persistence.

import { findMember } from '../alerts/council.js';
import { matchSubscriptions } from '../alerts/match.js';
import { selectSalient } from '../home/salience.js';
import { committeesAndKeywordsForTopics, TOPIC_KEYS, TOPICS } from '../onboarding/topics.js';
import { generateStoryAngle } from './angle.js';
import { scoreNewsworthiness } from './newsworthiness.js';

const DEFAULT_CAP = 6;

/**
 * Rank the upcoming agenda through the newsworthiness lens (pure, LLM-free).
 * Keeps only items that earn at least one tag, carries the MOO-123 salience
 * reasons (district context) alongside, and ranks by the composite score.
 *
 * @param {Array<object>} upcoming - detected rows (listUpcoming)
 * @param {{ boundaries?: Array<string|number>, cap?: number }} [opts]
 * @returns {Array<{ item: object, tags: Array<{kind: string, detail?: string}>, score: number, reasons: Array<object> }>}
 */
export function selectStoryLeads(upcoming = [], { boundaries = [], cap = DEFAULT_CAP } = {}) {
  // The salience selector gives us district/anomaly/big *reasons* per item; we fold
  // those in as context but rank by the journalist score, not the civic one.
  const salient = selectSalient(upcoming, { boundaries, cap: Number.POSITIVE_INFINITY });
  const reasonsByItem = new Map(salient.map((entry) => [entry.item.eventItemId, entry.reasons]));

  const leads = [];
  for (const item of upcoming) {
    const { tags, score } = scoreNewsworthiness(item);
    if (score <= 0) continue;
    leads.push({ item, tags, score, reasons: reasonsByItem.get(item.eventItemId) ?? [] });
  }

  leads.sort(
    (a, b) =>
      b.score - a.score ||
      String(a.item.eventDate ?? '').localeCompare(String(b.item.eventDate ?? '')) ||
      (a.item.eventItemId ?? 0) - (b.item.eventItemId ?? 0),
  );
  return leads.slice(0, cap);
}

/**
 * Resolve the `/gavel stories [committee|topic]` argument to a filtered agenda.
 * A MOO-121 topic key filters by that topic's committees + keywords; anything else
 * is a case-insensitive committee-name substring. Empty → the whole week.
 *
 * @param {Array<object>} upcoming
 * @param {string} query
 * @returns {{ items: Array<object>, label: string, topicKey: string|null }}
 */
export function filterByCommitteeOrTopic(upcoming = [], query = '') {
  const trimmed = (query ?? '').trim();
  if (!trimmed) return { items: upcoming, label: 'this week', topicKey: null };

  const topicKey = TOPIC_KEYS.find((key) => key === trimmed.toLowerCase());
  if (topicKey) {
    const { committees, keywords } = committeesAndKeywordsForTopics([topicKey]);
    const pseudoSub = [{ channelId: 'query', committees, keywords }];
    const items = upcoming.filter((row) => matchSubscriptions(row, pseudoSub).length > 0);
    return { items, label: stripEmoji(TOPICS[topicKey].label_en), topicKey };
  }

  const needle = trimmed.toLowerCase();
  const items = upcoming.filter((row) => (row.eventBodyName ?? '').toLowerCase().includes(needle));
  return { items, label: trimmed, topicKey: null };
}

/**
 * Enrich the top leads and write a grounded angle for each (async). Each lead is
 * isolated: an enrichment or angle failure degrades that one to `angle: null`
 * rather than sinking the batch. Re-scores with the matter body so the tags
 * reflect signals the terse title hid.
 *
 * @param {Array<object>} leads - already capped by the caller
 * @param {{
 *   enrich: (item: object) => Promise<{matter: object, event: object, person: object|null}>,
 *   generate: (input: {system: string, prompt: string}) => Promise<any>,
 *   members: Array<{name: string}>,
 *   language?: 'en'|'es',
 *   countTranscript?: (eventId: number) => Promise<number>,
 * }} deps
 * @returns {Promise<Array<object>>}
 */
export async function composeLeadAngles(leads, { enrich, generate, members = [], language = 'en', countTranscript }) {
  return Promise.all(
    leads.map(async (lead) => {
      try {
        const { matter, person } = await enrich(lead.item);
        const matterText = matter?.matterText ?? '';
        const sponsorName = person?.name ?? null;
        const member = findMember(sponsorName, members);
        const hasTranscript = countTranscript ? (await countTranscript(lead.item.eventId).catch(() => 0)) > 0 : false;

        // Re-score with the enriched body — a terse title may have hidden the money/equity signal.
        const { tags } = scoreNewsworthiness(lead.item, { text: matterText });
        const enriched = {
          ...lead,
          tags,
          matter,
          person,
          member,
          fileNumber: matter?.fileNumber ?? null,
          hasTranscript,
        };

        const angle = await generateStoryAngle(
          { item: lead.item, tags, matterText, sponsorName: sponsorName ?? member?.name ?? null },
          { generate, language },
        );
        return { ...enriched, angle };
      } catch {
        return { ...lead, angle: null };
      }
    }),
  );
}

/** Drop a leading emoji + space from a topic label so it reads in prose. */
function stripEmoji(label) {
  return label.replace(/^\P{L}+/u, '').trim();
}
