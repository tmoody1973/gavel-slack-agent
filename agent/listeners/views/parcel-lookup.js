import {
  PARCEL_ADDRESS_ACTION,
  PARCEL_ADDRESS_BLOCK,
  propertyResultModal,
} from '../../blockkit/parcel-lookup-modal.js';

const NOT_FOUND =
  'No Milwaukee parcel found for that address. Double-check the spelling and the direction — N/S/E/W is easy to get wrong (e.g. it may be W, not E).';

/**
 * Parcel-lookup modal submit: resolve the address and, on a hit, transform the
 * modal into the property card (response_action: update); on a miss or a bad
 * address, return an inline error on the input block so the user fixes it in
 * place. lookupParcel is injected for tests.
 * @param {{ lookupParcel: (address: string) => Promise<object|null> }} deps
 */
export function makeParcelLookupSubmit(deps) {
  return async ({ ack, view, logger }) => {
    const address = (view.state.values[PARCEL_ADDRESS_BLOCK]?.[PARCEL_ADDRESS_ACTION]?.value ?? '').trim();
    if (!address) {
      await ack({ response_action: 'errors', errors: { [PARCEL_ADDRESS_BLOCK]: 'Enter a street address.' } });
      return;
    }
    let parcel = null;
    try {
      parcel = await deps.lookupParcel(address);
    } catch (e) {
      logger?.error?.(`parcel lookup failed for "${address}": ${e}`); // unparseable address / upstream error
    }
    if (!parcel) {
      await ack({ response_action: 'errors', errors: { [PARCEL_ADDRESS_BLOCK]: NOT_FOUND } });
      return;
    }
    await ack({ response_action: 'update', view: propertyResultModal(parcel) });
  };
}
