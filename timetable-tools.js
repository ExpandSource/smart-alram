import { buildSchedule, DEFAULT_SCHEDULE } from './schedule.js';

const DRAFT_KEY = 'school_alarm_generator';
const LIBRARY_KEY = 'school_alarm_timetables';

function readStored(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch (_) { return fallback; }
}

export function initTimetableTools({ getAlarms, applyAlarms }) {
  const byId = id => document.getElementById(id);
  const form = byId('schedule-form');
  const breaksEl = byId('special-breaks');
  const preview = byId('schedule-preview');
  const scheduleStatus = byId('schedule-status');
  const libraryStatus = byId('timetable-status');
  const savedSelect = byId('saved-timetables');
  const nameInput = byId('timetable-name');
  const fields = Object.fromEntries(['start', 'end', 'work', 'rest', 'count', 'unit'].map(key => [key, byId(`schedule-${key}`)]));
  const stored = readStored(LIBRARY_KEY, []);
  let library = Array.isArray(stored) ? stored.filter(item => item && typeof item.id === 'string'
    && typeof item.name === 'string' && Array.isArray(item.alarms)
    && item.alarms.every(alarm => alarm && /^([01]\d|2[0-3]):[0-5]\d$/.test(alarm.time)
      && typeof alarm.title === 'string' && typeof alarm.enabled === 'boolean')) : [];

  function message(element, text, error = false) {
    element.textContent = text;
    element.classList.toggle('is-error', error);
  }

  function writeStored(key, value, status) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; }
    catch (_) { message(status, '브라우저에 저장하지 못했습니다. 저장 공간과 사이트 데이터 설정을 확인해주세요.', true); return false; }
  }

  function readConfig() {
    return {
      ...Object.fromEntries(Object.entries(fields).map(([key, input]) => [key, input.value])),
      specials: [...breaksEl.children].map(row => ({
        after: row.querySelector('[data-field="after"]').value,
        title: row.querySelector('[data-field="title"]').value,
        duration: row.querySelector('[data-field="duration"]').value
      }))
    };
  }

  function addSpecial(item = { after: 4, title: '점심시간', duration: 60 }) {
    const row = document.createElement('div');
    row.className = 'special-break-row';
    row.innerHTML = `
      <label>몇 교시·타임 뒤<input type="number" data-field="after" min="1" max="47" required></label>
      <label>휴식 이름<input type="text" data-field="title" maxlength="60" required placeholder="예: 점심시간"></label>
      <label>시간 (분)<input type="number" data-field="duration" min="1" max="360" required></label>
      <button type="button" class="btn outline-btn" aria-label="특별 휴식 삭제">삭제</button>`;
    for (const key of ['after', 'title', 'duration']) row.querySelector(`[data-field="${key}"]`).value = item[key] ?? '';
    row.querySelector('button').addEventListener('click', () => { row.remove(); updatePreview(); });
    breaksEl.append(row);
  }

  function setConfig(value) {
    const config = value && typeof value === 'object' ? { ...DEFAULT_SCHEDULE, ...value } : DEFAULT_SCHEDULE;
    for (const [key, input] of Object.entries(fields)) input.value = config[key] ?? DEFAULT_SCHEDULE[key];
    breaksEl.replaceChildren();
    if (Array.isArray(config.specials)) config.specials.slice(0, 20).filter(item => item && typeof item === 'object').forEach(addSpecial);
    updatePreview(false);
  }

  function updatePreview(persist = true) {
    const config = readConfig();
    byId('add-special-break').disabled = breaksEl.children.length >= 20;
    preview.replaceChildren();
    try {
      const result = buildSchedule(config);
      message(scheduleStatus, `${result.finish} 종료 · 알람 ${result.alarms.length}개 · 종료 한도까지 ${result.spare}분 여유`);
      const table = document.createElement('table');
      table.innerHTML = '<caption class="sr-only">수업과 휴식 시간표</caption><thead><tr><th scope="col">일정</th><th scope="col">시간</th><th scope="col">길이</th></tr></thead>';
      const body = document.createElement('tbody');
      for (const segment of result.segments) {
        const row = body.insertRow();
        row.className = `segment-${segment.kind}`;
        for (const value of [segment.title, `${segment.start} ~ ${segment.end}`, `${segment.duration}분`]) {
          row.insertCell().textContent = value;
        }
      }
      table.append(body);
      preview.append(table);
      byId('apply-schedule').disabled = false;
    } catch (error) {
      message(scheduleStatus, error.message, true);
      byId('apply-schedule').disabled = true;
    }
    if (persist) writeStored(DRAFT_KEY, config, scheduleStatus);
  }

  function renderLibrary(selectedId = '') {
    savedSelect.replaceChildren();
    const placeholder = new Option(library.length ? '불러올 시간표를 선택하세요' : '저장한 시간표가 없습니다', '');
    savedSelect.add(placeholder);
    for (const item of library) savedSelect.add(new Option(item.name, item.id));
    savedSelect.value = selectedId;
    updateLibraryButtons();
  }

  function updateLibraryButtons() {
    const selected = library.some(item => item.id === savedSelect.value);
    byId('load-timetable').disabled = !selected;
    byId('delete-timetable').disabled = !selected;
  }

  form.addEventListener('input', () => updatePreview());
  form.addEventListener('change', () => updatePreview());
  byId('add-special-break').addEventListener('click', () => {
    if (breaksEl.children.length >= 20) return;
    const after = Math.max(1, Math.min(4, Number(fields.count.value) - 1));
    addSpecial({ after, title: '점심시간', duration: 60 });
    updatePreview();
    breaksEl.lastElementChild.querySelector('[data-field="title"]').focus();
  });

  form.addEventListener('submit', event => {
    event.preventDefault();
    try {
      const result = buildSchedule(readConfig());
      if (!confirm(`현재 알람 ${getAlarms().length}개를 새 시간표의 알람 ${result.alarms.length}개로 바꾸시겠습니까?`)) return;
      applyAlarms(result.alarms);
      message(libraryStatus, '새 시간표를 적용했습니다. 이름을 입력하고 현재 목록을 저장하면 다시 불러올 수 있습니다.');
    } catch (error) { message(scheduleStatus, error.message, true); }
  });

  byId('save-timetable').addEventListener('click', () => {
    const name = nameInput.value.trim();
    if (!name) { message(libraryStatus, '저장할 시간표 이름을 입력해주세요.', true); nameInput.focus(); return; }
    const existing = library.find(item => item.name === name);
    if (existing && !confirm(`“${name}” 시간표를 현재 알람 목록으로 덮어쓰시겠습니까?`)) return;
    const item = {
      id: existing?.id ?? `saved-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name, alarms: getAlarms(), generator: readConfig()
    };
    const next = existing ? library.map(entry => entry.id === existing.id ? item : entry) : [...library, item];
    if (!writeStored(LIBRARY_KEY, next, libraryStatus)) return;
    library = next;
    renderLibrary(item.id);
    message(libraryStatus, `“${name}” 저장 완료 · 알람 ${item.alarms.length}개. 이 브라우저에서 다시 불러올 수 있습니다.`);
  });

  savedSelect.addEventListener('change', () => {
    updateLibraryButtons();
    const selected = library.find(item => item.id === savedSelect.value);
    if (selected) nameInput.value = selected.name;
  });

  byId('load-timetable').addEventListener('click', () => {
    const item = library.find(entry => entry.id === savedSelect.value);
    if (!item || !confirm(`“${item.name}” 시간표를 불러와 현재 알람 ${getAlarms().length}개를 바꾸시겠습니까?`)) return;
    applyAlarms(item.alarms);
    setConfig(item.generator);
    writeStored(DRAFT_KEY, readConfig(), scheduleStatus);
    nameInput.value = item.name;
    message(libraryStatus, `“${item.name}” 불러오기 완료 · 알람 ${item.alarms.length}개와 생성 조건을 복원했습니다.`);
  });

  byId('delete-timetable').addEventListener('click', () => {
    const item = library.find(entry => entry.id === savedSelect.value);
    if (!item || !confirm(`저장한 “${item.name}” 시간표를 삭제하시겠습니까? 현재 알람은 유지됩니다.`)) return;
    const next = library.filter(entry => entry.id !== item.id);
    if (!writeStored(LIBRARY_KEY, next, libraryStatus)) return;
    library = next;
    renderLibrary();
    message(libraryStatus, `저장한 “${item.name}” 시간표를 삭제했습니다. 현재 알람은 유지됩니다.`);
  });

  setConfig(readStored(DRAFT_KEY, DEFAULT_SCHEDULE));
  renderLibrary();
}
