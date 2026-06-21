/**
 * Speaker naming (MOO-143). Deepgram diarizes a meeting into anonymous per-meeting
 * labels (Speaker 0, 1, 2…); a journalist cannot publish "Speaker 2." This module
 * maps those labels to real council members from how the room talks — who is
 * thanked, who chairs, who is addressed by name — using Claude + the committee
 * roster, behind a hard confidence gate so a *wrong* name is never published
 * (a wrong name is worse than no name).
 *
 * Everything here is pure except `generateSpeakerMap`, whose Claude call is INJECTED
 * (mirrors `stories/angle.js`). The output is roster-officials-only metadata — no
 * Slack content ever touches this layer.
 */

/** Only a member/chair match this confident earns a proper name; else a role label. */
export const NAME_CONFIDENCE_THRESHOLD = 0.8;

const NAMEABLE_ROLES = new Set(['member', 'chair']);

/**
 * Candidate officials for a meeting's committee. Milwaukee committees are subsets of
 * the Common Council and we have no live committee-membership feed, so the candidate
 * set is the full directory — the model picks by spoken cue, the gate refuses any
 * name not in this set.
 *
 * @param {Array<{name:string, title:string, district:number}>|undefined} councilMembers
 * @param {{committee?:string}} [_meeting]
 * @returns {Array<{name:string, title:string, district:number}>}
 */
export function deriveRoster(councilMembers, _meeting = {}) {
  if (!Array.isArray(councilMembers)) return [];
  return councilMembers.map(({ name, title, district }) => ({ name, title, district }));
}

const DEFAULT_MAX_CHARS_PER_SPEAKER = 1500;

/**
 * Concatenate each speaker's own words into one bounded bundle — the evidence the
 * model reasons over. Accepts `transcript` (raw Deepgram) or `text` (reconstructed).
 *
 * @param {Array<{speaker:number, transcript?:string, text?:string}>} utterances
 * @param {{maxCharsPerSpeaker?:number}} [options]
 * @returns {Array<{speaker:number, sampleText:string, utteranceCount:number}>}
 */
export function buildSpeakerBundles(utterances, { maxCharsPerSpeaker = DEFAULT_MAX_CHARS_PER_SPEAKER } = {}) {
  const bySpeaker = new Map();
  for (const utterance of utterances ?? []) {
    if (utterance?.speaker == null) continue;
    const line = (utterance.transcript ?? utterance.text ?? '').trim();
    if (!line) continue;
    const bundle = bySpeaker.get(utterance.speaker) ?? { speaker: utterance.speaker, parts: [], utteranceCount: 0 };
    bundle.parts.push(line);
    bundle.utteranceCount += 1;
    bySpeaker.set(utterance.speaker, bundle);
  }
  return [...bySpeaker.values()]
    .sort((a, b) => a.speaker - b.speaker)
    .map(({ speaker, parts, utteranceCount }) => ({
      speaker,
      utteranceCount,
      sampleText: parts.join(' ').slice(0, maxCharsPerSpeaker),
    }));
}

/**
 * Rebuild an attributable utterance stream from stored chunks so the mapper can
 * re-run on already-ingested meetings WITHOUT re-transcribing. Only single-speaker
 * windows carry clean attribution; multi-speaker windows are dropped (their lines
 * are not individually labeled), trading recall for zero mis-attribution.
 *
 * @param {Array<{speakers:number[], text:string, startTime?:number}>} chunks
 * @returns {Array<{speaker:number, transcript:string, start:number}>}
 */
export function reconstructUtterancesFromChunks(chunks) {
  return (chunks ?? [])
    .filter((chunk) => Array.isArray(chunk.speakers) && chunk.speakers.length === 1)
    .map((chunk) => ({ speaker: chunk.speakers[0], transcript: chunk.text, start: chunk.startTime ?? 0 }));
}

/** System prompt — conservative by design; accuracy is the whole point. */
export function speakerMapSystemPrompt() {
  return `You identify who is speaking in a Milwaukee city committee meeting transcript. You are given, \
per anonymous diarization label (Speaker 0, Speaker 1, …), a sample of that speaker's own words, plus a \
roster of the elected officials who could be present.

Infer which label is which official ONLY from in-room evidence: a speaker who self-identifies ("Alderman \
Stamper, present"), who is thanked or addressed by name ("thank you, Alderwoman Coggs"), who runs roll call \
or chairs the meeting, or whose remarks only a specific member would make.

CRITICAL RULES (this feeds journalism — a wrong name is worse than no name):
- NEVER guess and NEVER invent a name. If the evidence is not strong, return name: null and the best role.
- Only use a name that appears in the provided roster, spelled exactly as the roster spells it.
- Most speakers are NOT council members (staff, applicants, the public). Label them by role, not by name.
- role is one of: member, chair, staff, applicant, public, unknown.
- confidence is 0..1: reserve >= 0.8 for a name you could defend with a direct quote.
- evidence is the specific cue you used (quote it), or why you could not name them.`;
}

/** JSON Schema for Anthropic structured output. */
export const SPEAKER_MAP_SCHEMA = {
  type: 'object',
  properties: {
    mappings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speaker: { type: 'integer' },
          name: { type: ['string', 'null'] },
          role: { type: 'string', enum: ['member', 'chair', 'staff', 'applicant', 'public', 'unknown'] },
          confidence: { type: 'number' },
          evidence: { type: 'string' },
        },
        required: ['speaker', 'name', 'role', 'confidence', 'evidence'],
        additionalProperties: false,
      },
    },
  },
  required: ['mappings'],
  additionalProperties: false,
};

/**
 * Build the user prompt: the roster + each speaker's evidence bundle.
 * @param {{bundles:Array<{speaker:number,sampleText:string,utteranceCount:number}>, roster:Array<{name:string,title:string,district:number}>, committee?:string, eventDate?:string}} input
 * @returns {string}
 */
export function buildSpeakerMapPrompt({ bundles, roster, committee, eventDate }) {
  const rosterLines = (roster ?? []).length
    ? roster.map((m) => `  - ${m.title} ${m.name} (District ${m.district})`).join('\n')
    : '  (no roster provided)';

  const speakerLines = (bundles ?? [])
    .map((b) => `Speaker ${b.speaker} (${b.utteranceCount} turns):\n"${b.sampleText}"`)
    .join('\n\n');

  return [
    `MEETING: ${committee ?? '(unknown committee)'} — ${eventDate ?? '(unknown date)'}`,
    '',
    'ROSTER — the only names you may assign:',
    rosterLines,
    '',
    'SPEAKERS — each label with a sample of its own words:',
    speakerLines || '(no speaker samples)',
    '',
    'Return one mapping per speaker label above.',
  ].join('\n');
}

/**
 * Generate + validate the raw speaker map. Throws on malformed output so an
 * unvalidated map never reaches the gate.
 * @param {object} input  see {@link buildSpeakerMapPrompt}
 * @param {{generate:(x:{system:string,prompt:string})=>Promise<any>}} deps
 * @returns {Promise<{mappings:Array<object>}>}
 */
export async function generateSpeakerMap(input, { generate }) {
  const system = speakerMapSystemPrompt();
  const prompt = buildSpeakerMapPrompt(input);
  const result = await generate({ system, prompt });
  if (!result || !Array.isArray(result.mappings)) {
    throw new Error('Speaker map generator returned a malformed result: need { mappings: [...] }');
  }
  // The real Claude boundary enforces SPEAKER_MAP_SCHEMA, but this pure function's
  // contract doesn't — guard each row so a stray shape can't seed an `undefined`
  // speaker key (NaN/undefined) downstream in applyConfidenceGate.
  for (const mapping of result.mappings) {
    if (typeof mapping?.speaker !== 'number' || !mapping.role) {
      throw new Error(`Speaker map row is malformed (needs numeric speaker + role): ${JSON.stringify(mapping)}`);
    }
  }
  return { mappings: result.mappings };
}

/** Normalize a name for roster membership comparison (case/whitespace/punctuation-insensitive). */
function nameKey(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * The false-naming ≈ 0 gate. A name survives ONLY when the role is nameable, the
 * confidence clears the threshold, AND the name is in the roster (defeats a confident
 * hallucination). Everything else degrades to a role; the title is taken from the
 * roster, never the model.
 *
 * @param {Array<{speaker:number,name:string|null,role:string,confidence:number}>} mappings
 * @param {Array<{name:string,title:string,district:number}>} roster
 * @param {{threshold?:number}} [options]
 * @returns {Record<number, {name:string|null, title:string|null, role:string, confidence:number}>}
 */
export function applyConfidenceGate(mappings, roster, { threshold = NAME_CONFIDENCE_THRESHOLD } = {}) {
  const byKey = new Map((roster ?? []).map((m) => [nameKey(m.name), m]));
  const out = {};
  for (const mapping of mappings ?? []) {
    const rosterMatch = byKey.get(nameKey(mapping.name));
    const earnsName =
      NAMEABLE_ROLES.has(mapping.role) && Number(mapping.confidence) >= threshold && Boolean(rosterMatch);
    out[mapping.speaker] = earnsName
      ? { name: rosterMatch.name, title: rosterMatch.title, role: mapping.role, confidence: mapping.confidence }
      : { name: null, title: null, role: mapping.role ?? 'unknown', confidence: mapping.confidence ?? 0 };
  }
  return out;
}

/**
 * Full pipeline for one meeting: roster → per-speaker bundles → Claude map → gate →
 * Convex-ready entries `[{speaker,name,title,role,confidence}]`. The Claude call is
 * injected; everything else is the pure core above. Used by the ingest hook and the
 * standalone re-map script alike.
 *
 * @param {{utterances:Array<object>, councilMembers:Array<object>, committee?:string, eventDate?:string}} input
 * @param {{generate:(x:{system:string,prompt:string})=>Promise<any>, threshold?:number}} deps
 * @returns {Promise<Array<{speaker:number,name:string|null,title:string|null,role:string,confidence:number}>>}
 */
export async function buildSpeakerMapEntries(
  { utterances, councilMembers, committee, eventDate },
  { generate, threshold },
) {
  const roster = deriveRoster(councilMembers, { committee });
  const bundles = buildSpeakerBundles(utterances);
  const { mappings } = await generateSpeakerMap({ bundles, roster, committee, eventDate }, { generate });
  const gated = applyConfidenceGate(mappings, roster, { threshold });
  return Object.entries(gated).map(([speaker, entry]) => ({ speaker: Number(speaker), ...entry }));
}

const ROLE_LABEL = {
  chair: 'the chair',
  staff: 'committee staff',
  applicant: 'an applicant',
  public: 'a member of the public',
  member: 'a committee member',
  unknown: 'a speaker',
};

/** Display string for one resolved label. */
function labelFor(speaker, speakerMap) {
  const entry = speakerMap?.[speaker];
  if (entry?.name) return entry.title ? `${entry.title} ${entry.name}` : entry.name;
  if (entry?.role) return ROLE_LABEL[entry.role] ?? 'a speaker';
  return 'a speaker';
}

/**
 * Render the "who" of a receipt from a chunk's diarization labels + the meeting's
 * gated speaker map. Falls back to "A speaker" when the map is missing entirely.
 *
 * @param {number[]} speakers
 * @param {Record<number, object>|null|undefined} speakerMap
 * @returns {string}
 */
export function formatSpeakerLabel(speakers, speakerMap) {
  if (!Array.isArray(speakers) || speakers.length === 0) return 'A speaker';
  const named = speakers.filter((s) => speakerMap?.[s]?.name);
  const chosen = named.length ? named : speakers;
  const labels = [...new Set(chosen.map((s) => labelFor(s, speakerMap)))];
  const joined = labels.length === 1 ? labels[0] : `${labels.slice(0, -1).join(', ')} and ${labels[labels.length - 1]}`;
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}
