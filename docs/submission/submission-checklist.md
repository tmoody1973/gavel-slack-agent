# Devpost submission checklist (MOO-63)

The writeup is drafted (`devpost-submission.md`). This is the **human runbook** to actually submit —
most of it can't be automated. **Internal freeze: July 9. Final deadline: July 13, 2026, 5:00 PM PDT.**

## Acceptance criteria → status

- [x] **Track selected: Agent for Good** — stated at the top of the writeup.
- [x] **Text leads with personas → impact → architecture; names all three sponsor techs** — drafted
  (`devpost-submission.md`: Denise/Marcos/Rachel → measurable impact → three-memory architecture →
  ★ MCP / ★ RTS / ★ Slack AI).
- [x] **Measurable-impact framing** — drafted (time-to-awareness weeks/never → hours; EN/ES access;
  monitoring labor automated; 300+ Legistar cities; open-source MCP).
- [ ] **Demo video attached** — **blocked on MOO-62** (record ≤3 min). See the "demo-must-match-build"
  note below.
- [x] **Architecture diagram ready to attach** — `docs/architecture/three-memory-architecture.svg`
  + `.png` (MOO-61).
- [ ] **Sandbox URL submitted + judge access granted** — human, see below.
- [ ] **Submitted on Devpost before the deadline** — human.

## Human steps (in order)

1. **Finalize the demo video (MOO-62).** ⚠️ The video must show **only built features** — the
   draft writeup's "What it does" is already trimmed to what ships. Built hero beats available now:
   proactive bilingual alert + "How to be heard" footer → RTS "haven't we fought this developer
   before?" → parcel ownership portfolio + permit → zoning RAG with §295 citations → walk-on/
   agenda-change flag → `/gavel watch` → escalation ping. **Do NOT show transcript search or video
   clips** (Phase 4, not built — they're under "What's next"). Disclose any staged/cached beat per
   the honesty table.
2. **Deploy the in-review features first** so the demo runs on the real thing — follow
   `docs/DEPLOY-RUNBOOK-poller.md` (merges + deploys MOO-52/53; MOO-61 diagram + MOO-112 modal too).
3. **Stand up the judge sandbox.** Seed 2–3 neighborhood channels (one Spanish-preference) with
   plausible 2024–25 history so the RTS beat has something to find. Grant workspace access to:
   - `slackhack@salesforce.com`
   - `testing@devpost.com`
   **Verify access actually works** — open the sandbox as each invite (or confirm the invite lands),
   don't assume.
4. **Fill the writeup placeholders** (`[…]`) — video URL, sandbox URL, repo link, MCP server link —
   and paste each section into the matching Devpost field. Attach the video + the diagram PNG.
5. **Email Slack DevRel / sponsor contacts** the cut **the day before** submitting — sponsors
   champion what they see early (brief, §12).
6. **Submit on Devpost**, then **screenshot the completion confirmation** as the proof-of-submission
   evidence for the Linear close.

## Out of scope

Marketplace submission (Organizations track, post-hackathon). Any new feature work.

## Note for whoever closes MOO-63

This branch ships the **text deliverables only**. MOO-63 stays **In Review** until the video is
recorded, the sandbox access is verified against the real judge emails, and Devpost shows the
submission complete (with the confirmation screenshot). It's gated by **MOO-62** (video).
