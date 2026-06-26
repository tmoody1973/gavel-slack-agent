// agent/news/article-shape.js
// Single source of truth for the cached/surfaced article fields — imported by the service and
// mirrored by the Convex validator so the two can't drift.
export const ARTICLE_FIELDS = Object.freeze(['title', 'url', 'source', 'publishedAt']);
