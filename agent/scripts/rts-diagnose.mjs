#!/usr/bin/env node
// Diagnostic for MOO-38: why is assistant.search.context returning empty?
// Checks who the token belongs to, its scopes, public channels the user can see,
// and whether #general actually has messages (search-index lag vs. nothing-to-find).
import "dotenv/config";

const token = process.env.SLACK_USER_TOKEN;
if (!token?.startsWith("xoxp-")) {
  console.error("Need a xoxp- token in SLACK_USER_TOKEN");
  process.exit(2);
}

async function call(method, params = {}) {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  return res.json();
}

const auth = await call("auth.test");
console.log("auth.test → ok:", auth.ok, "| user:", auth.user, "| url:", auth.url);

// Which public channels can this user see, and are they a member?
const list = await call("conversations.list", { types: "public_channel", limit: "100" });
if (!list.ok) {
  console.log("conversations.list → ok:false, error:", list.error, "(may need channels:read user scope)");
} else {
  const chans = list.channels ?? [];
  console.log(`public channels visible: ${chans.length}`);
  for (const c of chans.slice(0, 8)) {
    console.log(`  #${c.name} (id ${c.id}) member:${c.is_member}`);
  }
  const general = chans.find((c) => c.name === "general") ?? chans.find((c) => c.is_member);
  if (general) {
    const hist = await call("conversations.history", { channel: general.id, limit: "5" });
    const msgs = (hist.messages ?? []).filter((m) => m.type === "message");
    console.log(`\n#${general.name} history → ok:${hist.ok} error:${hist.error ?? "-"} | recent messages: ${msgs.length}`);
    for (const m of msgs.slice(0, 5)) {
      console.log("   •", JSON.stringify((m.text ?? "").slice(0, 60)));
    }
    console.log(
      msgs.length
        ? "\n→ Messages EXIST. Empty search = search-index lag (wait & retry)."
        : "\n→ No messages in this channel yet. Post one, then search.",
    );
  }
}
