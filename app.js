// ==========================================================================
// Application State & Default Config
// ==========================================================================
const DEFAULT_ALARMS = [
  { id: '1', time: '09:45', title: '1교시 끝', enabled: true },
  { id: '2', time: '10:00', title: '2교시 시작', enabled: true },
  { id: '3', time: '10:45', title: '2교시 끝', enabled: true },
  { id: '4', time: '11:00', title: '3교시 시작', enabled: true },
  { id: '5', time: '11:45', title: '3교시 끝', enabled: true },
  { id: '6', time: '12:00', title: '4교시 시작', enabled: true },
  { id: '7', time: '12:30', title: '점심시간 시작', enabled: true },
  { id: '8', time: '14:00', title: '5교시 시작', enabled: true },
  { id: '9', time: '14:45', title: '5교시 끝', enabled: true },
  { id: '10', time: '15:00', title: '6교시 시작', enabled: true },
  { id: '11', time: '15:45', title: '6교시 끝', enabled: true },
  { id: '12', time: '16:00', title: '7교시 시작', enabled: true },
  { id: '13', time: '16:30', title: '7교시 끝', enabled: true },
  { id: '14', time: '16:45', title: '8교시 시작', enabled: true }
];

let state = {
  alarms: [],
  volume: 80,
  isMuted: false,
  selectedSound: 'school-bell',
  snoozeTime: null,
  snoozedAlarmTitle: '',
  repeatCount: 2
};

// Global variables for Audio & Loop tracking
let audioCtx = null;
let mainGainNode = null;
let activeOscillators = [];
let alarmLoopIntervalId = null;
let testSoundTimeoutId = null;
let lastTriggeredMinute = '';
let currentAlarmPlayCount = 0;
let autoDismissTimeoutId = null;
let alarmSortTimeoutId = null;

// DOM Elements
const clockHoursEl = document.getElementById('clock-hours');
const clockMinutesEl = document.getElementById('clock-minutes');
const clockSecondsEl = document.getElementById('clock-seconds');
const dateDisplayEl = document.getElementById('date-display');
const nextAlarmTitleEl = document.getElementById('next-alarm-title');
const nextAlarmTimeEl = document.getElementById('next-alarm-time');
const countdownDisplayEl = document.getElementById('countdown-display');
const alarmsGridEl = document.getElementById('alarms-grid');
const alarmCountEl = document.getElementById('alarm-count');
const audioStatusBadgeEl = document.getElementById('audio-status-badge');

const soundSelectEl = document.getElementById('sound-select');
const repeatSelectEl = document.getElementById('repeat-select');
const volumeSliderEl = document.getElementById('volume-slider');
const volumePercentageEl = document.getElementById('volume-percentage');
const muteBtnEl = document.getElementById('mute-btn');
const volumeIconEl = document.getElementById('volume-icon');

const testSoundBtnEl = document.getElementById('test-sound-btn');
const stopTestBtnEl = document.getElementById('stop-test-btn');
const addAlarmBtnEl = document.getElementById('add-alarm-btn');
const sortAlarmsBtnEl = document.getElementById('sort-alarms-btn');
const resetDefaultBtnEl = document.getElementById('reset-default-btn');
const clearAllBtnEl = document.getElementById('clear-all-btn');

const alarmOverlayEl = document.getElementById('alarm-overlay');
const alertTimeDisplayEl = document.getElementById('alert-time-display');
const alertTitleEl = document.getElementById('alert-title');
const dismissAlarmBtnEl = document.getElementById('dismiss-alarm-btn');
const snoozeAlarmBtnEl = document.getElementById('snooze-alarm-btn');

// ==========================================================================
// LocalStorage Persistence
// ==========================================================================
function initTheme() {
  const buttons = document.querySelectorAll('[data-theme-choice]');
  const applyTheme = (theme) => {
    document.documentElement.dataset.theme = theme;
    buttons.forEach(button => {
      button.setAttribute('aria-pressed', String(button.dataset.themeChoice === theme));
    });
  };
  applyTheme(document.documentElement.dataset.theme || 'light');
  buttons.forEach(button => button.addEventListener('click', () => {
    const theme = button.dataset.themeChoice;
    applyTheme(theme);
    try { localStorage.setItem('school_alarm_theme', theme); } catch (_) {}
  }));
}

function loadState() {
  const savedState = localStorage.getItem('school_alarm_state');
  if (savedState) {
    try {
      state = JSON.parse(savedState);
      // Ensure essential fields exist
      if (!Array.isArray(state.alarms)) state.alarms = [...DEFAULT_ALARMS];
      if (typeof state.volume !== 'number') state.volume = 80;
      if (typeof state.isMuted !== 'boolean') state.isMuted = false;
      if (typeof state.selectedSound !== 'string') state.selectedSound = 'school-bell';
      if (typeof state.repeatCount !== 'number') state.repeatCount = 2;
    } catch (e) {
      console.error('Error parsing saved state, resetting to defaults.', e);
      resetToDefaultState();
    }
  } else {
    resetToDefaultState();
  }
}

function saveState() {
  localStorage.setItem('school_alarm_state', JSON.stringify(state));
}

function resetToDefaultState() {
  cancelScheduledAlarmSort();
  state.alarms = JSON.parse(JSON.stringify(DEFAULT_ALARMS));
  state.volume = 80;
  state.isMuted = false;
  state.selectedSound = 'school-bell';
  state.repeatCount = 2;
  state.snoozeTime = null;
  state.snoozedAlarmTitle = '';
  saveState();
}

// ==========================================================================
// Web Audio Synthesis Engine
// ==========================================================================
function updateAudioStatusBadge() {
  if (!audioStatusBadgeEl) return;

  if (!audioCtx || audioCtx.state === 'suspended') {
    audioStatusBadgeEl.className = 'status-badge warning';
    audioStatusBadgeEl.innerHTML = `
      <span class="pulse-dot warning"></span>
      <span class="status-text">소리 차단됨 (화면 클릭하여 활성화)</span>
    `;
    audioStatusBadgeEl.title = "브라우저 보안 정책으로 인해 소리가 차단되었습니다. 화면 아무 곳이나 클릭하거나 이 버튼을 클릭하여 활성화하세요.";
  } else if (audioCtx.state === 'running') {
    audioStatusBadgeEl.className = 'status-badge success';
    audioStatusBadgeEl.innerHTML = `
      <span class="pulse-dot success"></span>
      <span class="status-text">소리 준비 완료</span>
    `;
    audioStatusBadgeEl.removeAttribute('title');
  }
}

function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    // Bind state change listener to update the badge status reactively
    audioCtx.onstatechange = () => {
      updateAudioStatusBadge();
    };

    mainGainNode = audioCtx.createGain();
    mainGainNode.connect(audioCtx.destination);
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(err => {
      console.warn("AudioContext resume failed or blocked by browser:", err);
    });
  }

  updateGainNodeVolume();
  updateAudioStatusBadge();
}

function updateGainNodeVolume() {
  if (!mainGainNode) return;
  const targetVolume = state.isMuted ? 0 : state.volume / 100;
  // Smoothly transition volume to avoid popping noises
  const currentTime = audioCtx ? audioCtx.currentTime : 0;
  mainGainNode.gain.setTargetAtTime(targetVolume, currentTime, 0.02);
}

function stopAllSounds() {
  // Clear any active scheduled notes
  activeOscillators.forEach(osc => {
    try { osc.stop(); } catch (e) {}
  });
  activeOscillators = [];

  // Clear timers
  if (alarmLoopIntervalId) {
    clearInterval(alarmLoopIntervalId);
    alarmLoopIntervalId = null;
  }
  if (testSoundTimeoutId) {
    clearTimeout(testSoundTimeoutId);
    testSoundTimeoutId = null;
  }
}

// 1. Westminster Chime synthesis (학교 종소리)
function playChimeNote(freq, startTime, duration) {
  if (!audioCtx || !mainGainNode) return;

  const osc1 = audioCtx.createOscillator(); // Fundamental
  const osc2 = audioCtx.createOscillator(); // 1st Harmonic (makes it ring like a bell)
  const osc3 = audioCtx.createOscillator(); // Minor chime harmonic
  const noteGain = audioCtx.createGain();
  const filter = audioCtx.createBiquadFilter();

  osc1.type = 'triangle';
  osc1.frequency.setValueAtTime(freq, startTime);

  osc2.type = 'sine';
  osc2.frequency.setValueAtTime(freq * 2, startTime);

  osc3.type = 'sine';
  osc3.frequency.setValueAtTime(freq * 3.01, startTime); // slightly detuned for metallic resonance

  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, startTime);

  // Envelope: rapid attack, exponential decay
  noteGain.gain.setValueAtTime(0, startTime);
  noteGain.gain.linearRampToValueAtTime(0.7, startTime + 0.02);
  noteGain.gain.exponentialRampToValueAtTime(0.001, startTime + duration - 0.05);

  osc1.connect(filter);
  osc2.connect(filter);
  osc3.connect(filter);
  filter.connect(noteGain);
  noteGain.connect(mainGainNode);

  osc1.start(startTime);
  osc2.start(startTime);
  osc3.start(startTime);

  osc1.stop(startTime + duration);
  osc2.stop(startTime + duration);
  osc3.stop(startTime + duration);

  activeOscillators.push(osc1, osc2, osc3);
}

function playWestminsterChime() {
  initAudio();
  const now = audioCtx.currentTime;

  // Westminster Quarters 8-note melody
  const melody = [
    { freq: 329.63, time: 0.0 },  // E4
    { freq: 261.63, time: 0.6 },  // C4
    { freq: 293.66, time: 1.2 },  // D4
    { freq: 196.00, time: 1.8 },  // G3

    { freq: 196.00, time: 2.6 },  // G3
    { freq: 293.66, time: 3.2 },  // D4
    { freq: 329.63, time: 3.8 },  // E4
    { freq: 261.63, time: 4.4 }   // C4
  ];

  melody.forEach(note => {
    playChimeNote(note.freq, now + note.time, 0.7);
  });
}

// 2. Digital Beep (디지털 전자음)
function playBeepTone(freq, startTime, duration) {
  if (!audioCtx || !mainGainNode) return;

  const osc = audioCtx.createOscillator();
  const noteGain = audioCtx.createGain();

  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, startTime);

  noteGain.gain.setValueAtTime(0, startTime);
  noteGain.gain.linearRampToValueAtTime(1.0, startTime + 0.01);
  noteGain.gain.setValueAtTime(1.0, startTime + duration - 0.01);
  noteGain.gain.linearRampToValueAtTime(0, startTime + duration);

  osc.connect(noteGain);
  noteGain.connect(mainGainNode);

  osc.start(startTime);
  osc.stop(startTime + duration);

  activeOscillators.push(osc);
}

function playDigitalBeep() {
  initAudio();
  const now = audioCtx.currentTime;

  // Beep-beep-beep pattern
  const beeps = [0.0, 0.22, 0.44];
  beeps.forEach(delay => {
    playBeepTone(880, now + delay, 0.12);
  });
}

// 3. Gentle Chime (부드러운 하프 멜로디)
function playGentleChime() {
  initAudio();
  const now = audioCtx.currentTime;
  const chord = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6 (C Major Arpeggio)

  chord.forEach((freq, idx) => {
    // Play with small delay between notes for arpeggio effect
    playChimeNote(freq, now + (idx * 0.15), 1.5);
  });
}

// 4. Retro Bell (아날로그 타종음)
function playRetroBell() {
  initAudio();
  const now = audioCtx.currentTime;

  // High speed mechanical bell striker simulation
  const pulseDuration = 0.05;
  const pulseInterval = 0.09;
  const totalRings = 18; // rings for about 1.6 seconds

  for (let i = 0; i < totalRings; i++) {
    const ringStart = now + (i * pulseInterval);
    // Combine two close metallic frequencies to create natural mechanical resonance/beating
    playBeepTone(950, ringStart, pulseDuration * 0.7);
    playBeepTone(956, ringStart, pulseDuration * 0.7);
  }
}

// 5. Two-note door chime with a lingering lower note.
function playDoorChime() {
  initAudio();
  const now = audioCtx.currentTime;
  playChimeNote(659.25, now, 1.1);
  playChimeNote(523.25, now + 0.55, 1.6);
}

// Rounded tones with a short attack and a smooth decay.
function playSoftTone(freq, startTime, duration, waveform = 'sine') {
  if (!audioCtx || !mainGainNode) return;
  const osc = audioCtx.createOscillator();
  const envelope = audioCtx.createGain();
  osc.type = waveform;
  osc.frequency.setValueAtTime(freq, startTime);
  envelope.gain.setValueAtTime(0, startTime);
  envelope.gain.linearRampToValueAtTime(0.45, startTime + 0.025);
  envelope.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
  osc.connect(envelope);
  envelope.connect(mainGainNode);
  osc.start(startTime);
  osc.stop(startTime + duration);
  activeOscillators.push(osc);
}

// 6. Three warm, evenly spaced pulses.
function playSoftPulse() {
  initAudio();
  const now = audioCtx.currentTime;
  [0, 0.5, 1.0].forEach(delay => playSoftTone(440, now + delay, 0.4));
}

// 7. A short rising three-note notification.
function playRisingNotes() {
  initAudio();
  const now = audioCtx.currentTime;
  [523.25, 659.25, 783.99].forEach((freq, index) => {
    playSoftTone(freq, now + index * 0.2, 0.5);
  });
}

// 8. Triangle harmonics and a fast decay give a wooden mallet character.
function playWoodMallet() {
  initAudio();
  const now = audioCtx.currentTime;
  [783.99, 659.25, 523.25, 659.25].forEach((freq, index) => {
    playSoftTone(freq, now + index * 0.23, 0.32, 'triangle');
  });
}

// Play sound based on user state selection
function triggerSelectedSound() {
  switch (state.selectedSound) {
    case 'school-bell':
      playWestminsterChime();
      break;
    case 'digital-beep':
      playDigitalBeep();
      break;
    case 'gentle-chime':
      playGentleChime();
      break;
    case 'retro-bell':
      playRetroBell();
      break;
    case 'door-chime':
      playDoorChime();
      break;
    case 'soft-pulse':
      playSoftPulse();
      break;
    case 'rising-notes':
      playRisingNotes();
      break;
    case 'wood-mallet':
      playWoodMallet();
      break;
  }
}

// Get the loop interval length for repeating sounds
function getSoundDuration() {
  switch (state.selectedSound) {
    case 'school-bell': return 5800; // Westminster takes about 5.5s
    case 'digital-beep': return 1200; // Beep loop takes about 1s
    case 'gentle-chime': return 2500; // Chime decay takes 2s
    case 'retro-bell': return 2200;  // Bell rings for 1.6s
    case 'door-chime': return 2600;
    case 'soft-pulse': return 1800;
    case 'rising-notes': return 1400;
    case 'wood-mallet': return 1500;
    default: return 3000;
  }
}

// Start looping alarm sound when triggered
function startAlarmSoundLoop() {
  stopAllSounds();
  currentAlarmPlayCount = 0;

  triggerSelectedSound();
  currentAlarmPlayCount++;

  const intervalTime = getSoundDuration();
  alarmLoopIntervalId = setInterval(() => {
    if (state.repeatCount > 0 && currentAlarmPlayCount >= state.repeatCount) {
      stopAllSounds();
      return;
    }
    triggerSelectedSound();
    currentAlarmPlayCount++;
  }, intervalTime);
}

// ==========================================================================
// Time Parsing & Alarm Logic
// ==========================================================================
function parseTimeToMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Format date in Korean format
function getKoreanDateString(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekDays = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
  const weekDayStr = weekDays[date.getDay()];
  return `${year}년 ${month}월 ${day}일 ${weekDayStr}`;
}

// Find the next upcoming alarm and time difference
function updateCountdown() {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const currentSeconds = now.getSeconds();

  // Combine user defined active alarms and pending snooze timer
  let activeAlarms = state.alarms
    .filter(a => a.enabled)
    .map(a => ({ time: a.time, title: a.title, isSnooze: false }));

  if (state.snoozeTime) {
    activeAlarms.push({
      time: state.snoozeTime,
      title: `[미룸] ${state.snoozedAlarmTitle}`,
      isSnooze: true
    });
  }

  if (activeAlarms.length === 0) {
    nextAlarmTitleEl.textContent = '활성 알람 없음';
    nextAlarmTimeEl.textContent = '--:--';
    countdownDisplayEl.textContent = '알람을 등록하거나 활성화해주세요.';
    return;
  }

  let nextAlarm = null;
  let minDiffSeconds = Infinity;

  activeAlarms.forEach(alarm => {
    const alarmMinutes = parseTimeToMinutes(alarm.time);
    let diffSeconds = (alarmMinutes - currentMinutes) * 60 - currentSeconds;

    // If the alarm time is already passed today, calculate for tomorrow
    if (diffSeconds <= 0) {
      diffSeconds += 24 * 60 * 60; // Add 1 day in seconds
    }

    if (diffSeconds < minDiffSeconds) {
      minDiffSeconds = diffSeconds;
      nextAlarm = alarm;
    }
  });

  if (nextAlarm) {
    nextAlarmTitleEl.textContent = nextAlarm.title;
    nextAlarmTimeEl.textContent = nextAlarm.time;

    const hoursLeft = Math.floor(minDiffSeconds / 3600);
    const minutesLeft = Math.floor((minDiffSeconds % 3600) / 60);
    const secondsLeft = minDiffSeconds % 60;

    let countdownStr = '알람까지 ';
    if (hoursLeft > 0) countdownStr += `${hoursLeft}시간 `;
    if (minutesLeft > 0 || hoursLeft > 0) countdownStr += `${minutesLeft}분 `;
    countdownStr += `${secondsLeft}초 남았습니다.`;

    countdownDisplayEl.textContent = countdownStr;
  }
}

// System tick every second
function tick() {
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const seconds = String(now.getSeconds()).padStart(2, '0');

  // Update clock UI
  clockHoursEl.textContent = hours;
  clockMinutesEl.textContent = minutes;
  clockSecondsEl.textContent = seconds;
  dateDisplayEl.textContent = getKoreanDateString(now);

  const currentTimeStr = `${hours}:${minutes}`;

  // Evaluate alarm trigger condition
  if (lastTriggeredMinute !== currentTimeStr) {
    // Check normal alarms
    const matchingAlarm = state.alarms.find(a => a.enabled && a.time === currentTimeStr);

    // Check snooze alarms
    const isSnoozeMatch = state.snoozeTime === currentTimeStr;

    if (matchingAlarm || isSnoozeMatch) {
      lastTriggeredMinute = currentTimeStr;

      let alarmTitle = '';
      if (isSnoozeMatch) {
        alarmTitle = `[미룸] ${state.snoozedAlarmTitle}`;
        // Reset snooze after triggering
        state.snoozeTime = null;
        state.snoozedAlarmTitle = '';
        saveState();
      } else {
        alarmTitle = matchingAlarm.title;
      }

      triggerAlarm(alarmTitle, currentTimeStr);
    }
  }

  // Update countdown
  updateCountdown();
}

// Trigger Alarm Event
function triggerAlarm(title, timeStr) {
  if (autoDismissTimeoutId) {
    clearTimeout(autoDismissTimeoutId);
    autoDismissTimeoutId = null;
  }

  // Show modal
  alertTimeDisplayEl.textContent = timeStr;
  alertTitleEl.textContent = title;
  alarmOverlayEl.classList.add('active');

  // Play looped alarm
  startAlarmSoundLoop();

  // Auto-dismiss after 10 seconds
  autoDismissTimeoutId = setTimeout(() => {
    dismissAlarm();
  }, 10000);
}

// Dismiss Alarm
function dismissAlarm() {
  alarmOverlayEl.classList.remove('active');
  stopAllSounds();
  if (autoDismissTimeoutId) {
    clearTimeout(autoDismissTimeoutId);
    autoDismissTimeoutId = null;
  }
}

// Snooze Alarm (for 5 minutes)
function snoozeAlarm() {
  const currentTitle = alertTitleEl.textContent.replace('[미룸] ', '');
  const now = new Date();

  // Add 5 minutes to current time
  now.setMinutes(now.getMinutes() + 5);

  const snoozeH = String(now.getHours()).padStart(2, '0');
  const snoozeM = String(now.getMinutes()).padStart(2, '0');

  state.snoozeTime = `${snoozeH}:${snoozeM}`;
  state.snoozedAlarmTitle = currentTitle;

  saveState();

  // Hide modal & stop current sound
  alarmOverlayEl.classList.remove('active');
  stopAllSounds();

  if (autoDismissTimeoutId) {
    clearTimeout(autoDismissTimeoutId);
    autoDismissTimeoutId = null;
  }

  // Recalculate countdown immediately
  updateCountdown();
}

// ==========================================================================
// UI Rendering & Event Handlers
// ==========================================================================
function cancelScheduledAlarmSort() {
  if (alarmSortTimeoutId !== null) {
    clearTimeout(alarmSortTimeoutId);
    alarmSortTimeoutId = null;
  }
}

function sortAlarmsByTime() {
  cancelScheduledAlarmSort();
  state.alarms.sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
  saveState();
  renderAlarms();
}

function scheduleAlarmSort() {
  cancelScheduledAlarmSort();
  alarmSortTimeoutId = setTimeout(sortAlarmsByTime, 60_000);
}

function renderAlarms() {
  alarmsGridEl.innerHTML = '';

  state.alarms.forEach(alarm => {
    const card = document.createElement('div');
    card.className = `glass-card alarm-item ${alarm.enabled ? '' : 'disabled'}`;
    card.setAttribute('data-id', alarm.id);

    card.innerHTML = `
      <div class="alarm-item-header">
        <label class="switch-control">
          <input type="checkbox" class="alarm-toggle" aria-label="알람 활성화" ${alarm.enabled ? 'checked' : ''}>
          <span class="switch-slider"></span>
        </label>
      </div>
      <div class="alarm-inputs">
        <input type="time" class="alarm-time-input" aria-label="알람 시간" value="${alarm.time}" step="900">
        <input type="text" class="alarm-title-input" aria-label="알람 이름" placeholder="알람 라벨 입력">
      </div>
      <div class="alarm-item-footer">
        <button type="button" class="delete-alarm-btn" title="삭제">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
      </div>
    `;

    // Event Listeners for inline modifications
    const toggleEl = card.querySelector('.alarm-toggle');
    const timeInputEl = card.querySelector('.alarm-time-input');
    const titleInputEl = card.querySelector('.alarm-title-input');
    titleInputEl.value = alarm.title;
    const deleteBtnEl = card.querySelector('.delete-alarm-btn');

    toggleEl.addEventListener('change', (e) => {
      alarm.enabled = e.target.checked;
      card.classList.toggle('disabled', !alarm.enabled);
      saveState();
      updateCountdown();
    });

    timeInputEl.addEventListener('change', (e) => {
      alarm.time = e.target.value;
      saveState();
      updateCountdown();
      scheduleAlarmSort();
    });

    titleInputEl.addEventListener('input', (e) => {
      alarm.title = e.target.value;
      saveState();
      // Update the countdown without rebuilding the card being edited.
      updateCountdown();
    });

    deleteBtnEl.addEventListener('click', () => {
      state.alarms = state.alarms.filter(a => a.id !== alarm.id);
      saveState();
      renderAlarms();
      updateCountdown();
    });

    alarmsGridEl.appendChild(card);
  });

  alarmCountEl.textContent = `${state.alarms.length}개 등록됨`;
}

// Bind Settings Controls to State
function initControls() {
  // Volume Slider
  volumeSliderEl.value = state.volume;
  volumePercentageEl.textContent = `${state.volume}%`;

  volumeSliderEl.addEventListener('input', (e) => {
    state.volume = parseInt(e.target.value);
    volumePercentageEl.textContent = `${state.volume}%`;
    saveState();
    updateGainNodeVolume();
    updateVolumeIcon();
  });

  // Sound Selector
  soundSelectEl.value = state.selectedSound;
  soundSelectEl.addEventListener('change', (e) => {
    state.selectedSound = e.target.value;
    saveState();
    // Play a brief sound sample on setting change
    playTestSoundSample();
  });

  // Repeat Selector
  if (repeatSelectEl) {
    repeatSelectEl.value = state.repeatCount;
    repeatSelectEl.addEventListener('change', (e) => {
      state.repeatCount = parseInt(e.target.value);
      saveState();
    });
  }

  // Mute Button
  muteBtnEl.addEventListener('click', () => {
    state.isMuted = !state.isMuted;
    saveState();
    updateVolumeIcon();
    updateGainNodeVolume();
  });

  // Update volume icon to represent mute state
  updateVolumeIcon();
}

function updateVolumeIcon() {
  if (state.isMuted || state.volume === 0) {
    volumeIconEl.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
    muteBtnEl.classList.add('muted');
  } else if (state.volume < 40) {
    volumeIconEl.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
    muteBtnEl.classList.remove('muted');
  } else {
    volumeIconEl.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
    muteBtnEl.classList.remove('muted');
  }
}

// Play test sample once when selecting a sound or clicking test button
function playTestSoundSample() {
  stopAllSounds();
  initAudio();
  triggerSelectedSound();

  testSoundBtnEl.disabled = true;
  stopTestBtnEl.disabled = false;

  const duration = getSoundDuration();
  testSoundTimeoutId = setTimeout(() => {
    testSoundBtnEl.disabled = false;
    stopTestBtnEl.disabled = true;
  }, duration);
}

// Bind Action Buttons
function bindActions() {
  // Manual sorting applies immediately and cancels any pending automatic sort.
  sortAlarmsBtnEl.addEventListener('click', sortAlarmsByTime);

  // Test Button
  testSoundBtnEl.addEventListener('click', playTestSoundSample);

  // Stop Test Button
  stopTestBtnEl.addEventListener('click', () => {
    stopAllSounds();
    testSoundBtnEl.disabled = false;
    stopTestBtnEl.disabled = true;
  });

  // Add Alarm
  addAlarmBtnEl.addEventListener('click', () => {
    // Generate a default alarm time 1 hour from now or 09:00 if invalid
    const now = new Date();
    now.setHours(now.getHours() + 1);
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:00`;

    const newAlarm = {
      id: Date.now().toString(),
      time: timeStr,
      title: '새 알람',
      enabled: true
    };

    state.alarms.push(newAlarm);
    saveState();
    renderAlarms();
    updateCountdown();

    // Scroll new alarm card into view
    setTimeout(() => {
      const newCard = document.querySelector(`[data-id="${newAlarm.id}"]`);
      if (newCard) {
        newCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        newCard.querySelector('.alarm-title-input').focus();
        newCard.querySelector('.alarm-title-input').select();
      }
    }, 100);
  });

  // Reset to default school hours
  resetDefaultBtnEl.addEventListener('click', () => {
    if (confirm('모든 알람 설정을 초기 교시 시간표 스케줄로 복원하시겠습니까?')) {
      resetToDefaultState();
      renderAlarms();
      updateCountdown();
      // Update UI Controls
      volumeSliderEl.value = state.volume;
      volumePercentageEl.textContent = `${state.volume}%`;
      soundSelectEl.value = state.selectedSound;
      if (repeatSelectEl) repeatSelectEl.value = state.repeatCount;
      updateVolumeIcon();
      updateGainNodeVolume();
    }
  });

  // Clear all alarms
  clearAllBtnEl.addEventListener('click', () => {
    if (confirm('등록된 모든 알람을 지우시겠습니까?')) {
      cancelScheduledAlarmSort();
      state.alarms = [];
      state.snoozeTime = null;
      state.snoozedAlarmTitle = '';
      saveState();
      renderAlarms();
      updateCountdown();
    }
  });

  // Overlay Modal Actions
  dismissAlarmBtnEl.addEventListener('click', dismissAlarm);
  snoozeAlarmBtnEl.addEventListener('click', snoozeAlarm);

  // Initialize Web Audio Context on first click, keypress, or touch to unlock sound autoplay
  const resumeEvents = ['click', 'keydown', 'touchstart'];
  const handleGesture = () => {
    try {
      initAudio();
      if (audioCtx && audioCtx.state === 'running') {
        resumeEvents.forEach(evt => document.removeEventListener(evt, handleGesture));
      }
    } catch(e) {
      console.warn("AudioContext failed to resume", e);
    }
  };
  resumeEvents.forEach(evt => document.addEventListener(evt, handleGesture));

  if (audioStatusBadgeEl) {
    audioStatusBadgeEl.addEventListener('click', (e) => {
      e.stopPropagation();
      handleGesture();
      if (audioCtx && audioCtx.state === 'running') {
        playTestSoundSample();
      }
    });
  }
}

// ==========================================================================
// Initialization
// ==========================================================================
function init() {
  initTheme();
  loadState();
  initControls();
  renderAlarms();
  bindActions();

  // Create AudioContext early so we can check if it starts in a suspended state
  try {
    initAudio();
  } catch (e) {
    console.warn("Early AudioContext creation failed:", e);
  }

  // Start clock ticking
  tick();
  setInterval(tick, 1000);
}

document.addEventListener('DOMContentLoaded', init);
