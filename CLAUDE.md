# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository status

This is a **planning-stage repository**: `docs/` contains the blueprint, no application code exists yet. The methodology is "architecture before code" — `docs/` is the source of truth. Before implementing anything, read the relevant doc; do not invent requirements that contradict it.

- `docs/Gavel _ Detailed Product Requirements Document _PRD_.md` — the authoritative spec (requirements, phases, schemas, success metrics).
- `docs/gavel-project-brief.md` — strategy, scope-cut order, demo script, risk log, judging-criteria mapping.
- `docs/gavel-legistar-data-reference.md` — full Legistar Web API surface, entity map, OData query cookbook, gotchas. **Read this before writing any Legistar/MCP code.**
- `docs/gavel-personas-features.md` — the three users (Denise / Marcos / Rachel) that justify each feature.

**Task tracking:** work is broken into Linear issues — team **Moodyco (MOO)**, project "Gavel", **MOO-37…63** across 6 phase milestones. The docs define *what* to build; the Linear issues define *the next executable unit* with acceptance criteria and out-of-scope bounds. Docs and Linear together are the source of truth — neither overrides the other.

## What Gavel is

A **proactive** Slack agent for neighborhood associations that watches Milwaukee city government (agendas, permits, property records, meeting video), translates legalese into plain English + Spanish *before* the vote, and fuses official civic records with the community's own Slack memory. Built for the Slack Agent Builder Challenge (Agent for Good track, deadline **July 13, 2026**). The agent fires alerts unprompted — it is not a chatbot. Never design the primary UX as "type a question at a bot."

## How we work (issue-by-issue via Linear + superpowers)

**Mental model — compose three things, don't pick one:**
- **Linear issue** = the contract: WHAT to build + the proof bar (Intent / Acceptance / Verification).
- **superpowers** = HOW you execute it honestly (brainstorm → plan → TDD → verify → review → ship).
- **`slack-agent-builder`** = domain reference (Slack CLI, agent surface, MCP, RTS, Block Kit).

For each MOO-xx the issue is the spec and superpowers is the engine.

**The per-issue loop (repeat for each of the ~27 issues):**

| Step | Skill | On a Gavel issue |
|---|---|---|
| 0. Fuzzy approach? | `superpowers:brainstorming` | Only when the approach isn't obvious (e.g. MOO-55 zoning chunking). The PRD already did most of this. |
| 1. Pick up | `linear-build` | "build MOO-XX" → read contract, restate intent, move → In Progress. |
| 2. Isolate | `superpowers:using-git-worktrees` | Linear hands you the branch name (`tarikjmoody/moo-xx-…`); one worktree per issue. |
| 3. Plan (chunky issues) | `superpowers:writing-plans` → `executing-plans` | For MCP server (47), RTS (49), zoning RAG (55): turn acceptance criteria into a written plan with checkpoints. Skip for small issues. |
| 4. Build | `superpowers:test-driven-development` | The acceptance criteria ARE the tests — write them RED first, implement to GREEN. |
| 5. Stuck | `superpowers:systematic-debugging` | RTS OAuth fails, Legistar fields sparse → root-cause, don't thrash. |
| 6. Verify | `superpowers:verification-before-completion` | Maps 1:1 onto the issue's Verification checklist — real Legistar/RTS output, screenshots, never "looks done." |
| 7. Review | `superpowers:requesting-code-review` (+ `receiving-code-review`) | Before closing load-bearing issues (MCP server, RTS, anything touching money/ToS). |
| 8. Close & ship | `superpowers:finishing-a-development-branch` | Merge/PR the branch, then `linear-build` closes the issue → Done with an evidence comment. |

Honor each issue's **"Out of scope"** — do not expand past the stated criteria (mirrors the global minimal-scope rule).

**Parallelism:** Phase 0 roots (MOO-37/38/39/40) are independent — run them as parallel agents in separate worktrees via `superpowers:dispatching-parallel-agents`. Same for independent MCP tools later. Everything else is gated by the issue `blockedBy` graph and stays sequential by design.

**Starting a session:**
1. `superpowers:using-superpowers` loads automatically at session start (it's the router).
2. Re-authorize Linear — OAuth is **per-session**; run the browser flow once at the start, then verify with "list my Gavel issues."
3. `build MOO-37` (or the lowest unblocked issue). `linear-build` reads the contract → brainstorm (if fuzzy) → worktree → TDD → verify → review → close. Repeat down the unblocked queue.

**Precedence (important):** for this build, let **superpowers (process) + linear-build (contract)** lead over the PAI Algorithm / global-CLAUDE.md ceremony — they are the more specific fit. If any skill or instruction conflicts with an issue's **"Out of scope," the issue wins** — it is the contract.

**Journaling habit:** at the end of a meaningful work session, write a dated dev journal to `journal/YYYY-MM-DD.md` (what we did, decisions, learnings, risks retired, next steps). Commit journals **directly to `main`** as small `docs:` commits — they're not feature work, so no branch/PR. They're the human-readable companion to Linear's per-issue record.

## Architecture: the three-memory model (the load-bearing idea)

One agent orchestrating three distinct retrieval modalities. Understanding which memory a given feature touches is the key to working in this codebase:

1. **Structured civic data** — the custom **Milwaukee Civic MCP server** wrapping Legistar (OData) + Milwaukee CKAN datastore (MPROP/permits/zoning). Authoritative, API-sourced, live. This MCP server is a shippable open-source artifact in its own right.
2. **Semantic civic memory** — Convex vector DB, **two namespaces** (`zoning_code`, `transcripts`) with different chunking strategies (see PRD "Vector Database Schema"). Indexed from **public records only**.
3. **Live community memory** — Slack **Real-Time Search API** (`assistant.search.context`), queried live over the workspace's own discussion history.

**The hard compliance rule that shapes the architecture:** Gavel *indexes the public record* (transcripts, zoning code, agendas → Convex) and *queries the private record live* (Slack messages → RTS, never stored, copied, or indexed). Any change that persists Slack message content violates Slack ToS and the project's central design claim. Do not add such persistence (this is also why mem0 was deliberately rejected — see PRD "Agent Memory Decision").

## Intended stack (per PRD §"Stack Summary")

TypeScript throughout · Slack Bolt SDK + Slack CLI (`slack create agent`) · Convex (app state + vector search + cached snapshots) · Anthropic API (Claude Sonnet — summarization, agent loop, bilingual generation, tool routing) · custom Milwaukee Civic MCP server · Slack RTS API · Fly.io (poller cron + workers + clip hosting) · Deepgram Nova-3 (batch diarized transcription) · ffmpeg/yt-dlp (video clipping) · Census Geocoder.

When implementing, prefer adopting these choices rather than substituting equivalents — they were selected against hackathon constraints (zero new infra beyond Convex, sponsor-tech requirements, demo cost).

## The Legistar poller spine (most code orbits this)

The core data flow is: **Events (next 7 days) → EventItems → Matters → enrich → Claude summarize → Block Kit alert**. Specifics that are easy to get wrong (full detail in the data reference):

- Base URL `https://webapi.legistar.com/v1/milwaukee` — **no auth token for Milwaukee** (confirmed). Multi-city expansion parameterizes `{client}`.
- **Alert only on `EventAgendaStatusName = Final`**; *diff* Draft→Final to power the walk-on detector.
- `EventAgendaLastPublishedUTC` is the agenda-change-detection field — re-pull when it moves; flag items added <48h before a meeting or slipped onto consent (`EventItemConsent`).
- `GET /events/{id}/eventitems?...&Attachments=1` is the richest single endpoint — most enrichment starts there.
- Titles are often terse; real substance is in MatterTexts and attachment PDFs (`/attachments/{id}/File` returns content). Summarizer fallback chain: title → text → first attachment.
- No geocoded fields exist anywhere. Addresses hide in titles/text → Claude extracts → Census Geocoder resolves. Keyword/committee subscriptions are the geo fallback.
- 1,000-row hard cap per query; page with `$top`/`$skip`. Be a polite client: cache lookup tables, poll hourly not minutely, set a UA string.
- **Topic subscriptions use custom classification** (✅ MOO-37 decided): committee (`EventBodyName`) + title keyword + a Claude topic-tag chosen from the city's 854-term `MatterIndexes` vocabulary. `MatterIndexes` is *not* a live source — matters are tagged only at enactment, and Gavel alerts pre-vote. Likewise `MatterEXText1-11` are empty in Milwaukee — extract address/district from the title via Claude, not structured fields.

## Build sequencing (from PRD §"Suggested Phases")

Phase 0 (curl-before-commit) → Phase 1 spine (poller + summarizer + Block Kit alerts + Convex subscriptions) → Phase 2 (MCP server + Bolt assistant threads + RTS) → Phase 3 (parcel tools + watchlists + agenda-change/escalation detectors) → Phase 4 (vector knowledge layer + transcripts + video) → Phase 5 (polish + demo). Build the spine first; everything else hangs off it.

**Phase 0 is a hard gate — run it before any feature code.** Close the full validation gate in order: **MOO-37** (Legistar content quality) → **MOO-38** (Slack scaffold + RTS OAuth — retires the #1 risk, RTS sandbox access) → **MOO-39** (Granicus video / `EventItemVideoIndex` check) → **MOO-40** (Deepgram acoustic test). Start with **MOO-37**: it unblocks the most (poller, summarizer, MCP server). Only when Phase 0 closes do you open Phase 1.

**Scope-cut order if behind** (cut from the bottom): violations → vote-record compilation → Sunday Digest → watchlists → ownership portfolio → transcript layer → video tier 2 → geo-matching → App Home. **Protected (cut only in emergency):** bilingual EN/ES alerts, "How to be heard" footer, agenda-change detection, escalation ping.

## Multilingual design (no translation API, no i18n framework)

- `language` is a Convex field per channel (and per-user thread override), not a feature flag.
- **Generate natively, don't translate** — one Block Kit card with an EN section, divider, ES section, produced by Claude directly; a curated EN→ES civic glossary is injected into the prompt. Legal source text and file numbers/addresses/committee names stay English, clearly labeled.
- Thread mirroring is one system-prompt line ("Respond in the language the user wrote in") — no language-detection code.
- Retrieval stays monolingual: translate the *query* to EN, compose the answer in ES; issue RTS queries in both languages and merge.

## Conventions when code lands

- No build/lint/test commands exist yet — establish them in Phase 0/1 and document them here once the toolchain is chosen.
- Treat the "Real vs. Cached for Demo" table (PRD) as a contract: features marked real must actually run; cached/staged items must be disclosed in the demo. Do not quietly fake a "real" feature.

# Clean Code Standards

All code produced in this project must follow these clean code principles. These are non-negotiable defaults — not suggestions.

## Naming

- Every variable, function, and class name must clearly communicate its purpose. No single-letter names, no abbreviations unless universally understood (e.g., `id`, `url`).
- Use `numberOfUsers` not `n`. Use `calculateShippingCost` not `calc`.

## Functions

- Each function does ONE thing (Single Responsibility Principle). If you can describe what a function does using "and," split it.
- Keep functions under 20 lines. If longer, extract helper functions.
- Prefer small, composable functions over large monolithic ones.

## Comments

- Code should be self-explanatory. Comments explain WHY, never WHAT or HOW.
- Bad: `// Loop through users` — Good: `// Retry failed users from the last sync batch`
- Delete comments that restate the code. Outdated comments are worse than no comments.

## Formatting & Consistency

- Use consistent indentation (2 or 4 spaces — pick one, never mix).
- Group related logic with blank lines. Separate concerns visually.
- Use Prettier/ESLint or equivalent formatter. Every file should look like the same person wrote it.

## No Hardcoded Values

- Extract magic numbers and strings into named constants or config.
- Bad: `if (users >= 100)` — Good: `if (users >= MAX_USERS)`

## Project Structure

- Organize by concern: `components/`, `services/`, `utils/`, `tests/`.
- Keep test files outside `src/` in a mirrored structure.
- Never dump everything in one directory.

## Error Handling

- Fail fast. Throw meaningful errors with clear messages.
- Use try/catch blocks. Never silently swallow errors.
- Log like you're documenting a crime scene: precise, relevant, minimal.

## Testing

- Write unit tests for every function with logic.
- Tests should be as clean as production code.
- Test edge cases, not just the happy path.

## Dependency Injection

- Pass dependencies as arguments rather than hardcoding them.
- This makes code testable and swappable.

## The Boy Scout Rule

- Leave every file cleaner than you found it.
- When touching existing code: rename unclear variables, extract messy functions, remove dead code.

## Open/Closed Principle

- Design for extension, not modification. Use polymorphism and composition.
- Adding a new feature should not require rewriting existing working code.

## Code Smells to Fix on Sight

- Duplicated logic → extract into a shared function
- God objects doing everything → split responsibilities
- Long parameter lists → use an options/config object
- Nested conditionals 3+ levels deep → extract or invert early returns
