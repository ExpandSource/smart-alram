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
  const savedList = byId('saved-timetables');
  const nameInput = byId('timetable-name');
  const dialog = byId('timetable-dialog');
  const tabs = [byId('generator-tab'), byId('library-tab')];
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

  function notify(text) {
    message(libraryStatus, text);
    message(byId('timetable-page-status'), text);
  }

  function showPanel(tab) {
    tabs.forEach(button => {
      const selected = button === tab;
      button.setAttribute('aria-selected', String(selected));
      button.tabIndex = selected ? 0 : -1;
      byId(button.getAttribute('aria-controls')).hidden = !selected;
    });
  }

  function openTools(tab) {
    showPanel(tab);
    message(libraryStatus, '');
    dialog.showModal();
    tab.focus();
  }

  byId('open-schedule-builder').addEventListener('click', () => openTools(tabs[0]));
  byId('open-timetable-library').addEventListener('click', () => openTools(tabs[1]));
  byId('close-timetable-dialog').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  });
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => showPanel(tab));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === 'Home' ? tabs[0] : event.key === 'End' ? tabs[1] : tabs[1 - index];
      showPanel(next);
      next.focus();
    });
  });

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
      <label class="special-name">휴식 이름<input type="text" data-field="title" maxlength="60" required placeholder="예: 점심시간"></label>
      <button type="button" class="special-remove" aria-label="특별 휴식 삭제" title="특별 휴식 삭제">×</button>
      <label>넣을 위치<span class="number-field"><input type="number" data-field="after" min="1" max="47" required><span data-period-unit>교시 뒤</span></span></label>
      <label>휴식 길이<span class="number-field"><input type="number" data-field="duration" min="1" max="360" required><span>분</span></span></label>`;
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
    breaksEl.querySelectorAll('[data-period-unit]').forEach(label => { label.textContent = `${config.unit} 뒤`; });
    byId('add-special-break').disabled = breaksEl.children.length >= 20;
    preview.replaceChildren();
    try {
      const result = buildSchedule(config);
      byId('schedule-stats').hidden = false;
      byId('preview-finish').textContent = result.finish;
      byId('preview-count').textContent = `${result.alarms.length}개`;
      byId('preview-spare').textContent = `${result.spare}분`;
      message(scheduleStatus, `수업·작업 ${config.count}회${config.specials.length ? ` · 특별 휴식 ${config.specials.length}개` : ''} · 마지막 수업 뒤에는 휴식을 넣지 않아요.`);
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
      byId('schedule-stats').hidden = true;
      message(scheduleStatus, error.message, true);
      byId('apply-schedule').disabled = true;
    }
    if (persist) writeStored(DRAFT_KEY, config, scheduleStatus);
  }

  function renderLibrary(highlightId = '') {
    savedList.replaceChildren();
    byId('library-count').textContent = library.length;
    byId('saved-tab-count').textContent = library.length;
    byId('timetable-library-count').textContent = library.length
      ? `저장한 시간표 ${library.length}개 · 필요할 때 바로 불러오세요.`
      : '시간표를 만들어 두고, 필요할 때 꺼내 쓰세요.';
    if (!library.length) {
      const empty = document.createElement('li');
      empty.className = 'library-empty';
      empty.innerHTML = '<span aria-hidden="true">▦</span><h4>자주 쓰는 시간표를 모아두세요</h4><p>위에서 이름을 입력해 저장하면 여기에 표시됩니다.</p>';
      savedList.append(empty);
    }
    for (const item of library) {
      const card = document.createElement('li');
      card.className = `saved-timetable-card${item.id === highlightId ? ' is-highlighted' : ''}`;
      card.innerHTML = '<div class="saved-card-info"><span class="saved-card-icon" aria-hidden="true">▦</span><div><h4></h4><p></p></div></div><div class="saved-card-actions"><button type="button" class="btn secondary-btn" data-action="load">불러오기</button><button type="button" class="special-remove" data-action="delete" title="저장한 시간표 삭제">×</button></div>';
      card.querySelector('h4').textContent = item.name;
      const times = item.alarms.map(alarm => alarm.time).sort();
      card.querySelector('.saved-card-info p').textContent = `알람 ${item.alarms.length}개${times.length ? ` · ${times[0]}–${times.at(-1)}` : ''}`;
      card.querySelector('[data-action="load"]').setAttribute('aria-label', `${item.name} 불러오기`);
      card.querySelector('[data-action="load"]').addEventListener('click', () => loadTimetable(item));
      card.querySelector('[data-action="delete"]').setAttribute('aria-label', `${item.name} 삭제`);
      card.querySelector('[data-action="delete"]').addEventListener('click', () => deleteTimetable(item));
      savedList.append(card);
    }
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
      notify(`새 시간표의 알람 ${result.alarms.length}개를 적용했습니다. ‘저장 · 불러오기’에서 이름을 붙여 보관할 수 있어요.`);
      dialog.close();
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
    notify(`“${name}” 저장 완료 · 알람 ${item.alarms.length}개`);
  });

  function loadTimetable(item) {
    if (!confirm(`“${item.name}” 시간표를 불러와 현재 알람 ${getAlarms().length}개를 바꾸시겠습니까?`)) return;
    applyAlarms(item.alarms);
    setConfig(item.generator);
    writeStored(DRAFT_KEY, readConfig(), scheduleStatus);
    nameInput.value = item.name;
    notify(`“${item.name}” 불러오기 완료 · 알람 ${item.alarms.length}개`);
    dialog.close();
  }

  function deleteTimetable(item) {
    if (!confirm(`저장한 “${item.name}” 시간표를 삭제하시겠습니까? 현재 알람은 유지됩니다.`)) return;
    const next = library.filter(entry => entry.id !== item.id);
    if (!writeStored(LIBRARY_KEY, next, libraryStatus)) return;
    library = next;
    renderLibrary();
    notify(`“${item.name}” 시간표를 보관함에서 삭제했습니다. 현재 알람은 유지됩니다.`);
    (savedList.querySelector('button') || nameInput).focus();
  }

  setConfig(readStored(DRAFT_KEY, DEFAULT_SCHEDULE));
  renderLibrary();
}
