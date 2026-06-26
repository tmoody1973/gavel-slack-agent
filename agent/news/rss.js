// agent/news/rss.js
// Pure parser for Google News RSS. Hand-rolled (no XML dependency): Google News RSS is a
// stable, flat <item> list. Never throws — returns [] on malformed input so a bad feed can
// never break an alert or a search.

const ENTITIES = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'" };

const decode = (text) =>
  String(text ?? '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&[a-z]+;|&#\d+;/gi, (entity) => ENTITIES[entity] ?? entity)
    .trim();

const tag = (block, name) => {
  const match = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  return match ? decode(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')) : null;
};

/**
 * @param {string} xml
 * @returns {Array<{ title: string, url: string, source: string|null, publishedAt: string|null }>}
 */
export function parseGoogleNewsRss(xml) {
  const text = String(xml ?? '');
  const items = text.match(/<item[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  return items
    .map((block) => ({
      title: tag(block, 'title') ?? '',
      url: tag(block, 'link') ?? '',
      source: tag(block, 'source'),
      publishedAt: tag(block, 'pubDate'),
    }))
    .filter((article) => article.title && article.url);
}
