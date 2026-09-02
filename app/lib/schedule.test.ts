// Run with: npm run test:schedule
// Plain tsx + node:assert — the repo has no test runner and this change is
// not a good reason to introduce one.
import assert from 'node:assert/strict';
import { londonTimeToUtcIso, DEFAULT_POST_HOUR_LONDON } from './schedule';

const cases: Array<[string, number | undefined, string | null, string]> = [
  ['2026-09-05', undefined, '2026-09-05T08:00:00.000Z', 'BST: 09:00 London is 08:00Z'],
  ['2026-01-15', undefined, '2026-01-15T09:00:00.000Z', 'GMT: 09:00 London is 09:00Z'],
  ['2026-03-29', undefined, '2026-03-29T08:00:00.000Z', 'day the clocks go forward'],
  ['2026-03-28', undefined, '2026-03-28T09:00:00.000Z', 'day before, still GMT'],
  ['2026-10-25', undefined, '2026-10-25T09:00:00.000Z', 'day the clocks go back'],
  ['2026-10-24', undefined, '2026-10-24T08:00:00.000Z', 'day before, still BST'],
  ['2026-06-01', 17, '2026-06-01T16:00:00.000Z', 'custom hour under BST'],
  ['2026-12-01', 0, '2026-12-01T00:00:00.000Z', 'midnight under GMT'],
  ['', undefined, null, 'empty string'],
  [undefined as unknown as string, undefined, null, 'undefined'],
  [null as unknown as string, undefined, null, 'null'],
  ['not-a-date', undefined, null, 'malformed'],
  ['05/09/2026', undefined, null, 'wrong format'],
  ['2026-02-31', undefined, null, 'date that would roll over'],
  ['2026-06-01', 24, null, 'hour out of range'],
  ['2026-06-01', -1, null, 'negative hour'],
];

let failures = 0;
for (const [date, hour, expected, label] of cases) {
  const actual = hour === undefined ? londonTimeToUtcIso(date) : londonTimeToUtcIso(date, hour);
  try {
    assert.equal(actual, expected);
    console.log(`  ok    ${label}`);
  } catch {
    failures++;
    console.error(`  FAIL  ${label}: got ${actual}, expected ${expected}`);
  }
}

assert.equal(DEFAULT_POST_HOUR_LONDON, 9);
console.log(`\n${cases.length - failures}/${cases.length} passed`);
if (failures) process.exit(1);
