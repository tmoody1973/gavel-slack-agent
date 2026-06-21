// MOO-152: publish the Gavel user guide to a Slack Canvas (bot-owned, needs
// canvases:write/read). First run creates the canvas and prints its id + permalink;
// pass that id back as an arg to UPDATE the same canvas in place (stable URL).
//
//   node scripts/publish-guide-canvas.mjs            # create
//   node scripts/publish-guide-canvas.mjs F0BBXXXX   # edit existing
//
// The permalink is what GAVEL_GUIDE_URL / the help modal's "Full guide" button points to.
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

const tok = process.env.SLACK_BOT_TOKEN;
const existingCanvasId = process.argv[2];

// Demo/seeded channels whose members should be able to read the guide.
const SHARE_CHANNELS = ['C0BAPMK6HE2']; // #clarke-square (add more as needed)

const MARKDOWN = `# Gavel — User Guide

**Gavel watches Milwaukee city hall and comes to *you*.** It reads every committee agenda, permit, and property record, translates the legalese into plain English (and Spanish) *before* the vote, and posts it in your Slack channel — unprompted. You don't have to ask, log in to a city portal, or know what a "Class B Tavern license revocation" means.

This guide is organized by who you are.

## Judges & first-time testers — start here
A 2-minute path that shows the whole thing:
1. Open a seeded channel — *#clarke-square* (Spanish) or *#sherman-park*. Scroll up: Gavel has already posted plain-English/Spanish **alerts** about real Milwaukee agenda items, each with a *"How to be heard"* footer.
2. Type \`/gavel help\` — a role-aware guide opens; switch personas with the buttons.
3. Ask in a thread — *"what did the committee say about the Punta Cana license?"* → real quote + who said it + a ▶ timestamped clip.
4. \`/gavel video\` lists searchable footage; \`/gavel stories\` ranks what's newsworthy.

## If you're a resident or neighborhood association
*Know what's coming to your block before it's decided — and how to be heard.*
- Make sure Gavel is in your channel (\`/invite @Gavel\`); subscribe it to your committees/topics.
- \`/gavel watch 2000 S 13th St\` (or a file number or name) — Gavel pings the channel when it moves.
- Reply in any alert's thread or DM Gavel — *"what's coming up this week?"* — answered in your language.
- \`/gavel status\` shows this channel's committees, topics, and language.
- Every alert tells you *when and where* the hearing is and *how to comment*.

## If you're an organizer
*Organize across neighborhoods — in Spanish, with the city's records doing the legwork.*
- Set a channel to Español and every card is **written** in Spanish (not machine-translated).
- Ask Gavel about an address → ownership, parcel, and recent permits from city records.
- Community-memory bridge: when your group discusses something that lands on the agenda, Gavel connects the two.
- \`/gavel watch <owner|developer|address>\`; Gavel escalates when an item nears a final vote.

## If you're a reporter
*Cover city hall faster — leads, dossiers, and receipts with the quote, the speaker, and the clip.*
- \`/gavel stories [committee|topic]\` — ranked by money, accountability, and procedural anomalies.
- **📋 Brief me** on any lead → angle + sponsor + history + the video moment + the outcome, one screen.
- Ask *"what did the committee say about X"* → the **quote**, the **speaker** (named when identifiable), and a **▶ timestamped clip**. \`/gavel video\` browses what's searchable (🔍).
- Ask a zoning question about a parcel → the relevant code sections. Gavel never invents a quote.

## How Gavel works
Gavel is **not a chatbot** — it fires alerts *unprompted*, fusing three memories: (1) official civic records (Legistar + property/permits), (2) the public spoken record (meeting transcripts + video, searchable with quote/speaker/timestamp), and (3) your community's own discussion — queried *live* and **never stored** (a deliberate Slack-ToS-respecting design).

## Commands
- \`/gavel help\` — open this guide in Slack
- \`/gavel watch <file # / address / name>\` — alert this channel when it appears
- \`/gavel unwatch <entity>\` — stop watching
- \`/gavel status\` — this channel's committees, keywords, language, watches
- \`/gavel stories [committee|topic]\` — ranked story leads (reporters)
- \`/gavel video [committee]\` — browse meeting video you can watch and search

You can also just talk to Gavel — reply in any alert's thread or DM it.

_Bilingual (EN/ES) copy is pending a native-Spanish-speaker review. Sourced live from Milwaukee's official Legistar records._
`;

const api = async (method, body) => {
  const r = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json; charset=utf-8', Authorization: `Bearer ${tok}` },
    body: JSON.stringify(body),
  });
  return r.json();
};

async function main() {
  if (!tok) throw new Error('SLACK_BOT_TOKEN missing');
  let canvasId = existingCanvasId;

  if (canvasId) {
    const edited = await api('canvases.edit', {
      canvas_id: canvasId,
      changes: [{ operation: 'replace', document_content: { type: 'markdown', markdown: MARKDOWN } }],
    });
    if (!edited.ok) throw new Error(`canvases.edit failed: ${edited.error}`);
    console.log(`✓ edited canvas ${canvasId}`);
  } else {
    const created = await api('canvases.create', {
      title: 'Gavel — User Guide',
      document_content: { type: 'markdown', markdown: MARKDOWN },
    });
    if (!created.ok) throw new Error(`canvases.create failed: ${created.error}`);
    canvasId = created.canvas_id;
    console.log(`✓ created canvas ${canvasId}`);
  }

  // Make it readable by the seeded demo channels' members — a publish that nobody can
  // open is a failed publish, so fail loudly (consistent with create/edit above).
  const access = await api('canvases.access.set', {
    canvas_id: canvasId,
    access_level: 'read',
    channel_ids: SHARE_CHANNELS,
  });
  if (!access.ok) throw new Error(`canvases.access.set failed: ${access.error}`);
  console.log('✓ set read access for demo channels');

  // The canvas is a file object; files.info would carry the permalink — but it needs
  // files:read (not granted), so treat it as best-effort: a non-200 or app error just
  // yields the fallback note. The permalink is informational; absence isn't fatal.
  const permalink = await fetch(`https://slack.com/api/files.info?file=${canvasId}`, {
    headers: { Authorization: `Bearer ${tok}` },
  })
    .then((r) => (r.ok ? r.json() : { ok: false, error: `http ${r.status}` }))
    .then((info) => info?.file?.permalink ?? `(no permalink — ${info.error ?? 'unknown'}; needs files:read)`)
    .catch((e) => `(files.info errored — ${e.message})`);

  console.log('\ncanvas_id:', canvasId);
  console.log('permalink:', permalink);
  console.log('\nSet GAVEL_GUIDE_URL to the permalink (or hardcode it in help/guide.js).');
}

main().catch((err) => {
  console.error('publish-guide-canvas FAILED:', err.message);
  process.exitCode = 1;
});
