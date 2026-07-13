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
// #general is the demo channel judges land in; #clarke-square is the Spanish one.
const SHARE_CHANNELS = ['C0B8KS5VCCC', 'C0BAPMK6HE2'];

const MARKDOWN = `# Gavel — User Guide

**Gavel watches Milwaukee city hall and comes to *you*.** It reads every committee agenda, permit, and property record, translates the legalese into plain English (and Spanish) *before* the vote, and posts it in your Slack channel — unprompted. You don't have to ask, log in to a city portal, or know what a "Class B Tavern license revocation" means.

This guide is organized by who you are.

## 🧪 Judges & first-time testers — start here

**The 60-second path.** It follows the demo video, and every answer below is generated live — nothing is canned. Each step hits a *different* memory, so doing all five tours the whole agent.

**1. See the alert nobody asked for.** Open *#general*. Gavel posted a bilingual card about a real item on the **July 20 City Plan Commission** agenda: a data center in the old Midtown Walmart (File #260030). Plain English, Spanish, the hearing date, and the local reporting — all on one card.

**2. Ask the question that shows what's different.** *Reply directly in that card's thread* (or hit 💬 **Ask Gavel** first — either works):
> *Didn't we already push back on this?*

It answers with the **official record** *and* **what this neighborhood already said** — pulled live from your own Slack history through the **Real-Time Search API**, and never stored. That's the whole design: Gavel indexes the public record and queries the private one live.

**3. Ask who's actually behind it.** In the same thread:
> *Who owns 5825 W Hope Ave?*

→ **AFS Milwaukee LLC**, straight from the city's property record via our custom Milwaukee Civic MCP server.

**4. Ask what they *said*, not what they filed.** Milwaukee publishes meeting *video*, not transcripts — so what's said in the room is effectively unsearchable:
> *What did the Plan Commission actually call it on June 29?*

Gavel searches its transcript of the hearing. (Watch it decline to put words in commissioners' mouths when the record doesn't support it — that's deliberate.)

**5. Close the loop — act.** Hit ✍️ **Make my voice heard** on the card. Gavel drafts your public comment; you edit it and send it. 🧪 **Demo mode: it goes to a test inbox, never a real city clerk.**

**Other ways in:** DM Gavel · @mention it in any channel · open it from the sidebar for the **App Home** (there's a test script at the top) · the assistant thread opens with four one-click prompts · \`/gavel help\` for the full command list.

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
