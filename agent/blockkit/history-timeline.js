/** Keep timeline replies well under the 3000-char section cap. */
const MAX_ACTIONS = 20;

/**
 * Date → action → result timeline for a matter's MatterHistory rows.
 * Renders the latest MAX_ACTIONS, oldest-first within the kept window.
 * @param {{fileNumber?: string, actions: Array<{date?: string, action: string, body?: string, result?: string|null}>}} input
 * @returns {object[]}
 */
export function historyTimeline({ fileNumber, actions }) {
  const kept = actions.slice(-MAX_ACTIONS);
  const lines = kept.map((a) => {
    const day = a.date ? a.date.slice(0, 10) : '—';
    const result = a.result ? ` _(${a.result})_` : '';
    const body = a.body ? ` — ${a.body}` : '';
    return `• \`${day}\` *${a.action}*${body}${result}`;
  });
  const title = fileNumber ? `🕓 History — File #${fileNumber}` : '🕓 History';
  const blocks = [
    { type: 'section', text: { type: 'mrkdwn', text: `*${title}*` } },
    { type: 'section', text: { type: 'mrkdwn', text: lines.join('\n') } },
  ];
  if (actions.length > MAX_ACTIONS) {
    blocks.push({
      type: 'context',
      elements: [{ type: 'mrkdwn', text: `Showing the latest ${MAX_ACTIONS} of ${actions.length} actions.` }],
    });
  }
  return blocks;
}
