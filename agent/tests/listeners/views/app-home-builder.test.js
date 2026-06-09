import assert from 'node:assert';
import { describe, it } from 'node:test';

import { buildAppHomeView } from '../../../listeners/views/app-home-builder.js';

describe('buildAppHomeView', () => {
  it('returns a home view', () => {
    const view = buildAppHomeView();
    assert.strictEqual(view.type, 'home');
  });

  it('has a blocks array with header and section', () => {
    const view = buildAppHomeView();
    assert.ok(Array.isArray(view.blocks));
    assert.ok(view.blocks.length >= 3);
    assert.strictEqual(view.blocks[0].type, 'header');
    assert.strictEqual(view.blocks[1].type, 'section');
  });

  it('presents Gavel as a Milwaukee civic agent', () => {
    const view = buildAppHomeView();
    const header = view.blocks.find((b) => b.type === 'header');
    assert.ok(header.text.text.includes('Gavel'));
    const allText = view.blocks
      .filter((b) => b.type === 'section')
      .map((b) => b.text.text)
      .join(' ');
    assert.ok(allText.includes('Milwaukee'));
  });

  it('no longer surfaces the Slack MCP connection widget', () => {
    const view = buildAppHomeView();
    const allText = view.blocks
      .filter((b) => b.type === 'section')
      .map((b) => b.text.text)
      .join(' ');
    assert.ok(!allText.includes('MCP Server'));
    assert.ok(!allText.toLowerCase().includes('disconnected'));
  });

  it('ignores the legacy installUrl/isConnected args (stays Gavel)', () => {
    const view = buildAppHomeView('https://example.com/slack/install', true);
    assert.strictEqual(view.blocks[0].type, 'header');
    assert.ok(view.blocks[0].text.text.includes('Gavel'));
  });
});
