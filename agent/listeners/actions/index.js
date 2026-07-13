import { ConvexHttpClient } from 'convex/browser';

import { enrichForAlert } from '../../alerts/enrich.js';
import { COMMENT_DRAFT_SCHEMA, draftComment } from '../../civicmail/comment-draft.js';
import { api } from '../../convex/_generated/api.js';
import { createHomeDeps } from '../../home/deps.js';
import { createLegistarClient } from '../../poller/legistar.js';
import { STORY_ANGLE_SCHEMA } from '../../stories/angle.js';
import { findMatterMoment } from '../../stories/dossier.js';
import { createClaudeGenerate } from '../../summarizer/index.js';
import { embedQuery } from '../../zoning/embed.js';
import { makeAlertAsk, makeAlertHistory, makeAlertWatch } from './alert-buttons.js';
import { makeCivicCommentSubmit, makeOpenCivicComment } from './civic-comment-buttons.js';
import { makeDossierSend, makeDossierWatch } from './dossier-buttons.js';
import { handleFeedbackButton } from './feedback-buttons.js';
import { makeHelpRoleSwitch, makeHomeHelp } from './help-buttons.js';
import {
  makeCommitteeOptions,
  makeDiscoverWatch,
  makeHomeAddWatch,
  makeHomeEditChannel,
  makeHomeWatchRemove,
} from './home-buttons.js';
import { makeParcelWatch } from './parcel-buttons.js';
import { makeOpenCivicRecord, makeRecordWatch } from './record-buttons.js';
import { makeStoryAsk, makeStoryBrowse, makeStoryLeadOverflow, makeStoryModalFilter } from './story-buttons.js';
import { makeVideoBrowse, makeVideoFilter } from './video-buttons.js';

/**
 * Register action listeners. Convex/Legistar boundaries are constructed here
 * (the listeners/commands/index.js pattern) so handlers stay unit-testable.
 * @param {import('@slack/bolt').App} app
 * @returns {void}
 */
export function register(app) {
  const convexUrl = process.env.CONVEX_URL;
  if (!convexUrl) {
    app.logger?.warn?.('CONVEX_URL is not set — alert-card buttons will report errors.');
  }
  const convex = convexUrl ? new ConvexHttpClient(convexUrl) : null;
  const legistar = createLegistarClient({
    fetch: globalThis.fetch,
    client: 'milwaukee',
    userAgent: 'gavel-slack-agent (tarik@radiomilwaukee.org)',
  });

  const deps = {
    getDetectedItem: (eventItemId) => requireConvex(convex).query(api.detectedItems.getByEventItem, { eventItemId }),
    getMatter: (matterId) => legistar.getMatter(matterId),
    getMatterHistory: (matterId) => legistar.getMatterHistory(matterId),
    addWatch: ({ channelId, entity }) => requireConvex(convex).mutation(api.watches.addWatch, { channelId, entity }),
  };

  // Resolve fresh presigned download URLs for a record's attachments (MOO-153). The
  // AgentMail endpoint returns a JSON envelope with a short-lived download_url; any
  // failure (missing key, expired, network) degrades to a null URL so the modal still
  // opens with the extracted text.
  const agentmailKey = process.env.AGENTMAIL_API_KEY;
  const agentmailBase = `https://api.agentmail.to/v0/inboxes/${process.env.AGENTMAIL_INBOX_ID || 'mke-alerts@agentmail.to'}`;
  const resolveAttachmentUrls = async (record) => {
    const attachments = record.attachments ?? [];
    const blank = (a) => ({ filename: a.filename, contentType: a.contentType, url: null });
    if (!agentmailKey || attachments.length === 0) return attachments.map(blank);
    return Promise.all(
      attachments.map(async (a) => {
        try {
          const url = `${agentmailBase}/messages/${encodeURIComponent(record.messageId)}/attachments/${encodeURIComponent(a.attachmentId)}`;
          const envelope = await (await fetch(url, { headers: { Authorization: `Bearer ${agentmailKey}` } })).json();
          return { filename: a.filename, contentType: a.contentType, url: envelope.download_url ?? null };
        } catch {
          return blank(a);
        }
      }),
    );
  };

  app.action('feedback', handleFeedbackButton);
  app.action('alert_watch', makeAlertWatch(deps));
  app.action('alert_history', makeAlertHistory(deps));
  app.action('alert_ask', makeAlertAsk(deps));

  app.action('parcel_watch', makeParcelWatch(deps));
  app.action('parcel_open_map', async ({ ack }) => ack());

  // MOO-153: the civic-record modal. A "Read" button on a digest highlight or a
  // /gavel search result opens the in-Slack record (email body + extracted PDF text +
  // flyers rendered inline). Attachment URLs are presigned and expire, so they're
  // resolved fresh from AgentMail on open; a missing key/fetch degrades to filenames.
  const recordDeps = {
    getNotification: (messageId) => requireConvex(convex).query(api.civicNotifications.getByMessageId, { messageId }),
    getSubscription: (channelId) =>
      channelId ? requireConvex(convex).query(api.subscriptions.getSubscription, { channelId }) : Promise.resolve(null),
    resolveAttachmentUrls,
    addWatch: deps.addWatch,
  };
  app.action('open_civic_record', makeOpenCivicRecord(recordDeps));
  app.action('record_watch', makeRecordWatch(recordDeps));
  app.action('record_source', async ({ ack }) => ack());

  const homeDeps = createHomeDeps(app.client);
  app.action('home_add_watch', makeHomeAddWatch(homeDeps));
  app.action('discover_watch', makeDiscoverWatch(homeDeps));
  // MOO-127: the "📰 Story leads" watch button opens the same pre-filled add-watch
  // modal as Discover (App Home has no channel context to resolve a watch directly).
  // MOO-130: the /gavel stories carousel reuses story_watch the same way.
  app.action('story_watch', makeDiscoverWatch(homeDeps));
  app.action('home_edit_channel', makeHomeEditChannel(homeDeps));
  app.action('home_watch_remove', makeHomeWatchRemove(homeDeps));
  app.options('home_committees', makeCommitteeOptions(homeDeps));

  // MOO-130: Story-leads rich view. The modal/overflow/Ask need both the Home
  // boundaries (subscriptions, upcoming, channel names) and the alert-style record
  // lookups (detected row + matter file number) for the primed Ask-Gavel DM.
  // MOO-129: the reporter dossier. "📋 Brief me" assembles every reporting thread for one lead —
  // angle (Claude) + sponsor/contact + matter history + the transcript moment (vector search) +
  // outcome. The overflow handler routes 'b::' into openDossier, so storyDeps carries the dossier
  // boundaries too. Single-language (channel language), grounded, leads-not-verdicts.
  const dossierDeps = {
    enrich: (item) => enrichForAlert(item, legistar),
    listMembers: () => requireConvex(convex).query(api.councilMembers.listMembers, { client: 'milwaukee' }),
    getOutcomes: (matterId) => requireConvex(convex).query(api.outcomes.byMatter, { matterId }),
    getMatterHistory: deps.getMatterHistory,
    searchMoment: (item) =>
      findMatterMoment(item, {
        embedQuery: (text) => embedQuery(text, { apiKey: process.env.OPENAI_API_KEY }),
        search: (query) => requireConvex(convex).action(api.transcripts.search, query),
      }),
    generate: createClaudeGenerate({ schema: STORY_ANGLE_SCHEMA }),
  };

  const storyDeps = { ...homeDeps, ...dossierDeps, getDetectedItem: deps.getDetectedItem, getMatter: deps.getMatter };
  app.action('story_browse', makeStoryBrowse(storyDeps));
  app.action('story_modal_filter', makeStoryModalFilter(storyDeps));
  app.action('story_lead_overflow', makeStoryLeadOverflow(storyDeps));
  app.action('story_ask', makeStoryAsk(storyDeps));
  app.action('dossier_watch', makeDossierWatch(storyDeps));
  app.action('dossier_send', makeDossierSend(storyDeps));

  // MOO-142: meeting-video discovery. Browse + the committee dropdown share the cheap
  // pipeline (live Legistar look-back + one Convex ingested-id query). The ▶ Watch button
  // is a url link — Slack still dispatches an interaction, so ack it to avoid the spinner.
  const videoDeps = {
    listSubscriptions: homeDeps.listSubscriptions,
    listRecentMeetingsWithVideo: () => legistar.listRecentMeetingsWithVideo(),
    listIngestedEventIds: () => requireConvex(convex).query(api.transcripts.listIngestedEventIds, {}),
  };
  app.action('video_browse', makeVideoBrowse(videoDeps));
  app.action('video_filter', makeVideoFilter(videoDeps));
  app.action('video_watch', async ({ ack }) => ack());

  // MOO-152: role-aware help. The App Home button opens the modal (defaulting to the
  // user's primary role); the in-modal switcher (help_role:<role>) re-renders it; the
  // "Full guide" button is a url link, so just ack to clear its spinner.
  app.action('home_help', makeHomeHelp(homeDeps));
  app.action(/^help_role:/, makeHelpRoleSwitch());
  app.action('help_full_guide', async ({ ack }) => ack());

  // MOO-171: "✍️ Make my voice heard" — open the comment modal (action) and file it
  // (view_submission). One shared deps bundle. Sends via the AgentMail REST API (the same
  // fetch+Bearer pattern as resolveAttachmentUrls, not the SDK); CIVIC_COMMENT_TEST_INBOX
  // forces demo-safe routing so a recording never reaches a real clerk.
  const civicCommentSend = agentmailKey
    ? async ({ to, subject, text }) => {
        const response = await fetch(`${agentmailBase}/messages/send`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${agentmailKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: [to], subject, text }),
        });
        if (!response.ok) throw new Error(`AgentMail send failed: ${response.status}`);
        return response.json().catch(() => ({}));
      }
    : async () => {
        throw new Error('AGENTMAIL_API_KEY not set — cannot send civic comment');
      };
  const civicCommentDeps = {
    getSubscription: recordDeps.getSubscription,
    // Resolve the file number → {title, bodyName} from Legistar (no auth for Milwaukee). The
    // title makes the modal real; bodyName feeds recipient resolution on the non-demo path.
    getItem: async (fileNumber) => {
      if (!fileNumber) return null;
      try {
        const url = `https://webapi.legistar.com/v1/milwaukee/matters?$filter=MatterFile%20eq%20'${encodeURIComponent(fileNumber)}'&$top=1`;
        const rows = await (
          await fetch(url, { headers: { 'User-Agent': 'gavel-slack-agent (tarik@radiomilwaukee.org)' } })
        ).json();
        const matter = Array.isArray(rows) ? rows[0] : null;
        if (!matter) return null;
        return {
          title: matter.MatterTitle || matter.MatterName || `File #${fileNumber}`,
          bodyName: matter.MatterBodyName ?? null,
          contactEmail: null,
        };
      } catch {
        return null;
      }
    },
    // Bind the draft schema explicitly. createClaudeGenerate({}) falls back to the SUMMARY schema,
    // so the model returned a summary object and the modal rendered "[object Object]".
    draftComment: (input) =>
      draftComment(input, { generate: createClaudeGenerate({ schema: COMMENT_DRAFT_SCHEMA }) }),
    send: civicCommentSend,
    recentByUserFile: ({ userId, fileNumber }) =>
      requireConvex(convex).query(api.civicComments.recentByUserFile, { userId, fileNumber }),
    logComment: (row) => requireConvex(convex).mutation(api.civicComments.logComment, row),
    confirm: ({ userId, channelId, text }) =>
      app.client.chat
        .postEphemeral({ channel: channelId, user: userId, text })
        .catch(() => app.client.chat.postMessage({ channel: userId, text })),
    testInbox: process.env.CIVIC_COMMENT_TEST_INBOX,
    bodyDirectory: {},
  };
  app.action('civic_comment_open', makeOpenCivicComment(civicCommentDeps));
  app.view('civic_comment_modal', makeCivicCommentSubmit(civicCommentDeps));
}

function requireConvex(convex) {
  if (!convex) {
    throw new Error('CONVEX_URL is not configured');
  }
  return convex;
}
