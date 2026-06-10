const plain = (text) => ({ type: 'plain_text', text, emoji: true });

const LANGUAGE_OPTIONS = [
  { text: plain('🇺🇸 English'), value: 'en' },
  { text: plain('🇪🇸 Español (bilingual cards)'), value: 'es' },
];

/**
 * "＋ Watch" modal: pick one subscribed channel, name the entity.
 * @param {Array<{channelId: string, channelName: string}>} channels
 * @returns {object}
 */
export function addWatchModal(channels) {
  return {
    type: 'modal',
    callback_id: 'home_add_watch_modal',
    title: plain('Watch something'),
    submit: plain('Watch'),
    close: plain('Cancel'),
    blocks: [
      {
        type: 'input',
        block_id: 'watch_channel',
        label: plain('Alert this channel'),
        element: {
          type: 'static_select',
          action_id: 'value',
          options: channels.map((c) => ({ text: plain(`#${c.channelName}`), value: c.channelId })),
        },
      },
      {
        type: 'input',
        block_id: 'watch_entity',
        label: plain('File number, address, or name'),
        element: {
          type: 'plain_text_input',
          action_id: 'value',
          placeholder: plain('e.g. File #260229 · 2000 S 13th St · Punta Cana LLC'),
        },
      },
    ],
  };
}

/**
 * Per-channel config modal. Committees use a typeahead (multi_external_select →
 * the home_committees options handler) because Milwaukee has 169 active bodies —
 * past Slack's 100-option static cap.
 * @param {{channelId: string, channelName: string, committees: string[], keywords: string[], language: 'en'|'es'}} channel
 * @returns {object}
 */
export function channelConfigModal(channel) {
  const committeesElement = {
    type: 'multi_external_select',
    action_id: 'home_committees',
    min_query_length: 0,
    placeholder: plain('Type to search committees…'),
  };
  if (channel.committees.length > 0) {
    committeesElement.initial_options = channel.committees.map((name) => ({ text: plain(name), value: name }));
  }
  const keywordsElement = {
    type: 'plain_text_input',
    action_id: 'value',
    placeholder: plain('rezoning, demolition, liquor license'),
  };
  if (channel.keywords.length > 0) {
    keywordsElement.initial_value = channel.keywords.join(', ');
  }
  return {
    type: 'modal',
    callback_id: 'home_channel_config_modal',
    private_metadata: channel.channelId,
    title: plain(`#${channel.channelName}`.slice(0, 24)),
    submit: plain('Save'),
    close: plain('Cancel'),
    blocks: [
      {
        type: 'input',
        block_id: 'cfg_committees',
        optional: true,
        label: plain('Committees'),
        element: committeesElement,
      },
      {
        type: 'input',
        block_id: 'cfg_keywords',
        optional: true,
        label: plain('Keywords (comma-separated)'),
        element: keywordsElement,
      },
      {
        type: 'input',
        block_id: 'cfg_language',
        label: plain('Alert language'),
        element: {
          type: 'radio_buttons',
          action_id: 'value',
          options: LANGUAGE_OPTIONS,
          initial_option: LANGUAGE_OPTIONS[channel.language === 'es' ? 1 : 0],
        },
      },
    ],
  };
}
