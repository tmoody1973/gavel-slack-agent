import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildNotificationCard } from '../../civicmail/card.js';

const summary = {
  en: { summary: 'The committee will decide on property sales.', whyItMatters: 'Neighbors can speak at the meeting.' },
  es: {
    summary: 'El comité decidirá sobre ventas de propiedades.',
    whyItMatters: 'Los vecinos pueden hablar en la reunión.',
  },
};

const license = {
  category: 'licenses',
  subject: 'RENEWAL Class B Tavern License',
  district: '3',
  addresses: ['2060 N HUMBOLDT AV'],
  detailUrl: 'http://example.gov/record',
};

function blockText(card) {
  return JSON.stringify(card.blocks);
}

test('English card has header, summary, why-it-matters, and a source link', () => {
  const card = buildNotificationCard({ notification: license, summary, language: 'en' });
  assert.equal(card.blocks[0].type, 'header');
  assert.match(card.blocks[0].text.text, /Tavern License/);
  assert.match(blockText(card), /Why it matters/);
  assert.match(blockText(card), /View the record/);
});

test('English card does NOT include a Spanish section', () => {
  const card = buildNotificationCard({ notification: license, summary, language: 'en' });
  assert.doesNotMatch(blockText(card), /En español/);
});

test('Spanish card appends the ES section', () => {
  const card = buildNotificationCard({ notification: license, summary, language: 'es' });
  assert.match(blockText(card), /En español/);
  assert.match(blockText(card), /Por qué importa/);
});

test('includes a category-appropriate "how to be heard" footer', () => {
  const card = buildNotificationCard({ notification: license, summary, language: 'en' });
  assert.match(blockText(card), /How to be heard/);
  assert.match(blockText(card), /License Division/);
});

test('shows district + address + record in the context line', () => {
  const card = buildNotificationCard({
    notification: { ...license, recordNumber: 'COM-ALT-26-00358' },
    summary,
    language: 'en',
  });
  assert.match(blockText(card), /Aldermanic District 3/);
  assert.match(blockText(card), /2060 N HUMBOLDT AV/);
  assert.match(blockText(card), /COM-ALT-26-00358/);
});

test('falls back gracefully when detailUrl is absent', () => {
  const card = buildNotificationCard({ notification: { category: 'other', subject: 'x' }, summary, language: 'en' });
  assert.match(blockText(card), /public record via Milwaukee E-Notify/);
});
