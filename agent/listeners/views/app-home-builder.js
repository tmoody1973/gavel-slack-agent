/**
 * Build the App Home Block Kit view for Gavel.
 * @param {string | null} [_installUrl] - Unused; kept for caller compatibility.
 * @param {boolean} [_isConnected] - Unused; kept for caller compatibility.
 * @returns {import('@slack/types').HomeView}
 */
export function buildAppHomeView(_installUrl = null, _isConnected = false) {
  /** @type {import('@slack/types').KnownBlock[]} */
  const blocks = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: 'Gavel — Milwaukee civic transparency :classical_building:',
      },
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          "I watch Milwaukee city government so your neighborhood doesn't have to. " +
          'I translate agendas, permits, and legislation into plain English and Spanish — ' +
          '*before* the vote — and show you how to be heard.',
      },
    },
    { type: 'divider' },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text:
          '*Ask me anything about Milwaukee city government.* Send me a *direct message* ' +
          'or *mention me in a channel*. For example:\n' +
          '• What meetings are coming up this week?\n' +
          '• What is happening with a specific legislative file?\n' +
          '• Who sponsored a matter, and how do I reach them?\n' +
          '• _¿Qué decisiones está por tomar la ciudad esta semana?_',
      },
    },
    {
      type: 'context',
      elements: [
        {
          type: 'mrkdwn',
          text: 'Sourced live from Milwaukee’s official Legistar records. Pre-vote alerts post automatically to subscribed channels.',
        },
      ],
    },
  ];

  return { type: 'home', blocks };
}
