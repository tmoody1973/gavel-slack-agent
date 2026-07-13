# Gavel: the Slack Agent for City Hall — Devpost sections

> Read this out loud before you paste it. Anywhere it doesn't sound like something you'd say to a
> neighbor, change it. **Inspiration especially is yours.** I wrote it from your facts, but a judge can
> tell the difference between a story someone lived and a story someone generated. Two minutes of your
> own words there beats anything I can write.
>
> Delete this box before pasting.

---

## Inspiration

I sit on Milwaukee's City Plan Commission. I'm the guy on the other side of the table, and I watch
people find out too late. Every meeting.

This spring a data center was headed for a vacant Walmart on Hope Avenue, right next to people's
houses. The city's own filing never used the words "data center." It called it a "computational
research facility."

The neighborhood worked it out anyway. They read the filing, they figured out what the phrase meant,
they packed a seven-hour hearing, and they sent more than 270 letters. In July the developer dropped
the data center from the plan. They won.

But look at what winning cost them. It took a handful of people teaching themselves to read municipal
zoning code. Most blocks don't have those people. Most blocks find out after.

That's the whole reason Gavel exists. The information was public the entire time. Public and useless,
because nobody can read it.

## What it does

Gavel is a Slack agent that watches Milwaukee city government and posts to your neighborhood's channel
before the vote, in plain English and in Spanish.

It is not a chatbot. Nobody asks it anything. It reads the city's agenda system on a five-minute cron,
and when something lands that touches your block, it shows up on its own: what the item is, why it
matters to you, when the hearing is, and how to speak at it. It pulls the local reporting onto the same
card, so you get the fight and the coverage in one place.

Then you can talk to it.

Ask "didn't we already push back on this?" and it answers with the official record *and* with what your
own neighbors already said, pulled live out of your Slack history. Ask who owns the parcel and it reads
the city property record: AFS Milwaukee LLC. Ask what the commission actually called the thing on
June 29 and it searches its transcript of the hearing, because Milwaukee publishes video of these
meetings but not transcripts. What gets said in that room is, in practice, unsearchable. So we made it
searchable.

The last step is the one that matters. Gavel drafts your public comment, in your position and your
words, ready to file before the hearing. You edit it. You send it. A human is always in the loop. (In
the demo it goes to a test inbox, never a real clerk.)

## How we built it

The load-bearing idea is that a civic agent needs three different kinds of memory, and they cannot be
the same kind.

The official record is structured. It lives behind a custom Milwaukee Civic MCP server we wrote, which
wraps the city's Legistar API and its open property, permit, and zoning data. That server is open
source and it works for any of the roughly 300 cities running Legistar.

The spoken record is unstructured. We pull the Granicus webcast of a hearing, run it through Deepgram
with speaker diarization, chunk the transcript, and store the vectors in Convex alongside the city's
zoning code. Two namespaces, different chunking, because a zoning ordinance and a room full of people
arguing do not chunk the same way.

The community's record is private, and this is where most of our design decisions came from. Your
neighbors' Slack messages are not ours to keep. So Gavel never stores them. It queries them live
through Slack's Real-Time Search API at the moment you ask, uses what it finds, and keeps nothing.

That gives us one rule that shaped everything: Gavel indexes the public record and queries the private
one live. We rejected a memory layer that would have persisted Slack content, because storing a
community's conversations to make a demo look smarter is not a trade we were willing to make.

The rest is Slack Bolt in Socket Mode, Claude for summarizing and drafting and tool routing, and
Fly.io running the poller and the agent. TypeScript throughout. 927 tests.

The bilingual part is worth calling out, because it's not what people expect. There is no translation
API. Claude writes the Spanish natively, with a civic glossary in the prompt, and the English and
Spanish sit on the same card. Translated civic English reads like translated civic English. Written
Spanish reads like Spanish.

## Challenges we ran into

**The city's data doesn't want to be used this way.** Legistar has no geocoded fields anywhere. None.
There is a topic-tag vocabulary, 854 terms, and it looked perfect until we realized items only get
tagged when they're *enacted*, which is exactly too late for an agent whose entire job is to warn you
beforehand. There are eleven extended-text fields that are simply empty in Milwaukee. So Claude reads
the title, pulls the address out of the prose, and the Census geocoder resolves it. Half of this
project is working around the fact that the public record was built for staff, not for the public.

**Granicus blocks our server.** The clip tool works. We tested it, it ships. But Granicus 403s our
cloud host's IP for media, so in production Gavel can't fetch the video from Fly. Rather than fake it,
we made it degrade honestly: it hands you a timestamped link straight into the city's own player. The
demo video says so out loud.

**Passing tests lied to us.** Our comment drafter had 25 green tests. Then we watched a real user click
the button and the drafted comment came back as the literal string `[object Object]`. The test fake
returned a string. The real Claude boundary returns a parsed object, because it applies a JSON schema.
Every unit test passed while the flagship feature was broken in production for every user.

**Silence reads as broken.** We found this the same way: a person replies to Gavel's alert card in the
thread, which is the most natural thing in the world, and the agent said nothing back. It only engaged
if the thread had been "primed" by a button first. A judge would have replied to the card, gotten
nothing, and reasonably concluded the whole thing was dead.

We only caught both of those because we recorded the demo against the live deployment instead of
against a mock.

## Accomplishments that we're proud of

The Milwaukee Civic MCP server is a real artifact. It's open source today, and it works for any city
on Legistar, which is most of them. That's the piece that outlives the hackathon.

Gavel doesn't store anybody's messages, and it still knows what the neighborhood said. Those two things
were supposed to be in tension and they aren't. That's the compliance claim and the product claim at
the same time, and I'll defend it in front of any lawyer.

The Spanish is written, not translated.

And the thing I keep coming back to: when we asked Gavel what the commissioners said when they voted to
hold the file, it told us the transcript only had staff quotes, not the commissioners' own words, and
that it wasn't going to put words in their mouths. It offered to pull the video instead. Nobody
prompted that. An agent that says "the record doesn't support that" is worth more to a neighborhood
than one that always has an answer.

## What we learned

Green tests are not evidence. They're evidence that your fakes agree with your code. The only thing
that told us the truth was driving the real deployment and watching what a real person would see.

Also: the interesting problem in civic tech is not the data. The data is public. The interesting
problem is that "public" and "readable" are completely different words, and the gap between them is
where people lose their neighborhoods. Milwaukee published every fact about that data center, on time,
in full. It still took a seven-hour hearing and 270 letters for anyone to find out.

## What's next for Gavel: the Slack Agent for City Hall

The fight isn't over in Milwaukee. The neighborhood beat the data center on their block, but File
#260142, the ordinance setting the rules for data centers everywhere in the city, is still sitting on
the July 20 agenda. Most of the city has no idea. That's the first thing Gavel is going to keep
watching.

After that it's other cities. Legistar is the same API in about 300 of them, and the MCP server is
already parameterized by city. Milwaukee was the hard one because we had to learn what was missing.

The other direction is reporters. Everything a neighborhood association needs is also what an
under-resourced newsroom needs, except they need it across every committee at once instead of one
block. Watchlists, a weekly digest, a way to be told when a long-running story comes back to committee.
Milwaukee has lost a lot of local coverage. The meetings didn't stop.

---

## Built With

_Paste the tags into Devpost's "Built With" field. Judges check this field to confirm track
eligibility, so the three qualifying technologies are listed first and by their exact names._

**Slack Real-Time Search (RTS) API** · **Model Context Protocol (MCP)** · **Slack AI / agent surface**
· slack-bolt · socket-mode · anthropic-claude · claude-agent-sdk · convex · deepgram · elevenlabs ·
fly.io · node.js · javascript · legistar-api · ckan · census-geocoder · ffmpeg · playwright · biome

### How each qualifying technology is actually used

**Real-Time Search API.** `community-memory/rts-client.js` calls `assistant.search.context` directly,
with a user token carrying `search:read.public`. This is what lets Gavel answer "didn't we already push
back on this?" with the neighborhood's own words. It is also the reason we can promise the community's
messages are never stored: Gavel queries them live at the moment you ask and keeps nothing. Take RTS
away and the agent either goes deaf to its own neighborhood or starts warehousing people's
conversations. The whole architecture is shaped around not having to make that choice.

**MCP.** Three servers are registered in `buildAgentOptions()`:

- `milwaukee-civic` — **an MCP server we wrote**, not one we consumed. It wraps Milwaukee's Legistar
  API plus the city's open property, permit, and zoning data, and exposes them as agent tools. It is
  open source, and it is parameterized by city, so it works for the roughly 300 municipalities running
  Legistar. This is the piece that outlives the hackathon.
- `community-memory` — an SDK MCP server that wraps the RTS call above as a tool the agent can reach
  for on its own.
- `slack-mcp` — Slack's hosted MCP server over HTTP, used as the fallback search path when RTS is
  unavailable.

**Slack AI / agent surface.** Gavel is built as an agent, not a bot that posts messages.
`assistant_thread_started` fires `setSuggestedPrompts` with four one-click questions, each one hitting
a different memory. `setStatus` drives the visible "Thinking…" tool trace while it works, and
`sayStream` streams the answer in word by word rather than dropping a finished block. Receipts (the
sources it grounded on) attach underneath. It also handles `app_mention` and DMs, and reply-in-thread
on any of its own messages.
