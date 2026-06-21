// The community-memory bridge (MOO-125) — the signature differentiator. The neighborhood is
// already talking about a problem in Slack and doesn't know it's about to be decided at City
// Hall. For each salient UPCOMING agenda item we (1) translate its legalese into the plain
// phrase a neighbor would actually use, (2) live-search THIS channel's own history via RTS, and
// (3) ask Claude whether the chatter is genuinely about that item — only then do we propose it.
//
// COMPLIANCE (non-negotiable): Slack message content is queried live and NEVER stored, copied,
// or indexed. Snippets touch the judge in memory only; the match output (and everything
// downstream — the card, the dedup row) carries ONLY agenda-derived data + official ids. The
// `findBridgeMatches` output is asserted content-free in the tests.
//
// Both Claude calls are INJECTED (createClaudeGenerate({ schema }) at the boundary), so the
// prompts/validation/loop stay pure and unit-testable. Mirrors stories/angle.js.

import { matchSubscriptions } from '../../alerts/match.js';
import { selectSalient } from '../../home/salience.js';

const DEFAULT_CANDIDATE_CAP = 5;
// A proactive interrupt that's wrong erodes trust instantly, so the bar is high: a positive
// judge AND strong confidence. Conservative by design (the guardrail's "no spammy false positives").
const DEFAULT_CONFIDENCE_THRESHOLD = 0.7;

const CIVIC_GLOSSARY_ES =
  'rezoning = rezonificación; demolition = demolición; license = licencia; landlord = arrendador; ' +
  'eviction = desalojo; development = desarrollo; hearing = audiencia; ordinance = ordenanza';

// ---- Query generation: legalese → "what a neighbor would say" ----

export const BRIDGE_QUERY_SCHEMA = {
  type: 'object',
  properties: {
    queryEn: { type: 'string' },
    queryEs: { type: 'string' },
    entity: { type: 'string' },
  },
  required: ['queryEn', 'queryEs', 'entity'],
  additionalProperties: false,
};

export function bridgeQuerySystemPrompt() {
  return `You turn a legalese Milwaukee city-government agenda item into the SHORT, plain-language phrase \
a neighbor would actually type in a community Slack when talking about it — so we can search whether the \
community has discussed it. Produce:
1. entity: the single most searchable concrete thing in the item — a street address, a place/business name, \
an LLC, or (if none) the plain topic. Keep it exactly as written (addresses, proper names).
2. queryEn: a short natural-language search phrase in English a resident would use (NOT the legalese title).
3. queryEs: the same search intent in Spanish, composed natively (not word-for-word). Keep addresses/proper \
names in English. Glossary: ${CIVIC_GLOSSARY_ES}.
Do not invent details not present in the item.`;
}

export function buildBridgeQueryPrompt(item) {
  return [
    'Agenda item to translate into a community search query:',
    '',
    `TITLE: ${item?.title ?? '(none)'}`,
    `COMMITTEE: ${item?.eventBodyName ?? '(unknown)'}`,
  ].join('\n');
}

/**
 * Generate + validate the plain-language RTS query for one agenda item. Throws on a malformed
 * result so an unvalidated query never reaches RTS.
 * @param {object} item
 * @param {{ generate: (input: {system: string, prompt: string}) => Promise<any> }} deps
 * @returns {Promise<{ queryEn: string, queryEs: string, entity: string }>}
 */
export async function generateBridgeQuery(item, { generate }) {
  const result = await generate({ system: bridgeQuerySystemPrompt(), prompt: buildBridgeQueryPrompt(item) });
  const ok =
    typeof result?.queryEn === 'string' &&
    result.queryEn.length > 0 &&
    typeof result?.queryEs === 'string' &&
    typeof result?.entity === 'string' &&
    result.entity.length > 0;
  if (!ok) throw new Error('Bridge query generator returned a malformed result: need {queryEn, queryEs, entity}');
  return { queryEn: result.queryEn, queryEs: result.queryEs, entity: result.entity };
}

// ---- The judge: is the chatter really about THIS item? ----

export const BRIDGE_JUDGE_SCHEMA = {
  type: 'object',
  properties: {
    isMatch: { type: 'boolean' },
    confidence: { type: 'number' },
    reason: { type: 'string' },
  },
  required: ['isMatch', 'confidence', 'reason'],
  additionalProperties: false,
};

export function bridgeJudgeSystemPrompt() {
  return `You decide whether a community's recent Slack snippets are GENUINELY about one specific upcoming \
city-government agenda item — the same place, property, business, or concrete topic — not a coincidental \
keyword overlap (e.g. a different address on the same street, or the word "housing" in an unrelated chat).
Be conservative: this triggers a proactive message into the channel, so when you are unsure, answer \
isMatch=false. Return:
- isMatch: boolean (true only if the snippets are clearly about THIS item).
- confidence: number 0..1.
- reason: one sentence about the AGENDA ITEM and why it does/doesn't match. Do NOT quote the snippets.`;
}

export function buildBridgeJudgePrompt({ item, snippets }) {
  const lines = (snippets ?? []).map((s, i) => `  ${i + 1}. ${(s.content ?? '').trim()}`).join('\n');
  return [
    'Does the community discussion below concern THIS specific agenda item?',
    '',
    `AGENDA ITEM TITLE: ${item?.title ?? '(none)'}`,
    `COMMITTEE: ${item?.eventBodyName ?? '(unknown)'}`,
    '',
    'COMMUNITY SNIPPETS (live search results — judge relevance, do not quote them back):',
    lines || '  (none)',
  ].join('\n');
}

/**
 * Ask Claude whether the snippets are about this item. Returns the validated verdict.
 * @param {{ item: object, snippets: Array<{content?: string}> }} input
 * @param {{ generate: (input: {system: string, prompt: string}) => Promise<any> }} deps
 * @returns {Promise<{ isMatch: boolean, confidence: number, reason: string }>}
 */
export async function judgeBridgeMatch({ item, snippets }, { generate }) {
  const result = await generate({
    system: bridgeJudgeSystemPrompt(),
    prompt: buildBridgeJudgePrompt({ item, snippets }),
  });
  if (typeof result?.isMatch !== 'boolean' || typeof result?.confidence !== 'number') {
    throw new Error('Bridge judge returned a malformed result: need {isMatch, confidence, reason}');
  }
  return { isMatch: result.isMatch, confidence: result.confidence, reason: String(result.reason ?? '') };
}

// ---- The bounded match loop (the pure, testable spine) ----

const dedupKey = (channelId, eventItemId) => `${channelId}:${eventItemId}`;

/**
 * The capped candidate set for one channel: upcoming items RELEVANT to that channel (its
 * committees/keywords/district — `matchSubscriptions`), the most NOTABLE first (salience
 * orders within the relevant set), capped so RTS/Claude cost stays bounded. Relevance — not
 * salience — is the gate: a channel only gets bridges for items in its own wheelhouse, and the
 * cap keeps a busy agenda from fanning out into hundreds of RTS calls.
 * @param {Array<object>} upcoming
 * @param {object} sub - one subscription row
 * @param {number} cap
 * @returns {Array<object>}
 */
export function selectCandidates(upcoming, sub, cap = DEFAULT_CANDIDATE_CAP) {
  const relevant = (upcoming ?? []).filter((item) => matchSubscriptions(item, [sub]).length > 0);
  const boundaries = sub.boundary?.value != null ? [sub.boundary.value] : [];
  const salient = selectSalient(relevant, { boundaries, cap: relevant.length }).map((entry) => entry.item);
  const salientIds = new Set(salient.map((item) => item.eventItemId));
  return [...salient, ...relevant.filter((item) => !salientIds.has(item.eventItemId))].slice(0, cap);
}

/**
 * Find confident community↔agenda matches across all channels. Bounded by channel relevance +
 * a per-channel candidate cap and dedup (already-proposed pairs skipped). Boundaries (RTS + Claude
 * calls) are injected. The returned matches carry ONLY agenda-derived data — never message
 * content (asserted in tests).
 *
 * @param {{ upcoming: Array<object>, subscriptions: Array<object>, proposed?: Array<{channelId: string, eventItemId: number}> }} data
 * @param {{
 *   generateQuery: (item: object) => Promise<{queryEn: string, queryEs: string, entity: string}>,
 *   searchChannel: (input: {queryEn: string, queryEs: string, channelId: string}) => Promise<Array<{content?: string}>>,
 *   judge: (input: {item: object, snippets: Array<object>}) => Promise<{isMatch: boolean, confidence: number, reason: string}>,
 *   candidateCap?: number,
 *   confidenceThreshold?: number,
 * }} deps
 * @returns {Promise<Array<{channelId: string, client: string, item: object, entity: string, language: 'en'|'es', confidence: number, messageCount: number}>>}
 */
export async function findBridgeMatches({ upcoming, subscriptions, proposed = [] }, deps) {
  const {
    generateQuery,
    searchChannel,
    judge,
    candidateCap = DEFAULT_CANDIDATE_CAP,
    confidenceThreshold = DEFAULT_CONFIDENCE_THRESHOLD,
  } = deps;
  const proposedSet = new Set(proposed.map((p) => dedupKey(p.channelId, p.eventItemId)));
  const matches = [];

  for (const sub of subscriptions ?? []) {
    const candidates = selectCandidates(upcoming ?? [], sub, candidateCap).filter(
      (item) => !proposedSet.has(dedupKey(sub.channelId, item.eventItemId)),
    );

    for (const item of candidates) {
      const { queryEn, queryEs, entity } = await generateQuery(item);
      const snippets = await searchChannel({ queryEn, queryEs, channelId: sub.channelId });
      if (!snippets || snippets.length === 0) continue;

      const verdict = await judge({ item, snippets });
      if (!verdict?.isMatch || Number(verdict.confidence) < confidenceThreshold) continue;

      matches.push({
        channelId: sub.channelId,
        client: item.client ?? sub.client ?? 'milwaukee',
        item,
        entity,
        language: sub.language === 'es' ? 'es' : 'en',
        confidence: Number(verdict.confidence),
        messageCount: snippets.length,
      });
    }
  }
  return matches;
}
