import { parcelCard } from './parcel-card.js';

const plain = (text) => ({ type: 'plain_text', text, emoji: true });

export const PARCEL_LOOKUP_CALLBACK = 'parcel_lookup_modal';
export const PARCEL_ADDRESS_BLOCK = 'parcel_address';
export const PARCEL_ADDRESS_ACTION = 'value';

/**
 * The address-input modal. One required text field; a context hint sets
 * expectations. Submit resolves the parcel; a miss returns an inline error on
 * the input block (see the view_submission handler), so the user fixes it in
 * place instead of reopening.
 * @returns {object}
 */
export function parcelLookupModal() {
  return {
    type: 'modal',
    callback_id: PARCEL_LOOKUP_CALLBACK,
    title: plain('Look up a property'),
    submit: plain('Look up'),
    close: plain('Cancel'),
    blocks: [
      {
        type: 'input',
        block_id: PARCEL_ADDRESS_BLOCK,
        label: plain('Street address'),
        element: {
          type: 'plain_text_input',
          action_id: PARCEL_ADDRESS_ACTION,
          placeholder: plain('e.g. 2000 S 13th St'),
        },
      },
      {
        type: 'context',
        elements: [{ type: 'mrkdwn', text: 'Milwaukee addresses · returns owner, zoning, lot size, units & flags' }],
      },
    ],
  };
}

/**
 * The result view: the property card rendered inside the modal (no channel
 * here, so no watchlist button — that's channel-scoped), plus a "Look up
 * another" button that loops back to the input.
 * @param {object} parcel mapParcel-shaped result
 * @returns {object}
 */
export function propertyResultModal(parcel) {
  return {
    type: 'modal',
    callback_id: 'parcel_lookup_result',
    title: plain('Property'),
    close: plain('Done'),
    blocks: [
      ...parcelCard(parcel, { includeWatch: false }),
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            action_id: 'parcel_lookup_again',
            text: plain('🔎 Look up another'),
          },
        ],
      },
    ],
  };
}
