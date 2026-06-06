# Gavel — Nonprofit Outreach & Discovery Guide

_Use this to introduce Gavel to a neighborhood association, CDC, or community org, then interview them to find the gaps between our assumptions (Denise / Marcos / Rachel) and their real needs._

---

## Part 1 — Gavel, in plain English (hand this to them)

**The one-liner:** Gavel is a helper that lives inside your Slack and watches city hall for you — so your group finds out about decisions affecting your neighborhood *before* they happen, not after.

**The problem it solves.** Every big decision about your neighborhood — a rezoning, a demolition, a new liquor license, a land sale — is technically "public." But in practice it's buried in a file number, written in legal jargon, posted a few days before a weekday-afternoon meeting, and discussed somewhere inside a four-hour video. By the time anyone notices, the vote already happened. Keeping up is a part-time job nobody has time for.

**How it works, from your side:**

1. **It watches, you don't have to.** Gavel quietly checks the city's agendas, property records, and permits every day. You set it up once to care about your committees and neighborhood.
2. **It posts a plain-English heads-up in your Slack channel.** When something relevant comes up, Gavel drops a short card: *"Tuesday's Zoning Committee will vote on rezoning 2700 W. Wisconsin from homes to commercial. In plain English: this would let the lot become a store or office."* No legalese.
3. **It tells you how to act.** Every alert includes the hearing date and time, where it is, how to register to speak, and your alderperson's contact info — so information turns into action.
4. **It speaks Spanish too.** If your community is bilingual, the same alert comes in both English and Spanish on one card — written naturally, not machine-translated.
5. **You can just ask it questions.** Type things like *"Who owns this property?"*, *"What could they build if this passes?"*, or *"Didn't we fight this developer before?"* — and it pulls the answer from city records **and** your own group's past Slack conversations.
6. **It can watch specific things for you.** Tell it to track a developer or company, and it'll ping you any time that name shows up anywhere in city filings.
7. **A weekly summary.** One Sunday post: "Here's what's coming up this week, and the one item that needs your attention."

**What you need:** a Slack workspace (the free version works). That's it — no new software to learn, no website to check.

**About your privacy:** Gavel reads the *public* city record. It can look things up in your group's Slack history when you ask, but it **never copies, stores, or shares your messages.** Your conversations stay yours.

**The honest version:** Gavel doesn't replace your judgment or organizing — it removes the part where you find out too late. It's the tireless volunteer who reads all 40 pages of the agenda so you don't have to.

---

## Part 2 — Discovery interview guide

**Goal:** find the gap between our assumptions and their reality — which features matter, which we over-built, and what we missed entirely.

**Two rules while interviewing:**
- **Ask about the past, not the future.** "Tell me about the *last time* you found out about a decision too late" beats "Would you use a tool that alerts you?" People are unreliable about hypotheticals and polite about your idea.
- **Don't pitch until the end.** Every minute you talk about Gavel is a minute you're not learning. Save Part 1 for after the questions.

### A. Their world & current workflow
*(Gap: is our core assumption — that monitoring is painful — even true for them?)*
1. Walk me through how your group finds out about city decisions that affect your neighborhood today.
2. Whose job is that, informally? How much time does it take them in a week?
3. Tell me about the last time you found out about something *after* it was decided. What happened?
4. When you do catch something in time, how does that usually happen — who tipped you off?

### B. Pain & stakes
*(Gap: which pain is sharpest — discovery, comprehension, language, or acting in time?)*
5. What kinds of decisions matter most to your members — zoning, demolitions, licenses, budgets, something else?
6. When you get an agenda or a city document, what's the hardest part about using it?
7. Has language ever been a barrier for your members to participate? Tell me about that.
8. What's the most frustrating part of trying to show up and be heard at a meeting?

### C. Tools & communication
*(Gap: do they even use Slack? If not, the whole delivery model needs rethinking — make-or-break.)*
9. Where does your group actually communicate day to day — Slack, WhatsApp, email, Facebook, text, in person?
10. If I said "we'd put this in Slack," what's your reaction? Does your group live there, or somewhere else?
11. What tools have you tried for this kind of thing before? What made you stop using them?

### D. Action & outcomes
*(Gap: is "awareness before the vote" the actual goal, or is it turnout / public comment / relationships?)*
12. When you *do* find out in time, what do you actually do next? What does a win look like?
13. What stops members from showing up or commenting, even when they know about a meeting?
14. Have you ever tracked a specific developer, landlord, or company across multiple projects? How?

### E. Memory & history
*(Gap: tests the community-memory feature — do they value their own past discussions, or is that our idea?)*
15. When a similar issue comes back around, how do you remember what your group said or did last time?
16. Where does your group's institutional memory live — in one person's head, a doc, a thread?

### F. Adoption, capacity & decision-making
*(Gap: who's the buyer/champion, and is there capacity to adopt anything new at all?)*
17. Who decides whether your group adopts a new tool? How does that decision get made?
18. Realistically, how much setup time could your group spare for something like this — minutes, an afternoon?
19. What would make something like this *not* worth it for you?

### G. Open-ended gap finder
*(Gap: catches everything our personas missed.)*
20. If you had a tireless volunteer who could only do *one* city-hall task for you, what would you have them do?
21. What did I not ask about that I should have?

### How to read the answers → build gaps

| If they say… | The gap / signal |
|---|---|
| "We don't really use Slack" | ⚠️ Biggest risk — delivery-channel assumption. May need email/WhatsApp bridge |
| "Comprehension isn't the issue, *time* is" | De-prioritize summaries; prioritize the proactive watch |
| "Language is critical" | Bilingual alerts move from nice-to-have to core |
| "We just want people to show up" | Lean into the "How to be heard" footer + turnout, not data depth |
| "We don't track developers" | Watchlist / ownership-portfolio may be a Marcos-only edge case |
| "Memory lives in one person's head" | Validates the community-memory (RTS) bet |
| "Nobody has time to set anything up" | Onboarding must be near-zero; App Home config may be too much |

---

## Part 3 — Interview notes template

> Copy this block for each interview. Keep answers in *their words* where you can — direct quotes are gold.

```
### Interview — [Org name] · [Date] · [Interviewee role]
Org type:            (neighborhood assoc / CDC / journalist / other)
Size & capacity:     (members, paid staff?, volunteer hours/week)
Neighborhood(s):
Languages:

— Current workflow (Qs 1–4)
How they find out today:
Who does it / time cost:
Last "found out too late" story:

— Pain & stakes (Qs 5–8)
Decisions that matter most:
Hardest part of city docs:
Language barrier story:
Biggest frustration showing up:

— Tools (Qs 9–11)  ⚠️ make-or-break
Where they communicate:
Reaction to Slack:
Past tools tried / why dropped:

— Action & outcomes (Qs 12–14)
What they do when they find out in time:
What blocks turnout:
Track developers/LLCs today?:

— Memory (Qs 15–16)
How they recall past positions:
Where institutional memory lives:

— Adoption (Qs 17–19)
Who decides on tools:
Setup time they can spare:
What would make it not worth it:

— Open (Qs 20–21)
The one task they'd hand off:
What I should have asked:

— GAPS IDENTIFIED (fill after)
Feature to add:
Feature to cut/de-prioritize:
Assumption proven wrong:
Surprise:
Would they pilot it? (Y / N / Maybe — why):
Follow-up promised:
```
