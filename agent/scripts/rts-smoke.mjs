#!/usr/bin/env node
// RTS smoke test (MOO-38): prove assistant.search.context works with a real user token.
//
//   SLACK_USER_TOKEN=xoxp-... node scripts/rts-smoke.mjs "didn't we oppose this developer before"
//
// Reads the user token from env, calls the Real-Time Search API once, prints the raw JSON.
// Exits non-zero if Slack returns ok:false so it can gate the issue's verification checklist.

const SLACK_API = "https://slack.com/api/assistant.search.context";
const REQUIRED_SCOPE = "search:read.public";

const token = process.env.SLACK_USER_TOKEN;
const query = process.argv[2] ?? "test";

if (!token) {
  console.error("Missing SLACK_USER_TOKEN. Set the xoxp- user token first:\n  export SLACK_USER_TOKEN=xoxp-...");
  process.exit(2);
}
if (!token.startsWith("xoxp-")) {
  console.error(`Expected a user token (xoxp-), got "${token.slice(0, 5)}…". RTS needs a user token with ${REQUIRED_SCOPE}.`);
  process.exit(2);
}

const body = new URLSearchParams({
  query,
  content_types: "messages",
  channel_types: "public_channel",
  limit: "5",
});

const response = await fetch(SLACK_API, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body,
});

const result = await response.json();
console.log(JSON.stringify(result, null, 2));

if (!result.ok) {
  console.error(`\n❌ RTS call failed: ${result.error}` +
    (result.error === "missing_scope" ? ` (need ${REQUIRED_SCOPE})` :
     result.error === "not_allowed_token_type" ? " (RTS needs a user token from a directory-published or internal app)" : ""));
  process.exit(1);
}

const messages = result.results?.messages ?? [];
console.error(`\n✅ RTS reachable. ok:true, ${messages.length} message result(s) for query "${query}".`);
