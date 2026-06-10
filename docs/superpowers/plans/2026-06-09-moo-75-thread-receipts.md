# MOO-75 (UX-C) Thread Receipts + Persona Prompts + Error States — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent thread answers gain structured receipts (vote table / sponsor card / matter card / timeline / designed error state) via a Zod-validated `render_receipt` in-process SDK tool; suggested prompts re-cut per persona.

**Architecture:** A per-run `receipts` block accumulator is created in `runAgent`, threaded through `deps` into `buildAgentOptions`, which registers a new in-process MCP server (`receipts`, tool `render_receipt` — the MOO-49 `createSdkMcpServer` pattern). The tool handler validates typed payloads, converts via the existing `agent/blockkit/` builders, pushes blocks into the accumulator (cap-aware), and returns a text-only confirmation (the MCP text-only gotcha). `runAgent` returns `receiptBlocks`; `message.js`/`app-mentioned.js` attach them via `streamer.stop({ blocks: [...receiptBlocks, ...feedbackBlocks] })` — the feedback-buttons pattern. A `RECEIPTS_PROMPT` system-prompt section tells Claude when to call it, including the `unavailable` type (→ `errorReply`, EN/ES). Prose streams exactly as today; a failed render never loses the prose.

**Tech Stack:** `@anthropic-ai/claude-agent-sdk` (`tool()`, `createSdkMcpServer`), Zod, existing blockkit builders (`voteTable`, `sponsorCard`, `matterCard`, `historyTimeline`, `errorReply`). No new deps.

**Payload shape (locked):** `tool()` takes a flat Zod shape, so the schema is `{type: enum, votes?, member?, matter?, timeline?, unavailable?}` — Zod validates each field's structure; the handler enforces "the field matching `type` is present" and returns the validation message as text when not (agent corrects or falls back to prose).

**Caps:** `MAX_RECEIPT_BLOCKS = 40` (50/message − feedback block − safety). When a render would exceed it, the tool truncates and appends one context block: `Full record → <legistarUrl|milwaukee.legistar.com>` (or plain text without a link).

**Working directory:** `agent/` in `/Users/tarikmoody/Documents/Projects/gavel-slack-agent/.claude/worktrees/moo-75-ux-c`. Branch: `tarikjmoody/moo-75-ux-c-thread-receipts-render-receipt-tool-persona-prompts`.

---

## File structure

| File | Action | Responsibility |
|---|---|---|
| `agent/agent/receipts/tool.js` | Create | `createReceiptsServer({receipts})` + `renderReceiptBlocks` (pure convert+cap) |
| `agent/agent/agent.js` | Modify | register server when `deps.receipts` present; `RECEIPTS_PROMPT`; `runAgent` creates accumulator, returns `receiptBlocks` |
| `agent/listeners/events/message.js` | Modify | `stop({blocks: [...receiptBlocks, ...feedback]})` |
| `agent/listeners/events/app-mentioned.js` | Modify | same |
| `agent/listeners/events/assistant-thread-started.js` | Modify | persona prompts |
| `agent/tests/agent/receipts-tool.test.js` | Create | validation, conversion, accumulation, cap |
| `agent/tests/agent/build-agent-options.test.js` | Modify | receipts server + prompt section registered |
| `agent/tests/listeners/events/assistant-thread-started.test.js` | Create/modify | persona prompts |

### Task 1: `renderReceiptBlocks` + `createReceiptsServer` (TDD)

Pure conversion first (unit-testable without the SDK), then the thin tool wrapper.

- [ ] **1.1 failing tests** (`tests/agent/receipts-tool.test.js`): votes→`data_table`, sponsor→context block, matter→sections, timeline→sections, unavailable→`errorReply(kind,{language,legistarUrl})` blocks; missing matching field → `{error}` result; accumulation appends; cap at 40 truncates + adds "Full record →" context block; tool result is text-only content.
- [ ] **1.2 implement** `agent/agent/receipts/tool.js`:

```js
import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { errorReply, historyTimeline, matterCard, sponsorCard, voteTable } from '../../blockkit/index.js';

/** 50/message Slack cap − feedback block − safety margin. */
export const MAX_RECEIPT_BLOCKS = 40;

const SCHEMA = {
  type: z.enum(['votes', 'sponsor', 'matter', 'timeline', 'unavailable']).describe('Which receipt to render'),
  votes: z.object({ caption: z.string(), votes: z.array(z.object({ member: z.string(), vote: z.string() })) }).optional(),
  member: z.object({ name: z.string(), title: z.string(), imageUrl: z.string(), email: z.string().optional(), phone: z.string().optional(), webpage: z.string().optional() }).optional(),
  matter: z.object({ fileNumber: z.string().optional(), title: z.string(), status: z.string().optional(), bodyName: z.string().optional(), legistarUrl: z.string().optional() }).optional(),
  timeline: z.object({ fileNumber: z.string().optional(), actions: z.array(z.object({ date: z.string().optional(), action: z.string(), body: z.string().optional(), result: z.string().nullable().optional() })) }).optional(),
  unavailable: z.object({ kind: z.string(), language: z.enum(['en', 'es']).optional(), legistarUrl: z.string().optional() }).optional(),
};

/** Convert one validated payload to blocks. Returns {blocks} or {error}. Pure. */
export function renderReceiptBlocks(input) { /* switch on type; missing field → {error: '...'};
  votes → [voteTable(input.votes)]; sponsor → [sponsorCard(input.member)];
  matter → matterCard(input.matter); timeline → historyTimeline(input.timeline);
  unavailable → errorReply(input.unavailable.kind, {...}).blocks */ }

/** Append respecting the cap; when truncating add one "Full record →" context block. Pure. */
export function appendReceiptBlocks(receipts, blocks, legistarUrl) { /* ... */ }

export function createReceiptsServer({ receipts }) {
  const renderTool = tool('render_receipt', DESCRIPTION, SCHEMA, async (input) => {
    const result = renderReceiptBlocks(input);
    if (result.error) return { content: [{ type: 'text', text: `render_receipt error: ${result.error}` }] };
    const appended = appendReceiptBlocks(receipts, result.blocks, legistarUrlOf(input));
    return { content: [{ type: 'text', text: appended ? `Receipt attached (${input.type}) — it will render under your reply; do not repeat its contents as text.` : 'Receipt skipped: block budget reached.' }] };
  });
  return createSdkMcpServer({ name: 'receipts', version: '0.1.0', tools: [renderTool] });
}
```

- [ ] **1.3** suite green → commit `feat(agent): render_receipt tool — typed receipts via blockkit (MOO-75)`

### Task 2: thread through `agent.js` + attach in listeners (TDD)

- [ ] **2.1 failing tests** (extend `tests/agent/build-agent-options.test.js`): with `deps.receipts` → `mcpServers.receipts` registered, `mcp__receipts__*` allowed, prompt contains the receipts section; without → absent.
- [ ] **2.2 implement:** `buildAgentOptions`: when `deps?.receipts` is an array, register `createReceiptsServer({receipts: deps.receipts})`, push allowed tool, append `RECEIPTS_PROMPT` (instructs: vote records / matter history / sponsor identification → call `render_receipt`; tool `information_unavailable` results → `render_receipt` type `unavailable` with the thread's language; prose lead stays, end with a one-line source context). `runAgent`: `const receipts = []` → `{...deps, receipts}` → return `{responseText, sessionId, receiptBlocks: receipts}` (deps may be undefined: `{...(deps ?? {}), receipts}`).
- [ ] **2.3** `message.js` / `app-mentioned.js`: destructure `receiptBlocks`, `stop({ blocks: [...(receiptBlocks ?? []), ...feedbackBlocks] })`.
- [ ] **2.4** suite green → commit `feat(agent): receipts accumulate through runAgent and attach at stream end (MOO-75)`

### Task 3: persona prompts (TDD)

- [ ] **3.1 failing test:** prompts include Denise "What's happening near my neighborhood this week?", Marcos ES "¿Qué decisiones está por tomar la ciudad esta semana?", Rachel "Show me the vote record on a file", watch-flavored "What's new on the things this channel watches?".
- [ ] **3.2 implement** in `assistant-thread-started.js`; suite green → commit `feat(prompts): persona-cut suggested prompts (MOO-75)`

### Task 4: live verification

- [ ] Deploy `gavel-app`; in a real thread ask a vote/history question ("What's the history on file 260039?") → timeline receipt renders (screenshot); vote-record question → data_table; ask about a matter with no record → unavailable errorReply; fresh thread shows persona prompts (screenshot). `node --test` total; PR; Linear protocol.

## Self-review

Acceptance ⇄ tasks: Zod tool + deps accumulation (T1/T2), streamer.stop attach (T2), prompt section (T2), invalid→message + prose preserved (T1 handler + prose path untouched), 50-cap truncation w/ link (T1), persona prompts (T3), errorReply EN/ES (T1 `unavailable`), text-only results (T1). Out of scope respected: no new data tools, no streaming changes.
