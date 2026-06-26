// agent/news/normalize.js
// Shape a RawArticle into the federated /gavel search result row (same contract as
// civicmail/federated-card.js normalizers). headline is a Slack link; snippet is always null —
// Gavel shows the reporter's headline and a link, never its own summary of their work.

/** Format an RFC-822 pubDate (or any date string) as a short YYYY-MM-DD, or null. */
function shortDate(value) {
  if (!value) return null;
  const ms = Date.parse(value);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * @param {{ title: string, url: string, source?: string|null, publishedAt?: string|null }} article
 * @returns {{ source: 'news', headline: string, meta: string|null, snippet: null, messageId: null }}
 */
export function normalizeNews(article) {
  const meta = [article.source, shortDate(article.publishedAt)].filter(Boolean).join(' · ') || null;
  return {
    source: 'news',
    headline: `<${article.url}|${article.title}>`,
    meta,
    snippet: null,
    messageId: null,
  };
}
