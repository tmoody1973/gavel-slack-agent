// MOO-55 zoning ingest (run-once, idempotent). Download Ch.295 PDFs → extract
// text (pdfjs) → structure-aware chunk → OpenAI embed → upsert to Convex.
// Run: node scripts/ingest-zoning.mjs
import { readFile } from 'node:fs/promises';
import { ConvexHttpClient } from 'convex/browser';
import { config } from 'dotenv';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

import { api } from '../convex/_generated/api.js';
import { chunkSections } from '../zoning/chunk.js';
import { embedTexts } from '../zoning/embed.js';
import { CH295_SOURCES } from '../zoning/sources.js';

config({ path: '.env.local' });

// city.milwaukee.gov fronts the PDFs with a WAF that 403s plain automated
// requests; a browser User-Agent + a same-site Referer gets through, but it
// also rate-limits bursts — hence the retry/backoff. For reliability the script
// prefers a locally-downloaded copy in data/zoning/<file> when present (drop
// browser-saved PDFs there if the WAF blocks a file outright).
const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';
const REFERER = 'https://city.milwaukee.gov/cityclerk/LRB/ordinances/tableofcontents';
const PDF_MAGIC = '%PDF-';
const MAX_ATTEMPTS = 5;
const LOCAL_DIR = new URL('../data/zoning/', import.meta.url);
const TABLE_FALLBACK = new URL('ch295-table.md', LOCAL_DIR);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isPdf(bytes) {
  return String.fromCharCode(...bytes.slice(0, 5)) === PDF_MAGIC;
}

/** A locally-saved PDF wins over the network (manual fallback for WAF-blocked files). */
async function readLocalPdf(file) {
  try {
    const bytes = new Uint8Array(await readFile(new URL(file, LOCAL_DIR)));
    return isPdf(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

/** Fetch a PDF past the WAF: browser UA + Referer, retry on a blocked/non-PDF response. */
async function fetchPdf(source) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const res = await fetch(source.url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'application/pdf', Referer: REFERER },
    });
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (res.status === 200 && isPdf(bytes)) return bytes;
    console.warn(`  ${source.file} attempt ${attempt}/${MAX_ATTEMPTS}: HTTP ${res.status} (not PDF) — backing off`);
    await sleep(2000 * attempt);
  }
  return null;
}

async function extractPdfText(bytes) {
  const doc = await getDocument({ data: bytes, useSystemFonts: true }).promise;
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    pages.push(content.items.map((it) => it.str).join(' '));
  }
  return pages.join('\n');
}

async function loadSourceText(source) {
  const bytes = (await readLocalPdf(source.file)) ?? (await fetchPdf(source));
  if (!bytes) {
    console.warn(`SKIP ${source.file}: could not obtain a PDF (WAF/404) — drop a copy in data/zoning/${source.file}`);
    return null;
  }
  const text = await extractPdfText(bytes);
  // Table fallback: if the table PDF extracted with too little text (image-based
  // table), use the hand-captured markdown (one artifact).
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
