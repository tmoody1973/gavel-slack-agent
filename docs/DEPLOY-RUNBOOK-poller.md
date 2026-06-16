# Deploy runbook — MOO-53 watch sweep + MOO-52 escalation ping

Ship both poller crons (PR #23 + #24) to the live `gavel-poller`. Copy-paste, top to bottom.
Everything runs from the **main checkout** after merge: `/Users/tarikmoody/documents/projects/gavel-slack-agent`.

**Key facts that shape this runbook:**
- There is **one** Convex deployment — `dev:vivid-weasel-903` — and the Fly poller uses it via the
  `CONVEX_URL` secret. "Deploy to prod" = push the merged schema to that deployment.
- The deployment currently reflects whichever branch last ran `convex dev` (MOO-52). It has
  `matterEscalations` but **not** `watchAlerts`. Step 2 fixes that by pushing **merged main**.
- A naive first run of the escalation cron would post **~34–42 catch-up pings at once** (matters
  already mid-flight). Step 4 **pre-seeds** the ledgers so the first real run is quiet; genuine
  *new* transitions after deploy still ping normally.

---

## 0. Pick a test channel for the eyeball

Use a low-traffic channel you can post into. Grab its ID (Slack → channel → About → copy ID),
e.g. `C0ABC123`. Export it:

```bash
export TEST_CHANNEL=C0ABC123     # <-- your test channel
```

---

## 1. Merge both PRs

Both are verified (293/293 + 292/292, live-data proven). Merge to main:

```bash
cd /Users/tarikmoody/documents/projects/gavel-slack-agent
gh pr merge 23 --merge --delete-branch    # MOO-53 watch sweep
gh pr merge 24 --merge --delete-branch    # MOO-52 escalation ping
git checkout main && git pull
```

(If GitHub flags a conflict in `agent/crontab` — both PRs append a line — accept **both** added
blocks: keep the `0 13 * * *` watch-sweep line AND the `0 */6 * * *` escalation line.)

---

## 2. Push the MERGED schema to Convex + codegen

```bash
cd agent
npm install
npx convex dev --once     # deploys merged schema → vivid-weasel-903 (watchAlerts + matterEscalations both live)
```

Expect `Convex functions ready!` with no error. Both tables + their functions now exist together.

---

## 3. Eyeball one real card of each (single post — no burst)

These post exactly ONE card to `$TEST_CHANNEL`, so you can confirm the Block Kit renders.

**Watch card** (real recent matter matched by a throwaway term):

```bash
node - <<'JS'
import { WebClient } from '@slack/web-api';
import { config } from 'dotenv'; config({ path: '.env.local' }); config();
import { createLegistarClient } from './poller/index.js';
import { watchCard } from './blockkit/index.js';
const UA='GavelCivicAgent/0.1 (+contact tarik@radiomilwaukee.org)';
const lg=createLegistarClient({fetch,client:'milwaukee',userAgent:UA});
const matters=await lg.fetchRecentMatters(14);
const m=matters.find(x=>x.title&&x.title.length>15)||matters[0];
const term=(m.title.split(/\s+/).find(w=>/^[A-Za-z]{6,}$/.test(w)))||m.title.slice(0,10);
const card=watchCard({ hits:[{entity:term,kind:'matter',matter:m}] });
const slack=new WebClient(process.env.SLACK_BOT_TOKEN||process.env.SLACK_USER_TOKEN);
await slack.chat.postMessage({channel:process.env.TEST_CHANNEL,text:card.text,blocks:card.blocks});
console.log('posted watch card for term:',term,'File #'+m.file);
JS
```

**Escalation card** (real matter currently awaiting the Council vote):

```bash
node - <<'JS'
import { WebClient } from '@slack/web-api';
import { config } from 'dotenv'; config({ path: '.env.local' }); config();
import { createLegistarClient, matterDetailUrl } from './poller/index.js';
import { escalationCard } from './blockkit/index.js';
import { detectEscalation } from './escalation/index.js';
const UA='GavelCivicAgent/0.1 (+contact tarik@radiomilwaukee.org)';
const lg=createLegistarClient({fetch,client:'milwaukee',userAgent:UA});
const base='https://webapi.legistar.com/v1/milwaukee';
const ms=await (await fetch(`${base}/matters?$orderby=MatterLastModifiedUtc+desc&$top=40`,{headers:{'User-Agent':UA,Accept:'application/json'}})).json();
let card,info;
for(const m of ms){ const esc=detectEscalation(await lg.getMatterHistory(m.MatterId)); if(!esc) continue; const meta=await lg.getMatter(m.MatterId); info={file:meta.fileNumber,committee:esc.committee}; card=escalationCard({fileNumber:meta.fileNumber,title:meta.title,committee:esc.committee,recommendedDate:esc.date,url:matterDetailUrl(m.MatterId,meta.guid)}); break; }
if(!card){ console.log('no awaiting-vote matter right now (timing) — re-run later'); process.exit(0); }
const slack=new WebClient(process.env.SLACK_BOT_TOKEN||process.env.SLACK_USER_TOKEN);
await slack.chat.postMessage({channel:process.env.TEST_CHANNEL,text:card.text,blocks:card.blocks});
console.log('posted escalation card:',JSON.stringify(info));
JS
```

Look at both in Slack. If they render, proceed.

---

## 4. Pre-seed the ledgers so the first cron run is QUIET

Run BOTH once from `agent/` on merged main. They record current matches with **zero posts**, so
the deployed crons skip the backfill and only fire on *new* activity afterward.

**Escalations** (records the ~42 already-mid-flight matters, 0 pings):

```bash
node - <<'JS'
import { config } from 'dotenv'; config({ path: '.env.local' }); config();
import { ConvexHttpClient } from 'convex/browser';
import { createLegistarClient } from './poller/index.js';
import { detectEscalation } from './escalation/index.js';
import { api } from './convex/_generated/api.js';
const CLIENT='milwaukee', UA='GavelCivicAgent/0.1 (+contact tarik@radiomilwaukee.org)';
const RECMAX=Number(process.env.ESCALATION_REC_MAX_AGE_DAYS||'21');
const recAfter=new Date(Date.now()-RECMAX*864e5).toISOString().slice(0,10);
const convex=new ConvexHttpClient(process.env.CONVEX_URL);
const lg=createLegistarClient({fetch,client:CLIENT,userAgent:UA});
const tracked=await convex.query(api.detectedItems.listSentWithMatter,{client:CLIENT});
const ids=[...new Set(tracked.map(r=>r.matterId))];
const done=new Set(await convex.query(api.escalations.listEscalatedMatterIds,{client:CLIENT}));
let n=0;
for(const id of ids){ if(done.has(id)) continue; const esc=detectEscalation(await lg.getMatterHistory(id)); if(!esc) continue; if(esc.date&&esc.date.slice(0,10)<recAfter) continue; const meta=await lg.getMatter(id); await convex.mutation(api.escalations.recordEscalation,{client:CLIENT,matterId:id,fileNumber:meta.fileNumber,committee:esc.committee,recommendedDate:esc.date,channelsPinged:0,escalatedAt:Date.now()}); n++; }
console.log(`pre-seeded ${n} escalations (0 pings) — first escalation cron run will be quiet`);
JS
```

**Watch alerts** (records current watch matches for existing watches, 0 posts):

```bash
node - <<'JS'
import { config } from 'dotenv'; config({ path: '.env.local' }); config();
import { ConvexHttpClient } from 'convex/browser';
import { createLegistarClient } from './poller/index.js';
import { createParcelClient } from '../mcp-server/src/parcel.js';
import { matchMatter, classifyEntity } from './watch/index.js';
import { api } from './convex/_generated/api.js';
const CLIENT='milwaukee', UA='GavelCivicAgent/0.1 (+contact tarik@radiomilwaukee.org)';
const LOOK=Number(process.env.WATCH_LOOKBACK_DAYS||'7');
const since=new Date(Date.now()-LOOK*864e5).toISOString().slice(0,10);
const convex=new ConvexHttpClient(process.env.CONVEX_URL);
const lg=createLegistarClient({fetch,client:CLIENT,userAgent:UA});
const parcel=createParcelClient({fetch,userAgent:UA});
const watches=await convex.query(api.watches.listAllWatches,{});
const matters=await lg.fetchRecentMatters(LOOK);
const alerts=[];
for(const w of watches){
  for(const m of matters) if(matchMatter(w.entity,m)) alerts.push({channelId:w.channelId,entity:w.entity,kind:'matter',refId:String(m.matterId),alertedAt:Date.now()});
  let permits=[];
  try{ if(classifyEntity(w.entity)==='address'){ permits=(await parcel.getPermits(w.entity,{since})).permits; } else { const f=await parcel.getOwnershipPortfolio(w.entity,{match:'contains',limit:25}); for(const p of f.parcels) permits.push(...(await parcel.getPermits(p.address,{since})).permits); } }catch{}
  for(const p of permits) alerts.push({channelId:w.channelId,entity:w.entity,kind:'permit',refId:String(p.recordId),alertedAt:Date.now()});
}
if(alerts.length) await convex.mutation(api.watchAlerts.recordAlerts,{alerts});
console.log(`pre-seeded ${alerts.length} watch alerts (0 posts) — first watch sweep will be quiet`);
JS
```

(Skip a pre-seed if you actually WANT the catch-up burst — e.g. to a demo channel.)

---

## 5. Deploy gavel-poller (picks up both new crontab lines)

```bash
cd /Users/tarikmoody/documents/projects/gavel-slack-agent/agent
fly deploy --remote-only          # app = gavel-poller (from agent/fly.toml). NOT from repo root.
```

Confirm the new crons are scheduled:

```bash
fly logs -a gavel-poller          # watch for the 0 13 (watch) + 0 */6 (escalation) entries firing
```

> Do NOT `fly deploy` from the repo root — that's gavel-app (the interactive agent).

---

## 6. Close out

- **Linear:** move **MOO-53** and **MOO-52** → **Done** with a final comment ("deployed to
  gavel-poller, crons live, pre-seeded to suppress backfill, watch/escalation cards eyeballed in
  `<channel>`"). Note any native-ES review that stays open.
- **Worktrees:** once merged, remove the stale ones:
  ```bash
  cd /Users/tarikmoody/documents/projects/gavel-slack-agent
  git worktree remove .claude/worktrees/moo-53-watch-sweep
  git worktree remove .claude/worktrees/moo-52-escalation-ping
  git worktree prune
  ```

## Rollback (if a cron misbehaves)

Comment out the offending line in `agent/crontab` and `fly deploy --remote-only` again — the poll
spine (`*/5`) and digest are independent and unaffected.
