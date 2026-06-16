import { parcelLookupModal } from '../../blockkit/parcel-lookup-modal.js';

/** App Home "🔎 Look up a property" button → open the address modal. */
export function makeOpenParcelLookup() {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      await client.views.open({ trigger_id: body.trigger_id, view: parcelLookupModal() });
    } catch (e) {
      logger?.error?.(`open parcel lookup failed: ${e}`);
    }
  };
}

/** "🔎 Look up another" on the result modal → swap back to the input modal. */
export function makeParcelLookupAgain() {
  return async ({ ack, body, client, logger }) => {
    await ack();
    try {
      await client.views.update({ view_id: body.view.id, view: parcelLookupModal() });
    } catch (e) {
      logger?.error?.(`parcel lookup-again failed: ${e}`);
    }
  };
}
