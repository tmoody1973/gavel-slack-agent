# Discovery — Milwaukee Turners

_Interview target: [Milwaukee Turners](https://www.milwaukeeturners.org/) — Milwaukee's oldest civic organization (est. 1853), "Working for social justice since 1853."_
_Companion to [nonprofit-outreach.md](./nonprofit-outreach.md) (the general guide). This file tailors the explainer and adds Turners-specific probes._

## Who they are (context for the interview)

- **Mission language to mirror:** *"A deep concern for social reform and a relentless pursuit of honest and open democratic government has long been central to the Milwaukee Turners."* Core values: liberty, tolerance, reason, justice. Vision: "a diverse community … that confronts injustice; and fosters wellness, community restoration, and civic empowerment."
- **Civic / justice programs (Gavel-relevant):** Confronting Mass Incarceration · Zero Youth Corrections · **Vel Phillips Forum** (civic engagement) · Legal Observing & Know Your Rights · Jane's Walk MKE.
- **Also:** wellness/gymnasium programming, Turner Hall (historic building; Ballroom run by Pabst Theater Group), peer support / harm reduction.
- **Who they serve:** Milwaukee residents broadly — members + the public, not a single neighborhood.

> **Key reframe:** The Turners are a **civic-transparency & criminal-justice** organization, not a neighborhood association chasing rezonings. Lead with *honest, open government* and *mass incarceration*, **not** displacement/zoning. Their relevant government bodies skew toward **Milwaukee County** (jail / House of Correction / Community Reintegration Center, County Board) and the **Fire & Police Commission**, alongside the Common Council.

---

## Part 1 — Tailored explainer (hand this to them)

**Open with their own words:** *"You've described the Turners' work as a relentless pursuit of honest and open democratic government. Gavel is a tool built for exactly that pursuit."*

**Gavel in one line:** a helper that watches local government for you and surfaces what's about to be decided — in plain language, before the vote — so the public can actually show up while it still matters.

**Why it fits the Turners:**

- **Honest, open government.** Government is "open" on paper — agendas are posted, meetings are public — but the substance is buried in file numbers, legalese, and four-hour videos. Gavel reads all of it daily and posts a plain-English heads-up *before* the vote, with the hearing date, how to give public comment, and who to contact. It turns "technically public" into "actually known."
- **Confronting Mass Incarceration / Zero Youth Corrections.** Tell Gavel to watch the bodies that drive these decisions — the County Board, the jail / House of Correction, the Community Reintegration Center, public-safety budgets, the Fire & Police Commission. When a relevant item hits an agenda, Gavel flags it early enough to organize around.
- **Vel Phillips Forum / civic engagement.** Gavel can feed timely, plain-language briefs on what the city and county are about to do — raw material for forums, member alerts, and turnout.
- **Track specific things.** Watch a contractor, a policy, a budget line, or an official's votes, and get pinged whenever it surfaces anywhere in city or county filings.
- **Institutional memory.** When an issue resurfaces, Gavel can recall what your group said or did last time — so 170 years of civic muscle memory isn't trapped in one person's head.

**About privacy:** Gavel reads the *public* government record. It can look things up in your own group's history when you ask, but it **never copies, stores, or shares your internal messages.**

**The honest version:** Gavel doesn't do the organizing — it removes the part where you find out too late. It's the tireless volunteer who reads every agenda so your members don't have to.

> ⚠️ **Be transparent in the interview:** our current hackathon demo is built on **city zoning** data (Plan Commission, Licenses). The *same engine* extends to county + criminal-justice + police-oversight bodies, but that's a build decision their answers will inform — don't imply it already does this today.

---

## Part 2 — Turners-specific questions

Use the **general guide's** Sections A–G first (current workflow, pain, tools, action, memory, adoption, open). Then add these:

### H. Which government do they actually watch?
*(Gap: city-zoning demo vs the county / criminal-justice / police-oversight bodies they likely care about.)*
1. Which government bodies matter most to your work — Common Council, **County Board**, **Fire & Police Commission**, the jail / House of Correction, MPS board, the courts?
2. For Confronting Mass Incarceration and Zero Youth Corrections, what decisions or meetings do you try to stay ahead of? How do you track them today?
3. How much of what you care about is **county** vs **city** government?

### I. The Vel Phillips Forum & civic engagement
*(Gap: is Gavel an input to their existing programs, or a standalone tool?)*
4. Walk me through how the Vel Phillips Forum decides what to focus on — where does the agenda come from?
5. When you want members to act on something at City Hall or the County, how do you get the word out, and how far ahead?
6. Legal Observing / Know Your Rights — how do you currently learn about the events or policy changes you respond to?

### J. Channel & members  ⚠️ make-or-break
*(Gap: a historic membership org probably doesn't use Slack — this decides the whole delivery model.)*
7. How do members get information from the Turners today — email, newsletter, meetings, social media, text?
8. Does the staff or any committee use Slack, Teams, or a group chat internally? (If not: would the org adopt one, or should this meet you where you already are — email/newsletter?)
9. Who would actually receive and act on these alerts — staff, a committee, a volunteer, the whole membership?

### K. Capacity & decision-making
*(Gap: who's the champion and is there bandwidth?)*
10. Who, if anyone, currently keeps an eye on government meetings for the Turners? Paid or volunteer? Hours a week?
11. Who decides whether the Turners adopt a new tool like this?
12. If this saved that person several hours a week, what would they do with the time?

---

## Part 3 — Interview notes

> Use the **notes template in [nonprofit-outreach.md](./nonprofit-outreach.md) (Part 3)**, plus capture these Turners-specific gaps:

```
### Milwaukee Turners — [Date] · [Interviewee role]

— Government focus (H)
City vs county split:
Bodies they watch (Council / County Board / FPC / HOC / MPS / courts):
How they track mass-incarceration / youth-corrections decisions today:

— Programs (I)
How Vel Phillips Forum sets its agenda:
How/when they mobilize members:
How they hear about legal-observing events:

— Channel (J)  ⚠️ make-or-break
How members get info today:
Internal Slack/Teams/chat? :
Slack viable, or must this be email/newsletter? :
Who receives + acts on alerts:

— Capacity (K)
Who watches government now (paid/volunteer, hrs/wk):
Tool-adoption decision-maker:

— GAPS IDENTIFIED
Channel gap (Slack vs email/newsletter):
Scope gap (need county? FPC? criminal-justice bodies?):
Feature to add:
Feature to cut/de-prioritize:
Assumption proven wrong:
Would they pilot it? (Y/N/Maybe — why):
Follow-up promised:
```

---

## For our build (read after the interview)

Two findings here would directly reshape the roadmap:
- **If they need county / FPC / criminal-justice coverage** → that's a scope expansion beyond the city-zoning demo (county = a Legistar client flip; FPC is a city body already in scope). Worth a Linear issue if confirmed.
- **If they're not on Slack** → Gavel-for-Turners needs an **email/newsletter digest** delivery path, not the Slack-channel model. That's a significant architectural branch (the hackathon ships Slack; this would be a post-hackathon or parallel surface).
