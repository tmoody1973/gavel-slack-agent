// AgentMail signs webhooks with Svix / standard-webhooks (the secret is a
// `whsec_...` value, and the SDK types are SvixId/SvixTimestamp/SvixSignature) —
// NOT the plain hex HMAC the handoff guessed. The signed content is
// `${id}.${timestamp}.${rawBody}`, HMAC-SHA256 with the base64-decoded secret,
// output base64. Verified with Web Crypto so it runs unchanged in Node and in a
// Convex httpAction's V8 runtime (no node:crypto, no svix dependency).

const DEFAULT_TOLERANCE_SECONDS = 300;

function header(headers, ...names) {
  for (const name of names) {
    const value = headers[name] ?? headers[name.toLowerCase()];
    if (value) return value;
  }
  return undefined;
}

function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function bytesToBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

/** Length-checked constant-time string compare (no early return on mismatch). */
function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

async function hmacSha256Base64(keyBytes, message) {
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return bytesToBase64(new Uint8Array(signature));
}

/**
 * Verify a standard-webhooks/Svix signature over the raw request body.
 *
 * @param {{
 *   payload: string,                              raw request body (verify BEFORE JSON.parse)
 *   headers: Record<string, string>,
 *   secret: string,                               the `whsec_...` webhook secret
 *   toleranceSeconds?: number,
 *   nowSeconds?: number,                          injectable for tests
 * }} input
 * @returns {Promise<boolean>}
 */
export async function verifyWebhookSignature({
  payload,
  headers,
  secret,
  toleranceSeconds = DEFAULT_TOLERANCE_SECONDS,
  nowSeconds,
}) {
  const id = header(headers, 'svix-id', 'webhook-id');
  const timestamp = header(headers, 'svix-timestamp', 'webhook-timestamp');
  const signatureHeader = header(headers, 'svix-signature', 'webhook-signature');
  if (!id || !timestamp || !signatureHeader || !secret) return false;

  if (toleranceSeconds > 0 && nowSeconds != null) {
    const drift = Math.abs(nowSeconds - Number(timestamp));
    if (!Number.isFinite(drift) || drift > toleranceSeconds) return false;
  }

  const keyBase64 = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret;
  const expected = await hmacSha256Base64(base64ToBytes(keyBase64), `${id}.${timestamp}.${payload}`);

  // The header is a space-separated list of `version,signature` pairs (e.g. "v1,<sig>").
  return signatureHeader
    .split(' ')
    .map((part) => (part.includes(',') ? part.split(',')[1] : part))
    .some((candidate) => timingSafeEqual(candidate, expected));
}
