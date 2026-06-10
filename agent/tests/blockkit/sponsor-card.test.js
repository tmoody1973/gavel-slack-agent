import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sponsorCard } from '../../blockkit/sponsor-card.js';

const member = {
  name: 'Russell W. Stamper, II',
  title: 'Alderman, 15th District',
  imageUrl: 'https://city.milwaukee.gov/stamper.jpg',
  email: 'rstamp@milwaukee.gov',
  phone: '414-286-2659',
  webpage: 'https://city.milwaukee.gov/district15',
};

test('sponsorCard renders a context block with headshot image and contact line', () => {
  const block = sponsorCard(member);
  assert.equal(block.type, 'context');
  assert.equal(block.elements[0].type, 'image');
  assert.equal(block.elements[0].image_url, member.imageUrl);
  assert.equal(block.elements[0].alt_text, member.name);
  assert.match(block.elements[1].text, /Russell W\. Stamper, II/);
  assert.match(block.elements[1].text, /414-286-2659/);
  assert.match(block.elements[1].text, /mailto:rstamp@milwaukee.gov/);
});

test('sponsorCard omits missing contact fields without leaving separators', () => {
  const block = sponsorCard({ name: 'A', title: 'B', imageUrl: 'https://x/y.jpg' });
  assert.ok(!block.elements[1].text.includes('·'));
  assert.ok(!block.elements[1].text.includes('undefined'));
});
