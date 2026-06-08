import { buildAlertCard } from './card.js';
import { matchSubscriptions } from './match.js';

/**
 * Drain pending detected items into posted bilingual alert cards. Every
 * boundary is injected so this is unit-testable with fakes; the card assembly
 * and matching are pure. A row is marked sent once processed (even with no
 * matching channel); a failure leaves it pending so the next tick retries.
 *
 * @param {{
 *   client: string,
 *   listPending: (client: string) => Promise<object[]>,
 *   listSubscriptions: (client: string) => Promise<object[]>,
 *   enrich: (row: object) => Promise<{matter: object, event: object, person: object|null}>,
 *   generateBilingual: (matter: object) => Promise<object>,
 *   buildFooterText: (event: object, person: object|null) => {text: string},
 *   postCard: (channel: string, card: {text: string, blocks: object[]}) => Promise<void>,
 *   markSent: (client: string, eventItemId: number) => Promise<unknown>,
 *   logger?: {error: Function},
 * }} deps
 */
export async function processPendingAlerts(deps) {
  const {
    client,
    listPending,
    listSubscriptions,
    enrich,
    generateBilingual,
    buildFooterText,
    postCard,
    markSent,
    logger,
  } = deps;
  const pending = await listPending(client);
  const subscriptions = await listSubscriptions(client);
  const results = [];

  for (const row of pending) {
    try {
      const ctx = await enrich(row);
      const matter = { fileNumber: ctx.matter.fileNumber, title: row.title, matterText: '', attachments: [] };
      const summary = await generateBilingual(matter);
      const footer = buildFooterText(ctx.event, ctx.person);
      const card = buildAlertCard({ row, matter: ctx.matter, event: ctx.event, summary, footer });

      const channels = matchSubscriptions(row, subscriptions);
      for (const channel of channels) await postCard(channel, card);

      await markSent(client, row.eventItemId);
      results.push({ eventItemId: row.eventItemId, posted: channels.length });
    } catch (err) {
      logger?.error?.(`alert failed for eventItemId ${row.eventItemId}: ${err.message}`);
      results.push({ eventItemId: row.eventItemId, posted: 0, error: err.message });
    }
  }
  return results;
}
