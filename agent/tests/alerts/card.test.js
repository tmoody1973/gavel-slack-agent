import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildAlertCard } from '../../alerts/card.js';

const input = {
  row: {
    eventItemId: 490695,
    eventBodyName: 'STEERING & RULES COMMITTEE',
    title: 'An ordinance creating an Immigration Advisory Board',
  },
  matter: { fileNumber: '241554' },
  event: { inSiteUrl: 'https://milwaukee.legistar.com/x' },
  summary: {
    en: { summary: 'The city creates a board.', whyItMatters: 'It affects immigrants.' },
    es: { summary: 'La ciudad crea una junta.', whyItMatters: 'Afecta a los inmigrantes.' },
  },
  footer: { text: '🗣️ *How to be heard / Cómo participar*\n📅 *Jun 8 · 1:30 PM*' },
};

test('card has fallback text and a header with the title', () => {
  const { text, blocks } = buildAlertCard(input);
  assert.match(text, /Immigration Advisory Board/);
  assert.equal(blocks[0].type, 'header');
  assert.match(blocks[0].text.text, /Immigration Advisory Board/);
});

test('ES-language card contains both EN and ES summary text', () => {
  const { blocks } = buildAlertCard({ ...input, language: 'es' });
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('The city creates a board.'));
  assert.ok(all.includes('La ciudad crea una junta.'));
  assert.ok(all.includes('En español'));
});

test('EN-language card (and the default) omits the Spanish section', () => {
  for (const card of [buildAlertCard(input), buildAlertCard({ ...input, language: 'en' })]) {
    const all = JSON.stringify(card.blocks);
    assert.ok(all.includes('The city creates a board.'));
    assert.ok(!all.includes('En español'));
    assert.ok(!all.includes('La ciudad crea una junta.'));
  }
});

test('file number stays untranslated in both language variants', () => {
  for (const language of ['en', 'es']) {
    const all = JSON.stringify(buildAlertCard({ ...input, language }).blocks);
    assert.ok(all.includes('File #241554'));
  }
});

test('card has the footer and the three action buttons carrying the eventItemId', () => {
  const { blocks } = buildAlertCard(input);
  const all = JSON.stringify(blocks);
  assert.ok(all.includes('How to be heard'));
  const actions = blocks.find((b) => b.type === 'actions');
  assert.deepEqual(
    actions.elements.map((e) => e.action_id),
    ['alert_watch', 'alert_history', 'alert_ask', 'civic_comment_open'],
  );
  // the three record actions carry the eventItemId; the comment button carries the file number
  assert.ok(
    ['alert_watch', 'alert_history', 'alert_ask'].every(
      (id) => actions.elements.find((e) => e.action_id === id).value === '490695',
    ),
  );
  assert.equal(actions.elements.find((e) => e.action_id === 'civic_comment_open').value, '241554');
});

test('the comment button is bilingual and omitted when there is no file number', () => {
  const es = buildAlertCard({ ...input, language: 'es' });
  const esBtn = es.blocks.find((b) => b.type === 'actions').elements.find((e) => e.action_id === 'civic_comment_open');
  assert.match(esBtn.text.text, /Haz oír tu voz/);
  const ids = buildAlertCard({ ...input, matter: {} })
    .blocks.find((b) => b.type === 'actions')
    .elements.map((e) => e.action_id);
  assert.ok(!ids.includes('civic_comment_open'));
});

const memberFixture = {
  district: 12,
  name: 'José G. Pérez',
  title: 'District 12 Alderman',
  imageUrl: 'https://city.milwaukee.gov/x/PerezHeadshot.jpg',
  email: 'jose.perez@milwaukee.gov',
  phone: '414-286-3762',
  webpage: 'https://city.milwaukee.gov/CommonCouncil/Council-Members/District12',
};

test('Notification template: a matched member headshot becomes the primary section accessory (MOO-126)', () => {
  const { blocks } = buildAlertCard({ ...input, member: memberFixture });
  const sectionWithImage = blocks.find((b) => b.type === 'section' && b.accessory?.type === 'image');
  assert.ok(sectionWithImage, 'expected a section carrying an image accessory (the Notification thumbnail)');
  assert.equal(sectionWithImage.accessory.image_url, memberFixture.imageUrl);
  assert.equal(sectionWithImage.accessory.alt_text, 'José G. Pérez');
  // the headshot rides on the summary section, not a standalone context image
  assert.match(sectionWithImage.text.text, /The city creates a board\./);
});

test('member contact details (name/title/phone/email/webpage) still render somewhere on the card', () => {
  const all = JSON.stringify(buildAlertCard({ ...input, member: memberFixture }).blocks);
  assert.match(all, /José G\. Pérez/);
  assert.match(all, /District 12 Alderman/);
  assert.match(all, /414-286-3762/);
  assert.match(all, /mailto:jose\.perez@milwaukee\.gov/);
  assert.match(all, /Council-Members\/District12/);
});

test('a non-https (or blank) headshot URL never produces an image block', () => {
  for (const imageUrl of ['http://insecure.example/x.jpg', '', undefined]) {
    const { blocks } = buildAlertCard({ ...input, member: { ...memberFixture, imageUrl } });
    assert.ok(!JSON.stringify(blocks).includes('"type":"image"'), `no image block for imageUrl=${imageUrl}`);
    // contact text still shows even without a usable headshot
    assert.match(JSON.stringify(blocks), /José G\. Pérez/);
  }
});

test('Notification hierarchy: header, then an icon-led committee context line', () => {
  const { blocks } = buildAlertCard(input);
  assert.equal(blocks[0].type, 'header');
  assert.equal(blocks[1].type, 'context');
  assert.match(blocks[1].elements[0].text, /🏛️/);
  assert.match(blocks[1].elements[0].text, /STEERING & RULES COMMITTEE/);
});

test('without a member the card has no image context block (byte-identical fallback)', () => {
  const withNull = buildAlertCard({ ...input, member: null });
  const without = buildAlertCard(input);
  assert.deepEqual(withNull.blocks, without.blocks);
  assert.ok(!JSON.stringify(without.blocks).includes('"type":"image"'));
});

test('the <48h warning flag is absent unless row.walkOnFlag is true', () => {
  const without = JSON.stringify(buildAlertCard(input).blocks);
  assert.ok(!without.includes('Added late'));
  const withFlag = JSON.stringify(buildAlertCard({ ...input, row: { ...input.row, walkOnFlag: true } }).blocks);
  assert.ok(withFlag.includes('Added late'));
});

test('the consent-calendar warning renders only when row.consentFlag is true (MOO-51)', () => {
  const without = JSON.stringify(buildAlertCard(input).blocks);
  assert.ok(!without.includes('consent calendar'));
  const withFlag = JSON.stringify(buildAlertCard({ ...input, row: { ...input.row, consentFlag: true } }).blocks);
  assert.ok(withFlag.includes('consent calendar'));
  assert.ok(withFlag.includes('batch'));
});

test('a late-added consent item shows both warnings (MOO-51)', () => {
  const row = { ...input.row, walkOnFlag: true, consentFlag: true };
  const all = JSON.stringify(buildAlertCard({ ...input, row }).blocks);
  assert.ok(all.includes('Added late'));
  assert.ok(all.includes('consent calendar'));
});

// ---------- UX mastery-curve guard test (U6) ----------
// Guards that the three expert power actions are direct buttons (one-tap),
// not buried behind an overflow menu — so a future refactor can't silently
// regress the power-user path without a failing test.

test('U6 guard: alert_watch / alert_history / alert_ask are direct buttons, not overflow (one-tap depth)', () => {
  const { blocks } = buildAlertCard(input);
  const actionsBlock = blocks.find((b) => b.type === 'actions');
  assert.ok(actionsBlock, 'alert card must have an actions block');
  const powerActionIds = ['alert_watch', 'alert_history', 'alert_ask'];
  for (const actionId of powerActionIds) {
    const element = actionsBlock.elements.find((e) => e.action_id === actionId);
    assert.ok(element, `${actionId} must be present`);
    assert.equal(element.type, 'button', `${actionId} must be a direct button, not an overflow or other element`);
  }
  // No overflow menu present — ensure no depth is buried
  const hasOverflow = actionsBlock.elements.some((e) => e.type === 'overflow');
  assert.equal(hasOverflow, false, 'alert card actions block must not contain an overflow menu');
});
