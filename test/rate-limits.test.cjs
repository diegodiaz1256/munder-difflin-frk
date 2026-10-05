'use strict';
// Subscription usage windows from Claude Code's status line (src/shared/rateLimits.ts).
const test = require('node:test');
const assert = require('node:assert/strict');
const loadTs = require('./load-ts.cjs');
const { parseRateLimits, untilReset, usageLevel } = loadTs('src/shared/rateLimits.ts');

test('the 5-hour and weekly windows are read, ISO or epoch-seconds resets', () => {
  const r = parseRateLimits({
    five_hour: { used_percentage: 23.4, resets_at: '2026-10-05T22:00:00Z' },
    seven_day: { used_percentage: 41, resets_at: 1791500000 },
    seven_day_opus: { used_percentage: 'x' }
  }, 5);
  assert.deepEqual(r, { at: 5, fiveHour: { pct: 23.4, resetsAt: Date.parse('2026-10-05T22:00:00Z') }, sevenDay: { pct: 41, resetsAt: 1791500000000 } });
});

test('no windows (an API-key user) → null; junk is clamped or dropped', () => {
  assert.equal(parseRateLimits(undefined), null);
  assert.equal(parseRateLimits({}), null);
  assert.equal(parseRateLimits({ five_hour: { used_percentage: 140 } }).fiveHour.pct, 100);
});

test('time to reset and how close to the limit', () => {
  const now = 0;
  assert.equal(untilReset(12 * 60000, now), '12m');
  assert.equal(untilReset(125 * 60000, now), '2h 05m');
  assert.equal(untilReset((3 * 24 + 4) * 3600000, now), '3d 4h');
  assert.equal(untilReset(-1, now), 'now');
  assert.deepEqual([usageLevel(50), usageLevel(75), usageLevel(95)], ['ok', 'warn', 'high']);
});
