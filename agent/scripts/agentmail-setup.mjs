// One-time AgentMail webhook setup for MOO-69. Registers a `message.received`
// webhook pointing at the Convex httpAction and prints the signing secret to
// store as the Convex env var AGENTMAIL_WEBHOOK_SECRET.
//
//   node scripts/agentmail-setup.mjs            # dry run: list existing + show plan
//   node scripts/agentmail-setup.mjs --confirm  # actually register the webhook
//
// After registering, set the secret on the deployment:
//   npx convex env set AGENTMAIL_WEBHOOK_SECRET whsec_...
import { config } from 'dotenv';

config({ path: '.env.local' });
config({ path: '.env' });

import { AgentMailClient } from 'agentmail';

const INBOX_ID = 'mke-alerts@agentmail.to';
const EVENT_TYPES = ['message.received'];

function convexSiteUrl() {
  const url = process.env.CONVEX_URL;
  if (!url) throw new Error('CONVEX_URL missing — run `npx convex dev` first.');
  return `${url.replace('.convex.cloud', '.convex.site')}/agentmail`;
}

async function main() {
  const confirm = process.argv.includes('--confirm');
  const apiKey = process.env.AGENTMAIL_API_KEY;
  if (!apiKey) throw new Error('AGENTMAIL_API_KEY missing in .env');

  const client = new AgentMailClient({ apiKey });
  const targetUrl = convexSiteUrl();
  console.log(`Target webhook URL: ${targetUrl}`);
  console.log(`Inbox: ${INBOX_ID} · events: ${EVENT_TYPES.join(', ')}\n`);

  const existing = await client.webhooks.list().catch(() => null);
  const webhooks = existing?.webhooks ?? existing?.data ?? existing ?? [];
  const already = (Array.isArray(webhooks) ? webhooks : []).find((w) => (w.url ?? '') === targetUrl);
  if (already) {
    console.log(
      `✓ A webhook for this URL already exists (id ${already.webhookId ?? already.webhook_id}). Nothing to do.`,
    );
    console.log('  If you need the secret again, re-create it or rotate in the AgentMail dashboard.');
    return;
  }

  if (!confirm) {
    console.log('DRY RUN — no webhook created. Re-run with --confirm to register:');
    console.log('  node scripts/agentmail-setup.mjs --confirm');
    return;
  }

  const webhook = await client.webhooks.create({ url: targetUrl, eventTypes: EVENT_TYPES, inboxIds: [INBOX_ID] });
  console.log(`✓ Registered webhook ${webhook.webhookId}`);
  console.log('\n=== STORE THIS SECRET (shown once) ===');
  console.log(`AGENTMAIL_WEBHOOK_SECRET=${webhook.secret}`);
  console.log('\nSet it on the Convex deployment:');
  console.log(`  npx convex env set AGENTMAIL_WEBHOOK_SECRET ${webhook.secret}`);
}

main().catch((err) => {
  console.error('agentmail-setup failed:', err.message);
  process.exitCode = 1;
});
