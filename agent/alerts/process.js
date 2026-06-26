import { buildAlertCard } from './card.js';
import { findMember } from './council.js';
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
 *   enrichNews?: (input: {fileNumber: string, title: string, addresses: string[]}) => Promise<object[]>,
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
    enrichNews = async () => [],
    buildFooterText,
    postCard,
    markSent,
    logger,
  } = deps;
  const pending = await listPending(client);
  const subscriptions = await listSubscriptions(client);
  const councilMembers = deps.listCouncilMembers ? await deps.listCouncilMembers() : [];
  const results = [];

  for (const row of pending) {
    try {
      const ctx = await enrich(row);
      const matter = { fileNumber: ctx.matter.fileNumber, title: row.title, matterText: '', attachments: [] };
      const summary = await generateBilingual(matter);

      const addresses = Array.isArray(summary?.addresses) ? summary.addresses : [];
      const newsLinks = await enrichNews({ fileNumber: ctx.matter.fileNumber, title: row.title, addresses }).catch(
        () => [],
      );

      // Council directory enrichment (MOO-72): a matched member gets a headshot
      // block on the card, replacing the footer's plain-text contact line.
      const member = findMember(ctx.person?.name, councilMembers);
      const footer = buildFooterText(ctx.event, member ? null : ctx.person);

      // Per-channel language (MOO-43): ES channels get the bilingual card,
      // everyone else the EN-only card. Each variant is built at most once.
      const languageByChannel = new Map(subscriptions.map((sub) => [sub.channelId, sub.language]));
      const cardByLanguage = new Map();
      const cardFor = (language) => {
        if (!cardByLanguage.has(language)) {
          const built = buildAlertCard({
            row,
            matter: ctx.matter,
            event: ctx.event,
            summary,
            footer,
            language,
            member,
            newsLinks,
          });
          cardByLanguage.set(language, built);
        }
        return cardByLanguage.get(language);
      };

      const channels = matchSubscriptions(row, subscriptions);
      for (const channel of channels) {
        const language = languageByChannel.get(channel) === 'es' ? 'es' : 'en';
        await postCard(channel, cardFor(language));
      }

      await markSent(client, row.eventItemId);
      results.push({ eventItemId: row.eventItemId, posted: channels.length });
    } catch (err) {
      logger?.error?.(`alert failed for eventItemId ${row.eventItemId}: ${err.message}`);
      results.push({ eventItemId: row.eventItemId, posted: 0, error: err.message });
    }
  }
  return results;
}
