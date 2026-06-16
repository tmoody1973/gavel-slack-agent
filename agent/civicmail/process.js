import { matchSubscriptions } from '../alerts/match.js';
import { buildNotificationCard } from './card.js';
import { shouldSuppress } from './dedup.js';

/**
 * Drain pending E-Notify notifications into posted bilingual cards. Mirrors the
 * Legistar alert processor (alerts/process.js): every boundary is injected so
 * this is unit-testable with fakes, and matching/dedup/card assembly are pure.
 *
 * Per notification: route to channels via subscriptions → suppress if the
 * Legistar poller already covered it → summarize once (with the PDF agenda when
 * present) → post per-channel in the channel's language → mark processed. A
 * notification is marked processed even with no matching channel (so it isn't
 * re-tried); a failure leaves it pending for the next run.
 *
 * @param {{
 *   listPending: () => Promise<object[]>,
 *   listSubscriptions: () => Promise<object[]>,
 *   listLegistarItems: () => Promise<Array<{eventId: number|string}>>,
 *   fetchDocuments: (n: object) => Promise<Array<{base64: string, mediaType: string}>>,
 *   generateBilingual: (matter: object, documents: object[]) => Promise<object>,
 *   postCard: (channel: string, card: {text: string, blocks: object[]}) => Promise<void>,
 *   markProcessed: (messageId: string, summary?: object) => Promise<unknown>,
 *   logger?: {error?: Function, info?: Function},
 * }} deps
 */
export async function processCivicNotifications(deps) {
  const {
    listPending,
    listSubscriptions,
    listLegistarItems,
    fetchDocuments,
    generateBilingual,
    postCard,
    markProcessed,
    logger,
  } = deps;

  const pending = await listPending();
  const subscriptions = await listSubscriptions();
  const legistarItems = await listLegistarItems();
  const languageByChannel = new Map(subscriptions.map((sub) => [sub.channelId, sub.language]));
  const results = [];

  for (const notification of pending) {
    try {
      if (shouldSuppress(notification, legistarItems)) {
        await markProcessed(notification.messageId);
        results.push({ messageId: notification.messageId, posted: 0, suppressed: true });
        continue;
      }

      const channels = matchSubscriptions(notification, subscriptions);
      if (channels.length === 0) {
        await markProcessed(notification.messageId);
        results.push({ messageId: notification.messageId, posted: 0 });
        continue;
      }

      const documents = await fetchDocuments(notification);
      const matter = {
        fileNumber: notification.recordNumber ?? '',
        title: notification.subject,
        matterText: notification.bodyText ?? '',
        attachments: [],
      };
      const summary = await generateBilingual(matter, documents);

      const cardByLanguage = new Map();
      const cardFor = (language) => {
        if (!cardByLanguage.has(language)) {
          cardByLanguage.set(language, buildNotificationCard({ notification, summary, language }));
        }
        return cardByLanguage.get(language);
      };

      for (const channel of channels) {
        const language = languageByChannel.get(channel) === 'es' ? 'es' : 'en';
        await postCard(channel, cardFor(language));
      }

      await markProcessed(notification.messageId, { en: summary.en, es: summary.es });
      results.push({ messageId: notification.messageId, posted: channels.length });
    } catch (err) {
      logger?.error?.(`civic notification failed for ${notification.messageId}: ${err.message}`);
      results.push({ messageId: notification.messageId, posted: 0, error: err.message });
    }
  }

  return results;
}
