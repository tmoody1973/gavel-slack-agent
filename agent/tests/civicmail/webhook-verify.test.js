import assert from 'node:assert/strict';
import { test } from 'node:test';

import { verifyWebhookSignature } from '../../civicmail/webhook-verify.js';

const SECRET = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'; // base64 test key (svix docs sample)

// Produce a valid standard-webhooks signature for a payload, the same way the
// verifier does — proves verify() accepts a genuine signature and rejects tampering.
async function sign(payload, id, timestamp, secret = SECRET) {
  const keyBytes = Uint8Array.from(atob(secret.slice('whsec_'.length)), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${id}.${timestamp}.${payload}`));
  let bin = '';
  for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return `v1,${btoa(bin)}`;
}

const payload = JSON.stringify({ type: 'event', event_type: 'message.received', message: { message_id: '<x@y>' } });
const id = 'msg_2abc';
const ts = '1718000000';

test('accepts a genuine signature', async () => {
  const signature = await sign(payload, id, ts);
  const ok = await verifyWebhookSignature({
    payload,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': signature },
    secret: SECRET,
  });
  assert.equal(ok, true);
});

test('accepts the webhook-* header naming too', async () => {
  const signature = await sign(payload, id, ts);
  const ok = await verifyWebhookSignature({
    payload,
    headers: { 'webhook-id': id, 'webhook-timestamp': ts, 'webhook-signature': signature },
    secret: SECRET,
  });
  assert.equal(ok, true);
});

test('rejects a tampered payload', async () => {
  const signature = await sign(payload, id, ts);
  const ok = await verifyWebhookSignature({
    payload: `${payload} tampered`,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': signature },
    secret: SECRET,
  });
  assert.equal(ok, false);
});

test('rejects the wrong secret', async () => {
  const signature = await sign(payload, id, ts);
  const ok = await verifyWebhookSignature({
    payload,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': signature },
    secret: 'whsec_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  });
  assert.equal(ok, false);
});

test('rejects when signature headers are missing', async () => {
  const ok = await verifyWebhookSignature({ payload, headers: {}, secret: SECRET });
  assert.equal(ok, false);
});

test('rejects a stale timestamp beyond tolerance', async () => {
  const signature = await sign(payload, id, ts);
  const ok = await verifyWebhookSignature({
    payload,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': signature },
    secret: SECRET,
    nowSeconds: Number(ts) + 10_000, // far past the 300s tolerance
  });
  assert.equal(ok, false);
});

test('accepts multiple space-separated signatures (one valid)', async () => {
  const good = await sign(payload, id, ts);
  const ok = await verifyWebhookSignature({
    payload,
    headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': `v1,AAAA ${good}` },
    secret: SECRET,
  });
  assert.equal(ok, true);
});
