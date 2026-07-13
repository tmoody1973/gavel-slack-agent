# Gavel — YouTube Title & Description

_For the 2:57 demo video (`demo-video/render/gavel-demo.mp4`)._
_Companion to `DEVPOST-DESCRIPTION.md` — same facts, same voice, shorter._

> ⚠️ **Set visibility to UNLISTED, not Private.** Private = judges hit a sign-in wall and score you on
> nothing. After uploading, open the link in an incognito window (logged out) and confirm it plays.

---

## Title

Pick one. All are under YouTube's 100-char limit.

**A — the story (recommended).** Leads with the euphemism; that's the hook, and it's true.

```
The city called it a "computational research facility." Gavel called it a data center.
```

**B — the product.** Clearer about what it is, less of a hook.

```
Gavel: a Slack agent that tells your neighborhood what City Hall is about to do — before the vote
```

**C — the problem.** Blunt, fits the "lead with the pain" rule.

```
City Hall publishes everything. Nobody reads it. The vote happens. You find out after.
```

---

## Description

Paste everything below the line into the YouTube description box.

---

The city's filing never called it a data center. It called it a "computational research facility."

The neighborhood around a vacant Walmart on Milwaukee's north side figured it out anyway. They packed
a seven-hour hearing. The developer dropped the data center. They won — but they had to do all of it
in the dark.

Gavel is so the next block doesn't have to.

**What it is:** a proactive Slack agent for neighborhood associations. It watches Milwaukee city
government — agendas, property records, meeting video — and posts what's coming to your block before
the vote, in plain English and in Spanish. It is not a chatbot. Nobody asks it anything. It just
shows up.

**What you're watching (all live, against the deployed agent):**
- 0:12 — Milwaukee's actual public record: 46 meetings, "Minutes: not available. Video: not available."
- 0:28 — the alert lands unprompted. Plain English, Spanish, the hearing date, and the local reporting.
- 0:49 — someone asks "didn't we already push back on this?" Gavel answers with the official record
  AND what this neighborhood already said — queried live through Slack's Real-Time Search API, and
  never stored.
- 1:10 — "Who owns 5825 W Hope Ave?" → AFS Milwaukee LLC, pulled from the property record.
- 1:19 — Milwaukee publishes video of these meetings, not transcripts. So Gavel transcribed the
  hearing, found the moment, and clipped it. You hear the commission read "computational research
  facility" into the record.
- 2:00 — a neighbor asks in Spanish, Gavel answers in Spanish, then drafts her public comment. She
  edits it. She sends it. A human is always in the loop.

**The architecture (2:19):** three memories, one agent. The official record (a custom MCP server over
Milwaukee's Legistar + property data). The public spoken record (meeting transcripts, zoning code).
And the community's own memory — live, through Slack's Real-Time Search.

It indexes the public record. It queries the private one live, and never stores it. Take Real-Time
Search away and Gavel either goes deaf to its own neighborhood, or it starts warehousing people's
messages. That's not a feature bolted on — it's why the architecture is shaped like this.

**Honest disclosures, said out loud in the video:**
- The alert is fired manually so it lands on camera. In production it's a five-minute cron.
- The neighbor messages are real, documented sentiment from local reporting, posted fresh — Slack
  can't backdate.
- Gavel cut the video clip, but it was posted ahead of recording. In production, Granicus blocks our
  cloud host's IP for media, so it degrades to a timestamped deep link — which is exactly what you
  see it do on camera.
- The public comment goes to a test inbox. Never a real city clerk.

Milwaukee runs on Legistar. So do three hundred other cities. The Milwaukee Civic MCP server is open
source today.

I sit on the commission that votes on this. I watch people find out after.

Gavel is how they find out before.

---

Built for the Slack Agent Builder Challenge (Agent for Good).
Stack: Slack Bolt + Real-Time Search API · a custom Milwaukee Civic MCP server (Legistar + city
property data) · Claude · Convex (vector search) · Deepgram · Fly.io

🔗 Devpost: [add link]
🔗 Code: [add repo link]

#SlackAgentBuilderChallenge #AgentForGood #CivicTech #Milwaukee #OpenSource

---

## Notes for Tarik

- **Timestamps above are approximate** — YouTube auto-links any `M:SS` in the description as chapters
  once the video is processed. Scrub the uploaded video and correct any that are off by more than a
  couple of seconds; a wrong chapter marker is worse than none.
- **The first two lines are what shows** in the collapsed description and in search results. They're
  the euphemism and the win. Don't bury them.
- **Read the first three paragraphs out loud.** Same rule as the Devpost copy — if it doesn't sound
  like you talking to a neighbor, change it.
