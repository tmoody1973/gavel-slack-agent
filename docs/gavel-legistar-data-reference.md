# GAVEL — Legistar Web API Data Reference
*Companion to gavel-project-brief.md · Verified June 2026 · Milwaukee client confirmed token-free*

Base URL: `https://webapi.legistar.com/v1/milwaukee`
Format: JSON over HTTPS · OData query support (`$filter`, `$top`, `$skip`, `$orderby`, `$select`)
Auth: **None required for Milwaukee** (confirmed by direct curl). Some other Legistar clients require an `?token=` — relevant only for multi-city expansion.
Hard limit: **1,000 rows per query** — page with `$top`/`$skip`. ✅ MOO-37 verified (matches Granicus docs): `$top=1000` returns 1000 rows, but **`$top=1001` returns ~4 rows** — exceeding the cap does NOT clamp, it returns a degenerate page. Always keep `$top` ≤ 1000 and page with `$skip`.

---

## 1. The Entity Map (how everything joins)

```
Body (committee/council) ──< Event (a meeting) ──< EventItem (an agenda line)
                                                        │
                                                        ▼ EventItemMatterId
                                                     Matter (the legislation file)
                                                        ├──< MatterText (versions of full legal text)
                                                        ├──< MatterHistory (every action ever taken)
                                                        ├──< MatterAttachment (PDFs: staff reports, maps, plans)
                                                        ├──< MatterSponsor (which alderperson introduced it)
                                                        ├──< MatterIndex (subject tags)
                                                        ├──< MatterCodeSection (which code sections it touches)
                                                        └──< MatterRelation (related files)
EventItem ──< Vote / RollCall ──> Person (alderperson) ──< OfficeRecord (seat, term)
```

The spine of Gavel's poller: **Events (next 7 days) → EventItems → Matters → enrich**.

---

## 2. Endpoint Reference (read endpoints only — write endpoints exist but are auth-gated; ignore)

### 🟢 SPINE — the poller lives on these

**`GET /events`** — all meetings
Key fields: `EventId`, `EventBodyId`, `EventBodyName` (committee name), `EventDate`, `EventTime`, `EventLocation`, `EventAgendaStatusName` (Draft/Final — **alert only on Final**), `EventAgendaFile` (PDF URL), `EventMinutesFile`, `EventInSiteURL` (public Legistar page — use in alert buttons), `EventVideoPath` / `EventMedia` (video link when published), `EventAgendaLastPublishedUTC` (**the agenda-change-detection field** — re-pull when this moves).
Gavel use: the cron poll. `EventDates/{BodyId}?FutureDatesOnly=true` is a cheap calendar check per committee.

**`GET /events/{id}/eventitems?AgendaNote=1&MinutesNote=1&Attachments=1`** — agenda lines for a meeting
Key fields: `EventItemId`, `EventItemAgendaNumber` ("Item 14"), `EventItemAgendaSequence`, `EventItemTitle` (**the headline text Claude summarizes**), `EventItemMatterId` / `EventItemMatterFile` / `EventItemMatterName` / `EventItemMatterType` / `EventItemMatterStatus` (the join to the Matter), `EventItemActionName` / `EventItemActionText` (what was done, post-meeting), `EventItemPassedFlag` / `EventItemPassedFlagName`, `EventItemMover` / `EventItemSeconder`, `EventItemTally`, `EventItemConsent` (**consent-agenda flag — Rachel's burial detector**), `EventItemRollCallFlag`, **`EventItemVideo` / `EventItemVideoIndex`** (timestamp into the meeting video — powers clips), `EventItemAgendaNote` / `EventItemMinutesNote`.
Gavel use: everything. This is the richest single endpoint in the API.

**`GET /matters/{id}`** — the legislation file
Key fields: `MatterId`, `MatterFile` (e.g. "231234" — the public file number), `MatterName`, `MatterTitle` (often the fullest plain description, frequently contains **street addresses**), `MatterTypeName` (Ordinance/Resolution/Communication/Appointment…), `MatterStatusName` (In Committee/Passed/Held…), `MatterBodyName` (current committee), `MatterIntroDate`, `MatterAgendaDate`, `MatterPassedDate`, `MatterEnactmentDate` / `MatterEnactmentNumber`, `MatterRequester`, `MatterNotes`, `MatterVersion`, plus `MatterEXText1–11` / `MatterEXDate1–10` (client-customized extra fields — **✅ MOO-37 verified: Milwaukee leaves these EMPTY** (checked on rezoning matter 73730 — all 11 EXText + all EXDate fields blank). No district/applicant/address gold here; extract those from `MatterTitle` via Claude instead).
`GET /matters` with OData filters = citywide legislation search (powers `search_matters` and watchlists).

### 🟡 ENRICHMENT — depth behind the alert

**`GET /matters/{id}/histories?AgendaNote=1&MinutesNote=1`** — every action ever taken on a file
Key fields: `MatterHistoryActionDate`, `MatterHistoryActionName` ("Recommended for approval", "Held", "Amended"), `MatterHistoryActionBodyName` (which committee), `MatterHistoryPassedFlag`, `MatterHistoryTally` ("4-1"), `MatterHistoryActionText`.
Gavel use: "what's the history of this file?" + **escalation pings** (diff for committee→Council movement) + vote-record compilation.

**`GET /matters/{id}/attachments`** + **`/attachments/{attId}/File`** — supporting documents
Fields: `MatterAttachmentName`, `MatterAttachmentHyperlink`. The `/File` endpoint returns **actual file content** — staff reports, zoning maps, site plans, DCD recommendations.
Gavel use: feed attachment PDFs to Claude for deep summaries ("the staff report recommends approval with 3 conditions"). This is where the *real* substance of zoning matters lives — titles say "rezone parcel X," attachments say why. Stretch: summarize top attachment per alert.

**`GET /matters/{id}/versions`** + **`/texts/{textId}`** — full legal text, versioned
Fields: text body (plain + RTF), version labels.
Gavel use: plain-English summarization source when the title isn't enough; amendment diffing between versions (post-hackathon).

**`GET /matters/{id}/sponsors`** — who introduced it
Gavel use: "Sponsored by Ald. [name]" on alert cards; join to Persons for contact info in the "How to be heard" footer.

**`GET /matters/{id}/indexes`** + **`GET /indexes`** — official subject tags
Gavel use: **controlled vocabulary, NOT a live subscription backbone.** ✅ MOO-37 verified: `/indexes` holds 854 high-quality terms (`BOARD OF ZONING APPEALS`, `DEMOLITIONS`, `ALCOHOL - REGULATION AND LICENSING`…), but per-matter tagging happens **only at enactment** (1/25 recent/in-committee matters tagged vs 2/2 enacted). Gavel alerts *pre-vote*, when matters are untagged — so subscriptions **cannot** ride this taxonomy live. **Decision: custom classification** (committee `EventBodyName` + title keyword + Claude topic-tag *against* these 854 terms); use `MatterIndexes` only as Claude's tag vocabulary and for retroactive/historical enrichment.

**`GET /matters/{id}/relations`** — related files
Gavel use: "this rezoning travels with file 231235 (the land disposition)" — connective tissue most citizens never see.

**`GET /matters/{id}/codesections`** + **`GET /codesections`** — which code sections a matter amends
Gavel use: pairs directly with the zoning-RAG namespace — "this ordinance amends §295-505, here's what that section currently says."

### 🔵 PEOPLE & VOTES — accountability layer

**`GET /eventitems/{id}/votes`** and **`/rollcalls`** — individual votes per agenda item
Fields: `VotePersonId`, `VotePersonName`, `VoteValueName` (Aye/No/Excused/Abstain).
Gavel use: "who voted for this last time?" — the 0:40 demo beat's data source. Note: only populated where a roll call was taken; voice votes yield tally-only via EventItem.

**`GET /persons`** + **`GET /persons/{id}/votes`** — alderpersons & their full vote history
Fields: name, email, WWW. Person-keyed votes power "How has Ald. X voted on demolitions?" (Rachel's stretch feature) without N+1 queries.

**`GET /officerecords`** — who holds which seat, term start/end
Gavel use: map district → current alderperson for the "How to be heard" footer; handles turnover automatically.

**`GET /bodies`** + **`/bodytypes`** — all committees/commissions
Fields: `BodyId`, `BodyName`, `BodyTypeName`, contact name/email.
Gavel use: one-time fetch to power the subscription picker ("watch: Zoning, Neighborhoods & Development"). City & County of Milwaukee boards share this instance — wider coverage for free.

**`GET /actions`, `/matterstatuses`, `/mattertypes`, `/votetypes`, `/matterrequesters`** — lookup/code tables. Fetch once, cache in Convex, use to translate IDs → names.

---

## 3. Query Cookbook (Gavel's actual calls)

```bash
# Poller: meetings in the next 7 days, finalized agendas first
GET /v1/milwaukee/events?$filter=EventDate+ge+datetime'2026-06-04'+and+EventDate+lt+datetime'2026-06-11'&$orderby=EventDate

# One meeting, fully loaded (items + notes + attachments in a single call)
GET /v1/milwaukee/events/{EventId}?EventItems=1&AgendaNote=1&MinutesNote=1&EventItemAttachments=1

# Watchlist sweep: any new matter mentioning a watched name (server-side substring)
GET /v1/milwaukee/matters?$filter=substringof('XYZ%20Holdings',MatterTitle)&$orderby=MatterIntroDate+desc&$top=20

# Recently introduced matters (daily diff for watchlists & topic subs)
GET /v1/milwaukee/matters?$filter=MatterIntroDate+ge+datetime'2026-06-03'&$top=100

# Agenda-change detection: re-check publish stamps
GET /v1/milwaukee/events?$filter=EventAgendaLastPublishedUTC+ge+datetime'2026-06-03'&$select=EventId,EventBodyName,EventDate,EventAgendaLastPublishedUTC

# Paging past the 1,000-row cap
GET /v1/milwaukee/matters?$top=1000&$skip=1000
```

OData notes: dates use the `datetime'YYYY-MM-DD'` literal; `substringof(needle, Field)` for contains; `$select` trims payloads; spaces URL-encode as `+` or `%20`.

---

## 4. Gotchas & Field Notes

1. **Agenda status matters.** Alert on `EventAgendaStatusName = Final`; draft agendas change. But *diff* drafts→final — that's the walk-on detector.
2. **`EventItemVideoIndex` population is per-city discipline.** Verify on a recent Milwaukee meeting (curl test #4 stands). If sparse, tier-1 video links still work via `EventVideoPath`/`EventInSiteURL`.
3. **Titles vs. truth.** `EventItemTitle`/`MatterTitle` are sometimes terse; the substance lives in MatterTexts and Attachments. Budget the summarizer to fall back: title → text → first attachment.
4. **`MatterEXText1–11` are client-defined — and ✅ MOO-37 confirmed Milwaukee leaves them empty.** No structured districts/applicants/addresses to harvest; treat the title as the source and let Claude extract. (Also confirmed: `MatterIndexes` are populated only post-enactment — see §2 indexes note. Neither is a pre-vote data source.)
5. **Address extraction is on you.** No geocoded fields anywhere; addresses hide in titles/text. Claude extracts → Census Geocoder resolves. (Hence keyword/committee subs as the geo fallback.)
6. **Voice votes have no roll call.** `Votes` is empty for many routine items; rely on `EventItemPassedFlagName` + `Tally` and only promise per-member votes where roll calls exist.
7. **Be a polite client.** No published rate limits, but it's a shared gov endpoint: cache lookup tables, poll hourly not minutely, use `$select`, and set a UA string identifying Gavel. (Also just good citizenship for a civic tool.)
8. **County rides along.** `milwaukeecounty` is a separate Legistar client — same code, second jurisdiction, post-hackathon flag flip.

---

## 5. Endpoint → MCP Tool Mapping (final)

| MCP tool | Endpoints behind it |
|---|---|
| `get_upcoming_events(body?, days)` | /events (+ /eventdates) |
| `get_event_agenda(event_id)` | /events/{id}?EventItems=1&Attachments=1 |
| `get_matter(file_number)` | /matters + $filter on MatterFile |
| `get_matter_history(matter_id)` | /matters/{id}/histories |
| `get_matter_text(matter_id)` | /matters/{id}/versions + /texts |
| `get_attachments(matter_id)` | /matters/{id}/attachments (+ /File for content) |
| `get_votes(event_item_id)` | /eventitems/{id}/votes + /rollcalls |
| `get_sponsors(matter_id)` | /matters/{id}/sponsors + /persons |
| `search_matters(query, date_range)` | /matters + OData substringof/date filters |
| `get_member_record(person, topic?)` *(stretch)* | /persons/{id}/votes + matter joins |
| *(internal, poller-only)* agenda-change detector | /events $select publish stamps + item diff |

Net: the API gives Gavel **meetings, agendas, full legislative text, staff-report PDFs, complete action histories, sponsors, subject tags, code-section links, related files, per-member votes, committee rosters, and video pointers** — token-free. The only things it doesn't give you are geography (Census Geocoder) and meaning (Claude). That's the whole reason Gavel exists.
