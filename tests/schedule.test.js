import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSchedule, DEFAULT_SCHEDULE } from '../schedule.js';

const build = overrides => buildSchedule({ ...DEFAULT_SCHEDULE, ...overrides });

test('eight 45-minute lessons and seven 10-minute breaks end at 16:10', () => {
  const result = build({});
  assert.equal(result.finish, '16:10');
  assert.equal(result.spare, 50);
  assert.equal(result.segments.length, 15);
  assert.equal(result.alarms.length, 16);
  assert.deepEqual(result.alarms[0], { time: '09:00', title: '1교시 시작', enabled: true });
  assert.equal(result.alarms.at(-1).title, '8교시 끝');
});

test('meal replaces the regular break and finishes exactly at the end limit', () => {
  const result = build({ specials: [{ after: 4, duration: 60, title: '점심시간' }] });
  assert.equal(result.finish, '17:00');
  assert.equal(result.spare, 0);
  assert.deepEqual(result.segments.find(s => s.kind === 'special'), {
    title: '점심시간', start: '12:30', end: '13:30', duration: 60, kind: 'special'
  });
  assert.equal(result.alarms.find(a => a.time === '12:30').title, '4교시 끝 · 점심시간 시작');
  assert.equal(result.alarms.find(a => a.time === '13:30').title, '점심시간 끝 · 5교시 시작');
  assert.equal(new Set(result.alarms.map(a => a.time)).size, result.alarms.length);
});

test('multiple special breaks at one position run in entered order', () => {
  const result = build({ count: 2, specials: [
    { after: 1, duration: 30, title: '식사' }, { after: 1, duration: 5, title: '이동' }
  ] });
  assert.equal(result.finish, '11:05');
  assert.deepEqual(result.segments.map(s => s.title), ['1교시', '식사', '이동', '2교시']);
  assert.equal(result.alarms.find(a => a.time === '10:15').title, '식사 끝 · 이동 시작');
});

test('zero regular rest combines lesson boundaries; last lesson has no trailing break', () => {
  const result = build({ count: 2, work: 30, rest: 0, unit: '타임' });
  assert.equal(result.finish, '10:00');
  assert.equal(result.alarms.length, 3);
  assert.equal(result.alarms[1].title, '1타임 끝 · 2타임 시작');
});

test('a single lesson needs no rest and can finish at 23:59', () => {
  const result = build({ start: '23:00', end: '23:59', count: 1, work: 59 });
  assert.equal(result.finish, '23:59');
  assert.equal(result.segments.length, 1);
});

test('time overflow reports exact excess rather than truncating lessons', () => {
  assert.throws(() => build({ end: '16:00' }), /10분 초과/);
  assert.throws(() => build({ start: '23:00', end: '23:59', count: 2 }), /41분 초과/);
});

test('invalid times, numbers and special break positions are rejected', () => {
  for (const changes of [
    { start: '' }, { start: '24:00' }, { end: '08:00' }, { count: 0 },
    { count: 2.5 }, { count: '' }, { work: -1 }, { rest: -1 },
    { specials: [{ after: 8, duration: 30, title: '점심' }] },
    { count: 1, specials: [{ after: 1, duration: 30, title: '점심' }] },
    { specials: [{ after: 4, duration: 0, title: '점심' }] },
    { specials: [{ after: 4, duration: 30, title: ' ' }] }
  ]) assert.throws(() => build(changes));
});
