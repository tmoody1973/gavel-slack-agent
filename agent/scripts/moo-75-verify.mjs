#!/usr/bin/env node

// MOO-75 live verification: run the REAL agent loop (real Anthropic API, real
// Milwaukee Civic MCP server) with a history question and prove render_receipt
// fired — receiptBlocks come back non-empty with a timeline. The deployed
// thread path (streamer attach + screenshot) is then verified by a human.
//
// Run: node scripts/moo-75-verify.mjs   (from agent/)

import { config } from 'dotenv';

config({ path: '.env.local' });
config();

const { runAgent } = await import('../agent/index.js');

const QUESTION = "What's the history on Milwaukee legislative file 260039? Show me the record.";
console.log(`Q: ${QUESTION}\n`);

const { responseText, receiptBlocks, sessionId } = await runAgent(QUESTION);

console.log(`--- prose (${responseText.length} chars) ---`);
console.log(responseText.slice(0, 600));
console.log(`\n--- receiptBlocks (${receiptBlocks.length} blocks) ---`);
console.log(JSON.stringify(receiptBlocks, null, 2).slice(0, 2000));
console.log(`\nsession: ${sessionId ? 'created' : 'none'}`);

if (receiptBlocks.length === 0) {
  console.error('\n❌ FAIL: agent did not call render_receipt');
  process.exit(1);
}
const all = JSON.stringify(receiptBlocks);
console.log(`\ntimeline present: ${/History/.test(all) ? '✅' : '❌ (blocks rendered but no timeline heading)'}`);
