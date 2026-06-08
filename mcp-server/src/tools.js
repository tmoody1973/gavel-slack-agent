import { z } from 'zod';
import { safeCall } from './errors.js';

const text = (value) => ({ content: [{ type: 'text', text: JSON.stringify(value) }], structuredContent: value });

export function registerTools(server, client) {
  const tool = (name, config, run) =>
    server.registerTool(name, config, async (args) =>
      text(await safeCall(() => run(args), `${name}(${JSON.stringify(args)})`)),
    );

  tool(
    'get_upcoming_events',
    { description: 'Final-agenda meetings in the next 7 days.', inputSchema: z.object({}) },
    () => client.fetchUpcomingFinalEvents(),
  );

  tool(
    'get_event_agenda',
    { description: 'Agenda items (with attachments) for a meeting.', inputSchema: z.object({ event_id: z.number() }) },
    ({ event_id }) => client.fetchEventItems(event_id),
  );

  tool(
    'get_matter',
    { description: 'A single legislative file by matter id.', inputSchema: z.object({ matter_id: z.number() }) },
    ({ matter_id }) => client.getMatter(matter_id),
  );

  tool(
    'get_sponsors',
    { description: 'Sponsors of a matter with contact info.', inputSchema: z.object({ matter_id: z.number() }) },
    async ({ matter_id }) => {
      const sponsors = await client.getMatterSponsors(matter_id);
      return Promise.all(sponsors.map(async (s) => ({ ...s, ...(await client.getPerson(s.personId)) })));
    },
  );

  tool(
    'get_matter_history',
    {
      description: 'Every action taken on a matter (committee→Council).',
      inputSchema: z.object({ matter_id: z.number() }),
    },
    ({ matter_id }) => client.getMatterHistories(matter_id),
  );

  tool(
    'get_matter_text',
    { description: 'Latest full legal text of a matter.', inputSchema: z.object({ matter_id: z.number() }) },
    ({ matter_id }) => client.getMatterTexts(matter_id),
  );

  tool(
    'get_attachments',
    { description: 'Supporting documents for a matter.', inputSchema: z.object({ matter_id: z.number() }) },
    ({ matter_id }) => client.getMatterAttachments(matter_id),
  );

  tool(
    'get_votes',
    {
      description: 'Per-member votes for an agenda item (empty for voice votes).',
      inputSchema: z.object({ event_item_id: z.number() }),
    },
    ({ event_item_id }) => client.getEventItemVotes(event_item_id),
  );

  tool(
    'search_matters',
    {
      description: 'Search legislation by title substring and/or intro date.',
      inputSchema: z.object({
        query: z.string().optional(),
        since_date: z.string().optional(),
        top: z.number().optional(),
        skip: z.number().optional(),
      }),
    },
    ({ query, since_date, top, skip }) => client.searchMatters({ query, sinceDate: since_date, top, skip }),
  );
}
