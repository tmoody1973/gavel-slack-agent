import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';

import { errorReply, historyTimeline, matterCard, parcelCard, sponsorCard, voteTable } from '../../blockkit/index.js';

/** 50/message Slack cap − the feedback block − safety margin. */
export const MAX_RECEIPT_BLOCKS = 40;

const TOOL_DESCRIPTION = `\
Attach a structured Block Kit receipt under your reply: a vote table, sponsor card, \
matter card, parcel card (property owner/zoning + map & watchlist buttons), action \
timeline, or a designed "information unavailable" notice. Pass the TYPED DATA only — \
never raw Block Kit JSON. Set "type" and fill the matching field \
(votes / member / matter / parcel / timeline / unavailable). The receipt renders below \
your prose when your reply finishes streaming, so do not repeat its contents as text.`;

const SCHEMA = {
  type: z.enum(['votes', 'sponsor', 'matter', 'parcel', 'timeline', 'unavailable']).describe('Which receipt to render'),
  votes: z
    .object({
      caption: z.string().describe('e.g. "Vote on File #260039"'),
      votes: z.array(z.object({ member: z.string(), vote: z.string() })),
    })
    .optional(),
  member: z
    .object({
      name: z.string(),
      title: z.string(),
      imageUrl: z.string(),
      email: z.string().optional(),
      phone: z.string().optional(),
      webpage: z.string().optional(),
    })
    .optional(),
  matter: z
    .object({
      fileNumber: z.string().optional(),
      title: z.string(),
      status: z.string().optional(),
      bodyName: z.string().optional(),
      legistarUrl: z.string().optional(),
    })
    .optional(),
  parcel: z
    .object({
      address: z.string(),
      owner: z.string().nullable().optional(),
      zoning: z.string().nullable().optional(),
      district: z.string().nullable().optional(),
      assessedValue: z.number().nullable().optional(),
      razeStatus: z.string().nullable().optional(),
      hasOpenViolation: z.boolean().optional(),
    })
    .optional(),
  timeline: z
    .object({
      fileNumber: z.string().optional(),
      actions: z.array(
        z.object({
          date: z.string().optional(),
          action: z.string(),
          body: z.string().optional(),
          result: z.string().nullable().optional(),
        }),
      ),
    })
    .optional(),
  unavailable: z
    .object({
      kind: z.string().describe('no_history | no_matter | fetch_failed | generic'),
      language: z.enum(['en', 'es']).optional(),
      legistarUrl: z.string().optional(),
    })
    .optional(),
};

/**
 * Convert one payload to blocks. Returns {blocks} or {error} — never throws.
 * The error text goes back to the agent so it can correct or fall back to prose.
 */
export function renderReceiptBlocks(input) {
  switch (input.type) {
    case 'votes':
      return input.votes ? { blocks: [voteTable(input.votes)] } : missing('votes');
    case 'sponsor':
      return input.member ? { blocks: [sponsorCard(input.member)] } : missing('member');
    case 'matter':
      return input.matter ? { blocks: matterCard(input.matter) } : missing('matter');
    case 'parcel':
      return input.parcel ? { blocks: parcelCard(input.parcel) } : missing('parcel');
    case 'timeline':
      return input.timeline ? { blocks: historyTimeline(input.timeline) } : missing('timeline');
    case 'unavailable': {
      if (!input.unavailable) return missing('unavailable');
      const { kind, language, legistarUrl } = input.unavailable;
      return { blocks: errorReply(kind, { language, legistarUrl }).blocks };
    }
    default:
      return { error: `unknown receipt type "${input.type}"` };
  }
}

function missing(field) {
  return { error: `type requires the "${field}" field — provide it and call render_receipt again` };
}

/**
 * Append blocks to the accumulator respecting MAX_RECEIPT_BLOCKS. When a
 * render would overflow, keep what fits and close with one "Full record →"
 * context block. Returns false when nothing could be appended.
 */
export function appendReceiptBlocks(receipts, blocks, legistarUrl = undefined) {
  const budget = MAX_RECEIPT_BLOCKS - receipts.length;
  if (budget <= 0) return false;
  if (blocks.length <= budget) {
    receipts.push(...blocks);
    return true;
  }
  const link = legistarUrl ? `<${legistarUrl}|milwaukee.legistar.com>` : 'milwaukee.legistar.com';
  receipts.push(...blocks.slice(0, budget - 1), {
    type: 'context',
    elements: [{ type: 'mrkdwn', text: `Truncated — Full record → ${link}` }],
  });
  return true;
}

function legistarUrlOf(input) {
  return input.matter?.legistarUrl ?? input.unavailable?.legistarUrl ?? undefined;
}

/**
 * In-process MCP server exposing render_receipt (the MOO-49 pattern). The
 * accumulator array is owned by runAgent; results are TEXT-ONLY — blocks
 * travel via the accumulator, never the tool result (MCP -32602 gotcha).
 * @param {{receipts: object[]}} options
 */
export function createReceiptsServer({ receipts }) {
  const renderTool = tool('render_receipt', TOOL_DESCRIPTION, SCHEMA, async (input) => {
    const result = renderReceiptBlocks(input);
    if (result.error) {
      return { content: [{ type: 'text', text: `render_receipt error: ${result.error}` }] };
    }
    const appended = appendReceiptBlocks(receipts, result.blocks, legistarUrlOf(input));
    const text = appended
      ? `Receipt attached (${input.type}) — it renders under your reply; do not repeat its contents as text.`
      : 'Receipt skipped: the block budget for this reply is exhausted — summarize in prose instead.';
    return { content: [{ type: 'text', text }] };
  });

  return createSdkMcpServer({ name: 'receipts', version: '0.1.0', tools: [renderTool] });
}
