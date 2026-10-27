export const DEFAULT_SCHEDULE = {
  start: '09:00', end: '17:00', work: 45, rest: 10, count: 8, unit: '교시', specials: []
};

function minutes(time) {
  if (typeof time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error('시작 시간과 종료 한도를 입력해주세요.');
  }
  const [hours, mins] = time.split(':').map(Number);
  return hours * 60 + mins;
}

export function formatMinutes(value) {
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

function integer(value, min, max, label) {
  if (value === '' || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max) {
    throw new Error(`${label}: ${min}~${max} 사이의 정수를 입력해주세요.`);
  }
  return Number(value);
}

export function buildSchedule(config) {
  const start = minutes(config.start);
  const end = minutes(config.end);
  if (end <= start) throw new Error('종료 한도는 시작 시간보다 늦어야 합니다. 자정을 넘기는 시간표는 지원하지 않습니다.');
  const work = integer(config.work, 1, 240, '수업·작업 시간');
  const rest = integer(config.rest, 0, 180, '쉬는 시간');
  const count = integer(config.count, 1, 48, '교시·타임 수');
  const unit = config.unit === '타임' ? '타임' : '교시';
  if (!Array.isArray(config.specials) || config.specials.length > 20) throw new Error('특별 휴식은 최대 20개까지 추가할 수 있습니다.');
  const specials = config.specials.map(item => {
    if (!item || count === 1) throw new Error('특별 휴식은 수업·작업이 2개 이상일 때 사이에 넣을 수 있습니다.');
    const after = integer(item.after, 1, count - 1, '특별 휴식을 넣을 교시·타임');
    const duration = integer(item.duration, 1, 360, '특별 휴식 시간');
    const title = typeof item.title === 'string' ? item.title.trim() : '';
    if (!title || title.length > 60) throw new Error('특별 휴식 이름을 1~60자로 입력해주세요.');
    return { after, duration, title };
  });
  const specialPositions = new Set(specials.map(item => item.after));
  const total = work * count + rest * (count - 1 - specialPositions.size)
    + specials.reduce((sum, item) => sum + item.duration, 0);
  if (start + total > end) {
    throw new Error(`종료 한도를 ${start + total - end}분 초과합니다. 교시 수나 시간을 줄이거나 종료 한도를 늦춰주세요.`);
  }

  const segments = [];
  const boundaries = new Map();
  let cursor = start;
  const boundary = (time, title) => {
    if (!boundaries.has(time)) boundaries.set(time, []);
    boundaries.get(time).push(title);
  };
  const segment = (title, duration, kind, alarm) => {
    const finish = cursor + duration;
    segments.push({ title, start: formatMinutes(cursor), end: formatMinutes(finish), duration, kind });
    if (alarm) {
      boundary(cursor, `${title} 시작`);
      boundary(finish, `${title} 끝`);
    }
    cursor = finish;
  };
  for (let period = 1; period <= count; period++) {
    segment(`${period}${unit}`, work, 'work', true);
    if (period === count) break;
    const breaks = specials.filter(item => item.after === period);
    if (breaks.length) breaks.forEach(item => segment(item.title, item.duration, 'special', true));
    else if (rest) segment('쉬는 시간', rest, 'rest', false);
  }
  // A lesson end and meal start can share a minute. One alarm carries both labels.
  const alarms = [...boundaries].sort(([a], [b]) => a - b).map(([time, titles]) => ({
    time: formatMinutes(time), title: titles.join(' · '), enabled: true
  }));
  return { segments, alarms, finish: formatMinutes(cursor), spare: end - cursor, total };
}
