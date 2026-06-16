// MOO-55 zoning ingest (run-once, idempotent). Download Ch.295 PDFs → extract
// text (pdfjs) → structure-aware chunk → OpenAI embed → upsert to Convex.
// Run: node scripts/ingest-zoning.mjs
import { readFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { api } from '../convex/_generated/api.js';
import { chunkSections } from '../zoning/chunk.js';
import { embedTexts } from '../zoning/embed.js';
import { CH295_SOURCES } from '../zoning/sources.js';

const UA = 'gavel-slack-agent (tarik@radiomilwaukee.org)';
const TABLE_FALLBACK = new URL('../data/zoning/ch295-table.md', import.meta.url);

async function extractPdfText(buffer) {
  const doc = await getDocument({ data: new Uint8Array(buffer), useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n');
}

async function loadSourceText(source) {
  const res = await fetch(source.url, { headers: { 'User-Agent': UA } });
  if (!res.ok) {
    console.warn(`SKIP ${source.file}: HTTP ${res.status}`);
    return null;
  }
  const text = await extractPdfText(await res.arrayBuffer());
  // Table fallback: if the table PDF extracted with too little text, use the
  // hand-captured markdown (one artifact).
  if (source.scope === 'table' && text.replace(/\s+/g, '').length < 400) {
    console.warn(`Table ${source.file} extracted thin — using ch295-table.md fallback`);
    return readFile(TABLE_FALLBACK, 'utf8');
  }
  return text;
}

async function main() {
  const convexUrl = process.env.CONVEX_URL;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!convexUrl || !apiKey) throw new Error('CONVEX_URL and OPENAI_API_KEY are required');
  const convex = new ConvexHttpClient(convexUrl);

  let total = 0;
  for (const source of CH295_SOURCES) {
    const text = await loadSourceText(source);
    if (!text) continue;
    const chunks = chunkSections(text, {
      parent: source.parent,
      family: source.family,
      scope: source.scope,
      sourceUrl: source.url,
    });
    if (chunks.length === 0) {
      console.warn(`SKIP ${source.file}: no sections parsed`);
      continue;
    }
    const vectors = await embedTexts(
      chunks.map((c) => c.text),
      { apiKey },
    );
    for (let i = 0; i < chunks.length; i++) {
      await convex.mutation(api.zoning.upsertChunk, { ...chunks[i], embedding: vectors[i] });
    }
    total += chunks.length;
    console.log(`${source.file}: ${chunks.length} chunks`);
  }
  const count = await convex.query(api.zoning.count, {});
  console.log(`\nDone. Upserted ${total} chunks this run; ${count} total in zoningChunks.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
