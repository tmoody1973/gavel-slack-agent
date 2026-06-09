const MERGED_RESULT_CAP = 8;
const SNIPPET_MAX_LENGTH = 300;

/**
 * Merge EN and ES RTS message results, dedupe by channel+ts, newest first, capped.
 * @param {Array<Record<string, any>>} enMessages
 * @param {Array<Record<string, any>>} esMessages
 * @returns {Array<Record<string, any>>}
 */
export function mergeAndDedupe(enMessages, esMessages) {
  const byKey = new Map();
  for (const message of [...enMessages, ...esMessages]) {
    const key = `${message.channel_id}:${message.message_ts}`;
    if (!byKey.has(key)) {
      byKey.set(key, message);
    }
  }
  return [...byKey.values()]
    .sort((a, b) => Number(b.message_ts) - Number(a.message_ts))
    .slice(0, MERGED_RESULT_CAP);
}

/**
 * Render merged RTS results as plain text for the agent (no structuredContent —
 * array payloads fail MCP -32602).
 * @param {Array<Record<string, any>>} messages
 * @returns {string}
 */
export function formatResultsAsText(messages) {
  if (messages.length === 0) {
    return 'No prior community discussion found for this topic.';
  }
  const lines = messages.map((message, index) => {
    const date = formatDate(message.message_ts);
    const author = message.is_author_bot ? 'a bot' : `<@${message.author_user_id}>`;
    const snippet = truncate(message.content ?? '', SNIPPET_MAX_LENGTH);
    const permalink = message.permalink ? ` — ${message.permalink}` : '';
    return `${index + 1}. [${date}] in <#${message.channel_id}> by ${author}: ${snippet}${permalink}`;
  });
  return `Found ${messages.length} prior community message(s), newest first:\n${lines.join('\n')}`;
}

function formatDate(messageTs) {
  const epochSeconds = Number(messageTs);
  if (!Number.isFinite(epochSeconds)) {
    return 'unknown date';
  }
  return new Date(epochSeconds * 1000).toISOString().slice(0, 10);
}

function truncate(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}
