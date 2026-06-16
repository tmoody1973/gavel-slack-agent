import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectEscalation, isCommitteeRecommendation } from '../../escalation/detect.js';

// Real Milwaukee shapes (verified live: matter 70781).
// Awaiting the Council vote: committee recommended, no Council disposition yet.
const AWAITING_VOTE = [
  { date: '2025-05-13', body: 'COMMON COUNCIL', action: 'ASSIGNED TO', result: undefined },
  { date: '2025-11-12', body: 'PUBLIC WORKS COMMITTEE', action: 'HELD TO CALL OF THE CHAIR', result: 'Pass' },
  { date: '2026-05-20', body: 'PUBLIC WORKS COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' },
];
// Already decided: the full Council ADOPTED it after the recommendation.
const ALREADY_ADOPTED = [
  ...AWAITING_VOTE,
  { date: '2026-06-02', body: 'COMMON COUNCIL', action: 'ADOPTED', result: 'Pass' },
];

test('isCommitteeRecommendation: only a passed RECOMMENDED FOR ADOPTION/PASSAGE counts', () => {
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR  ADOPTION', 'Pass'), true);
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR PASSAGE', 'Pass'), true);
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR  ADOPTION AND ASSIGNED', 'Pass'), true);
  assert.equal(isCommitteeRecommendation('HELD TO CALL OF THE CHAIR', 'Pass'), false);
  assert.equal(isCommitteeRecommendation('ASSIGNED TO', undefined), false);
  assert.equal(isCommitteeRecommendation('RECOMMENDED FOR ADOPTION', 'Fail'), false);
});

test('detectEscalation: recommended-but-not-yet-voted → the committee + date', () => {
  const esc = detectEscalation(AWAITING_VOTE);
  assert.ok(esc);
  assert.equal(esc.committee, 'PUBLIC WORKS COMMITTEE');
  assert.equal(esc.date, '2026-05-20');
});

test('detectEscalation: already adopted by the full Council → null (not an upcoming vote)', () => {
  assert.equal(detectEscalation(ALREADY_ADOPTED), null);
});

test('detectEscalation: in-committee-only history → null (no ping)', () => {
  const inCommittee = [
    { date: '2026-05-01', body: 'COMMON COUNCIL', action: 'ASSIGNED TO', result: undefined },
    { date: '2026-05-10', body: 'ZONING COMMITTEE', action: 'HELD TO CALL OF THE CHAIR', result: 'Pass' },
  ];
  assert.equal(detectEscalation(inCommittee), null);
});

test('detectEscalation: empty/undefined history → null', () => {
  assert.equal(detectEscalation([]), null);
  assert.equal(detectEscalation(undefined), null);
});

test('detectEscalation: multiple recommendations → the latest one', () => {
  const multi = [
    {
      date: '2026-05-21',
      body: 'PUBLIC SAFETY COMMITTEE',
      action: 'RECOMMENDED FOR  ADOPTION AND ASSIGNED',
      result: 'Pass',
    },
    { date: '2026-05-28', body: 'FINANCE & PERSONNEL COMMITTEE', action: 'RECOMMENDED FOR  ADOPTION', result: 'Pass' },
  ];
  assert.equal(detectEscalation(multi).committee, 'FINANCE & PERSONNEL COMMITTEE');
});
