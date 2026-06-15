// Pure builders + validators for the sandbox seeding script (MOO-54). The thin
// scripts/seed-sandbox.mjs wraps these with Slack + Convex I/O. Keeping the
// shape logic here (like digest/build.js) makes it unit-testable without a
// network or a deployment.
//
// The corpus is staged demo content: real messages posted now, content-dated in
// the text and disclosed as staged, because Slack cannot backdate a message.

const DATE_PREFIX_EMOJI = '🗓️';

/** A message text built by formatMessage starts with the content-date prefix. */
export const CONTENT_DATE_RE = new RegExp(`^${DATE_PREFIX_EMOJI} _\\[[A-Za-z]{3} \\d{4}\\]_ `);

/** Marker the pinned disclosure carries — also how the script's pin-guard finds it. */
export const DISCLOSURE_MARKER = 'Staged sandbox channel';

const CORPUS_DATE_RE = /^[A-Z][a-z]{2} \d{4}$/;
// A Slack user id is "U" + a run of base-32-ish chars; guard against any user
// identity leaking into the staged corpus.
const SLACK_USER_ID_RE = /\bU[A-Z0-9]{6,}\b/;
const MIN_CHANNELS = 2;
const MAX_CHANNELS = 3;

/**
 * Render a corpus message as the text we actually post: a content-date prefix
 * the demo discloses as staged, then the message body.
 * @param {{ date: string, text: string }} message
 * @returns {string}
 */
export function formatMessage({ date, text }) {
  return `${DATE_PREFIX_EMOJI} _[${date}]_ ${text}`;
}

/**
 * The pinned, demo-honest disclosure for a channel. Spanish channels get an
 * appended Spanish translation so the staging notice reaches every reader.
 * @param {string} language
 * @returns {string}
 */
export function buildDisclosureMessage(language) {
  const base =
    `📋 *${DISCLOSURE_MARKER}* — these messages were posted now for the Gavel demo. ` +
    'Bracketed dates like [Feb 2025] are the date the content represents, not when it was ' +
    'posted. No real resident data.';
  if (language === 'es') {
    return (
      `${base}\n\n_Canal de demostración: los mensajes se publicaron ahora para la demo de ` +
      'Gavel; las fechas entre corchetes indican el período que representan. No contienen ' +
      'datos reales de residentes._'
    );
  }
  return base;
}

/**
 * Turn the corpus into an ordered, postable plan — one entry per channel. The
 * subscription args omit channelId (the script fills it after resolving the
 * channel by name). Standalone messages post first, then the anchored thread:
 * every thread post carries the same `thread` key so the orchestrator can post
 * the first as the parent and the rest as replies under its ts.
 * @param {Array} channels
 */
export function buildSeedPlan(channels) {
  return channels.map((channel) => ({
    name: channel.name,
    channelName: channel.name,
    language: channel.language,
    subscription: {
      client: channel.client,
      committees: channel.committees,
      keywords: channel.keywords,
      language: channel.language,
      boundary: channel.boundary,
    },
    disclosure: buildDisclosureMessage(channel.language),
    posts: buildPosts(channel),
  }));
}

function buildPosts(channel) {
  const posts = (channel.messages ?? []).map((message) => ({ text: formatMessage(message) }));
  if (channel.thread) {
    for (const message of channel.thread.messages) {
      posts.push({ text: formatMessage(message), thread: channel.thread.anchor });
    }
  }
  return posts;
}

/**
 * Fail fast (before any seeding I/O) unless the corpus honors the design
 * contract: channel count, a Spanish channel, district boundaries, real
 * committees/keywords, content-dated messages, no leaked user ids, and exactly
 * one anchored developer/LLC thread on Punta Cana / 2000 S 13th St in an es
 * channel. Throws with a specific message; returns true when clean.
 * @param {Array} channels
 */
export function assertCorpusInvariants(channels) {
  if (!Array.isArray(channels) || channels.length < MIN_CHANNELS || channels.length > MAX_CHANNELS) {
    throw new Error(`sandbox corpus: expected ${MIN_CHANNELS}-${MAX_CHANNELS} channels, got ${channels?.length}`);
  }

  const names = new Set();
  for (const channel of channels) {
    assertChannel(channel, names);
  }

  if (!channels.some((channel) => channel.language === 'es')) {
    throw new Error('sandbox corpus: at least one channel must be Spanish (language "es")');
  }

  assertAnchorThread(channels);
  return true;
}

function assertChannel(channel, names) {
  if (!channel.name || names.has(channel.name)) {
    throw new Error(`sandbox corpus: missing or duplicate channel name "${channel.name}"`);
  }
  names.add(channel.name);

  if (channel.boundary?.type !== 'district' || !String(channel.boundary.value ?? '').trim()) {
    throw new Error(`sandbox corpus: ${channel.name} needs a non-empty district boundary`);
  }
  if (!channel.committees?.length || !channel.keywords?.length) {
    throw new Error(`sandbox corpus: ${channel.name} needs at least one committee and one keyword`);
  }

  for (const message of [...(channel.messages ?? []), ...(channel.thread?.messages ?? [])]) {
    if (!CORPUS_DATE_RE.test(message.date)) {
      throw new Error(`sandbox corpus: ${channel.name} message date must be "Mon YYYY", got "${message.date}"`);
    }
    if (!String(message.text ?? '').trim()) {
      throw new Error(`sandbox corpus: ${channel.name} has an empty message`);
    }
    if (SLACK_USER_ID_RE.test(message.text)) {
      throw new Error(`sandbox corpus: ${channel.name} message looks like it embeds a Slack user id`);
    }
  }
}

function assertAnchorThread(channels) {
  const threaded = channels.filter((channel) => channel.thread);
  if (threaded.length !== 1) {
    throw new Error(`sandbox corpus: expected exactly one anchored thread, got ${threaded.length}`);
  }
  const channel = threaded[0];
  if (channel.language !== 'es') {
    throw new Error('sandbox corpus: the anchored developer/LLC thread must live in the Spanish channel');
  }
  if (channel.thread.messages.length < 2) {
    throw new Error('sandbox corpus: the anchored thread needs a parent and at least one reply');
  }
  const blob = channel.thread.messages.map((message) => message.text).join(' ');
  if (!/Punta Cana/.test(blob) || !/2000 S 13th/.test(blob)) {
    throw new Error('sandbox corpus: the anchored thread must reference Punta Cana LLC and 2000 S 13th St');
  }
}
