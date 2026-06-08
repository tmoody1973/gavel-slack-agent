import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerTools } from '../src/tools.js';

function harness(clientOverrides) {
  const registered = new Map();
  const server = {
    registerTool(name, config, handler) { registered.set(name, { config, handler }); },
  };
  registerTools(server, clientOverrides);
  return registered;
}

test('registers all nine tools', () => {
  const tools = harness({});
  for (const name of [
    'get_upcoming_events', 'get_event_agenda', 'get_matter', 'get_sponsors',
    'get_matter_history', 'get_matter_text', 'get_attachments', 'get_votes', 'search_matters',
  ]) assert.ok(tools.has(name), `missing ${name}`);
});

test('get_matter returns structuredContent on success', async () => {
  const tools = harness({ getMatter: async (id) => ({ matterId: id, file: '230001' }) });
  const res = await tools.get('get_matter').handler({ matter_id: 42 });
  assert.equal(res.structuredContent.file, '230001');
  assert.equal(res.content[0].type, 'text');
});

test('get_matter degrades to information_unavailable when the client throws', async () => {
  const tools = harness({ getMatter: async () => { throw new Error('Legistar request failed: 404'); } });
  const res = await tools.get('get_matter').handler({ matter_id: 42 });
  assert.equal(res.structuredContent.status, 'information_unavailable');
});

test('get_sponsors enriches each sponsor with a person contact', async () => {
  const tools = harness({
    getMatterSponsors: async () => [{ personId: 11, name: 'Ald. Smith', sequence: 0 }],
    getPerson: async (id) => ({ personId: id, email: 'smith@milwaukee.gov', phone: '414-555-0100' }),
  });
  const res = await tools.get('get_sponsors').handler({ matter_id: 42 });
  assert.equal(res.structuredContent[0].email, 'smith@milwaukee.gov');
});
