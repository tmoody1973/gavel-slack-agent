import { growAreasModal, growWatchlistCard } from '../../blockkit/grow.js';

// Adaptive-growth handlers (MOO-120 FD-D). Both are pure proposals — Gavel never
// creates a channel (no channels:manage on the Grid token).

/** "How →" on the watchlist nudge → reveal the create · invite · done checklist. */
export function makeWatchlistHow() {
  return async ({ ack, action, respond, logger }) => {
    await ack();
    try {
      const card = growWatchlistCard(action?.value ?? 'en');
      await respond({ response_type: 'ephemeral', replace_original: false, text: 'Add a #gavel-watchlist', ...card });
    } catch (error) {
      logger.error(`grow watchlist how failed: ${error}`);
    }
  };
}

/** App Home "I cover multiple neighborhoods" → open the per-area proposal modal. */
export function makeCoverMultipleAreas() {
  return async ({ ack, body, action, client, logger }) => {
    await ack();
    try {
      await client.views.open({ trigger_id: body.trigger_id, view: growAreasModal(action?.value ?? 'en') });
    } catch (error) {
      logger.error(`grow areas modal failed: ${error}`);
    }
  };
}
