// Wires the registry, engine, renderer, and DOM controls together, and runs
// the auto-play driver (speed -> ops-per-tick + delay).

import { algorithmsByKey } from './algorithms.js';
import { createAudio } from './audio.js';
import { createEngine } from './engine.js';
import { createRenderer, SMOOTH_MAX_BARS } from './renderer.js';
import {
  distributionGroups,
  duplicateGroups,
  generateArray,
  bestCaseArray,
  presetForAlgorithmCase,
  rangeGroups,
  worstCaseArray,
  randomCaseArray,
} from './arrays.js';
import {
  buildAlgorithmButtons,
  buildModal,
  buildDistributionOptions,
} from './ui.js';

const MIN_SIZE = 2;
const MAX_SIZE = 2000;
const DEFAULT_SIZE = 30;
const DEFAULT_SPEED = 35;
const LARGE_STEP = 50;
const BOGO_CAP = 50000;
// Every bogo shuffle op snapshots the whole array twice, so bound total
// recorded memory rather than shuffle count alone.
const BOGO_SNAPSHOT_BUDGET = 4_000_000;

const $ = (id) => document.getElementById(id);
const optionValues = (groups) =>
  new Set(groups.flatMap((group) => group.options.map(([value]) => value)));

const validRanges = optionValues(rangeGroups);
const validDuplicates = optionValues(duplicateGroups);
const validDistributions = optionValues(distributionGroups);

const dom = {
  container: $('array-container'),
  algoButtons: $('algo-buttons'),
  sizeInput: $('size-input'),
  range: $('range'),
  duplicates: $('duplicates'),
  distribution: $('distribution'),
  moreInfo: $('more-info'),
  stepBackLarge: $('step-back-large'),
  stepBack: $('step-back'),
  playPause: $('play-pause'),
  stepForward: $('step-forward'),
  stepForwardLarge: $('step-forward-large'),
  speed: $('speed'),
  opsRate: $('ops-rate'),
  scrub: $('scrub'),
  progress: $('progress'),
  status: $('status'),
  modalOverlay: $('modal-overlay'),
  modalSidebar: $('modal-sidebar'),
  modalContent: $('modal-content'),
  modalClose: $('modal-close'),
  statsPanel: $('stats-panel'),
  regenerate: $('regenerate'),
  toast: $('toast'),
  toastMessage: $('toast-message'),
  soundToggle: $('sound-toggle'),
  shortcutsButton: $('shortcuts-button'),
  shortcutsOverlay: $('shortcuts-overlay'),
  shortcutsClose: $('shortcuts-close'),
};

const engine = createEngine();
const audio = createAudio();
const renderer = createRenderer({
  container: dom.container,
  stats: {
    panel: dom.statsPanel,
    comparisons: $('stat-comparisons'),
    writes: $('stat-writes'),
    shuffles: $('stat-shuffles'),
    time: $('stat-time'),
  },
});

const state = {
  size: DEFAULT_SIZE,
  range: 'length',
  duplicates: 'none',
  distribution: 'random',
  algorithm: null,
  baseArray: [],
  playing: false,
  timer: null,
  elapsedMs: 0,
  playStartedAt: 0,
  maxValue: 1,
  speed: DEFAULT_SPEED,
};

// --- shareable URL state -----------------------------------------------------

function clampNumber(value, min, max, fallback) {
  if (value === null || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function optionParam(params, key, validValues, fallback) {
  const value = params.get(key);
  return value && validValues.has(value) ? value : fallback;
}

function applyUrlState() {
  const params = new URLSearchParams(window.location.search);
  const algorithm = params.get('algo');

  state.size = clampNumber(params.get('size'), MIN_SIZE, MAX_SIZE, DEFAULT_SIZE);
  state.range = optionParam(params, 'range', validRanges, 'length');
  state.duplicates = optionParam(params, 'duplicates', validDuplicates, 'none');
  state.distribution = optionParam(params, 'distribution', validDistributions, 'random');
  state.algorithm = algorithm && algorithmsByKey[algorithm] ? algorithm : null;
  state.speed = clampNumber(params.get('speed'), 0, 100, DEFAULT_SPEED);
}

function syncUrlState() {
  const params = new URLSearchParams();
  const hasCustomControls =
    state.size !== DEFAULT_SIZE ||
    state.range !== 'length' ||
    state.duplicates !== 'none' ||
    state.distribution !== 'random' ||
    state.speed !== DEFAULT_SPEED;

  if (state.algorithm) params.set('algo', state.algorithm);
  if (hasCustomControls || state.algorithm) {
    params.set('size', String(state.size));
    params.set('range', state.range);
    params.set('duplicates', state.duplicates);
    params.set('distribution', state.distribution);
    if (state.speed !== DEFAULT_SPEED) params.set('speed', String(state.speed));
  }

  const nextSearch = params.toString();
  const nextUrl = `${window.location.pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`;
  if (`${window.location.pathname}${window.location.search}${window.location.hash}` !== nextUrl) {
    window.history.replaceState(null, '', nextUrl);
  }
}

// --- speed mapping -----------------------------------------------------------

function frameDelay() {
  const speed = Number(dom.speed.value); // 0..100
  return speed >= 40 ? 16 : 16 + (40 - speed) * 8; // up to ~336ms when slow
}

function opsPerTick() {
  const speed = Number(dom.speed.value);
  if (speed <= 40) return 1;
  const t = (speed - 40) / 60;
  return Math.max(1, Math.round(t * t * 320));
}

// The speed mapping is nonlinear (delay below the midpoint, batching above),
// so show the effective rate to make the slider legible.
function updateOpsRate() {
  const perSec = opsPerTick() * (1000 / frameDelay());
  const text =
    perSec >= 1000
      ? `${(perSec / 1000).toFixed(perSec >= 10000 ? 0 : 1)}k ops/s`
      : `${Math.round(perSec)} ops/s`;
  dom.opsRate.textContent = text;
}

// --- time --------------------------------------------------------------------

function currentTimeSec() {
  let ms = state.elapsedMs;
  if (state.playing) ms += performance.now() - state.playStartedAt;
  return ms / 1000;
}

// --- rendering ---------------------------------------------------------------

const isBogo = () => state.algorithm === 'bogo';
const capForAlgorithm = (key) =>
  key === 'bogo'
    ? Math.max(200, Math.min(BOGO_CAP, Math.floor(BOGO_SNAPSHOT_BUDGET / state.size)))
    : undefined;

function setActiveButton(key) {
  dom.algoButtons.querySelectorAll('.algo-button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.algorithm === key);
  });

  const activeButton = key
    ? dom.algoButtons.querySelector(`.algo-button[data-algorithm="${key}"]`)
    : null;
  const moreToggle = dom.algoButtons.querySelector('.more-toggle');
  if (key && !activeButton && moreToggle?.getAttribute('aria-expanded') === 'false') {
    moreToggle.click();
    setActiveButton(key);
    return;
  }
  moreToggle?.classList.toggle('active', !!key && !activeButton);
}

// Scrub bar caches: avoid touching the DOM when nothing changed (renderFrame
// runs every playback tick).
let scrubMaxCache = -1;
let scrubValueCache = -1;

function syncScrub() {
  if (scrubMaxCache !== engine.total) {
    dom.scrub.max = engine.total;
    dom.scrub.disabled = engine.total === 0;
    scrubMaxCache = engine.total;
  }
  if (scrubValueCache !== engine.cursor) {
    dom.scrub.value = engine.cursor;
    scrubValueCache = engine.cursor;
  }
}

function renderFrame() {
  // Smooth bar-height tweens while stepping/paused or at one-op-per-frame
  // speeds; snap heights when frames batch many ops.
  renderer.setSmooth(!state.playing || opsPerTick() === 1);
  renderer.frame(engine.array, engine.sorted, engine.pivots, engine.currentOp());
  renderer.setStats(engine.stats, currentTimeSec(), isBogo());
  syncScrub();
  const hideProgress = isBogo() || engine.truncated;
  dom.progress.hidden = hideProgress;
  const progress = engine.total === 0 ? 0 : Math.round((engine.cursor / engine.total) * 100);
  dom.progress.textContent = hideProgress ? '' : `${progress}%`;
  if (engine.total === 0) {
    dom.status.textContent = 'Select an algorithm to visualize.';
  } else if (engine.done) {
    dom.status.textContent = engine.truncated ? `Stopped at cap (${engine.cap.toLocaleString()} steps)` : 'Sorted';
  } else if (engine.truncated) {
    dom.status.textContent = `Capped at ${engine.cap.toLocaleString()} steps`;
  } else {
    dom.status.textContent = state.playing ? 'Sorting...' : 'Paused';
  }
}

function setPlayIcon(playing) {
  dom.playPause.innerHTML = playing
    ? '<i class="fas fa-pause" aria-hidden="true"></i>'
    : '<i class="fas fa-play" aria-hidden="true"></i>';
}

// --- warnings ------------------------------------------------------------
// All transient warnings go through one toast so they look and behave the
// same: amber banner, icon, auto-dismiss, latest message wins.

let toastTimer = null;
let toolbarPulseTimer = null;

function showWarning(message) {
  dom.toastMessage.textContent = message;
  dom.toast.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove('visible'), 3500);
}

function hideWarning() {
  clearTimeout(toastTimer);
  dom.toast.classList.remove('visible');
}

function clearPickAlgorithmPrompt() {
  clearTimeout(toolbarPulseTimer);
  dom.algoButtons.classList.remove('needs-selection');
  hideWarning();
}

function promptPickAlgorithm() {
  showWarning('Select an algorithm above to start sorting.');
  dom.algoButtons.classList.add('needs-selection');
  clearTimeout(toolbarPulseTimer);
  toolbarPulseTimer = setTimeout(() => dom.algoButtons.classList.remove('needs-selection'), 1300);
}

function warnTruncated() {
  showWarning(
    `This run exceeds the ${engine.cap.toLocaleString()}-step recording cap — playback shows the first ${engine.cap.toLocaleString()} steps.`
  );
}

// --- sound ---------------------------------------------------------------
// One blip per painted frame (not per op): at batched speeds the most recent
// op of the tick is what's on screen, so it's also what you hear.

const SOUND_STORAGE_KEY = 'sav:sound';

function soundForCurrentOp() {
  const op = engine.currentOp();
  if (!op || !audio.enabled) return;
  const arr = engine.array;
  if (op.type === 'compare') {
    audio.blip(arr[op.indices[0]] / state.maxValue, 'compare');
  } else if (op.type === 'swap') {
    audio.blip(arr[op.indices[0]] / state.maxValue, 'swap');
  } else if (op.type === 'overwrite') {
    audio.blip(op.value / state.maxValue, 'write');
  } else if (op.type === 'setArray') {
    audio.blip(0.5, 'shuffle');
  }
}

function setSoundEnabled(on, { persist = true } = {}) {
  audio.setEnabled(on);
  dom.soundToggle.classList.toggle('active', on);
  dom.soundToggle.setAttribute('aria-pressed', String(on));
  dom.soundToggle.innerHTML = on
    ? '<i class="fas fa-volume-high" aria-hidden="true"></i>'
    : '<i class="fas fa-volume-xmark" aria-hidden="true"></i>';
  if (persist) {
    try {
      localStorage.setItem(SOUND_STORAGE_KEY, on ? '1' : '0');
    } catch {
      /* storage unavailable — preference just won't persist */
    }
  }
}

function readSoundPreference() {
  try {
    return localStorage.getItem(SOUND_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

// --- sound / array-size coupling ---------------------------------------------
// Sound becomes chaotic with many bars, so auto-mute whenever the array
// exceeds the smooth-rendering threshold and restore when it drops back.

const SOUND_TOOLTIP_DEFAULT = 'Hear the sort — pitch follows the values being touched (M)';
const SOUND_TOOLTIP_MUTED_FOR_SIZE = 'Sound is disabled for large arrays — reduce the size to re-enable';
let soundMutedForSize = false;

function updateSoundForSize(n) {
  const tooBig = n > SMOOTH_MAX_BARS;
  if (tooBig && !soundMutedForSize) {
    soundMutedForSize = true;
    setSoundEnabled(false, { persist: false });
    dom.soundToggle.classList.add('size-muted');
    dom.soundToggle.dataset.tooltip = SOUND_TOOLTIP_MUTED_FOR_SIZE;
  } else if (!tooBig && soundMutedForSize) {
    soundMutedForSize = false;
    setSoundEnabled(readSoundPreference(), { persist: false });
    dom.soundToggle.classList.remove('size-muted');
    dom.soundToggle.dataset.tooltip = SOUND_TOOLTIP_DEFAULT;
  }
}

// --- driver ------------------------------------------------------------------

function play() {
  if (engine.total === 0) {
    promptPickAlgorithm();
    return;
  }
  if (state.playing) return;
  if (engine.done) {
    engine.seek(0); // replay from the start
    state.elapsedMs = 0;
    renderFrame();
  }
  state.playing = true;
  state.playStartedAt = performance.now();
  setPlayIcon(true);

  const tick = () => {
    if (!state.playing) return;
    const batch = opsPerTick();
    for (let k = 0; k < batch; k++) {
      if (!engine.stepForward()) break;
    }
    renderFrame();
    if (engine.done) {
      pause();
      if (!engine.truncated) audio.finish();
      return;
    }
    soundForCurrentOp();
    state.timer = setTimeout(tick, frameDelay());
  };
  tick();
}

function pause() {
  const wasPlaying = state.playing;
  if (state.playing) {
    state.elapsedMs += performance.now() - state.playStartedAt;
  }
  state.playing = false;
  clearTimeout(state.timer);
  setPlayIcon(false);
  if (wasPlaying) renderFrame();
}

function togglePlay() {
  state.playing ? pause() : play();
}

function stepMany(forward, count = 1) {
  if (engine.total === 0) {
    promptPickAlgorithm();
    return;
  }
  pause();
  for (let i = 0; i < count; i++) {
    if (forward ? !engine.stepForward() : !engine.stepBackward()) break;
  }
  soundForCurrentOp();
  renderFrame();
}

// --- array / algorithm selection --------------------------------------------

function regenerate() {
  pause();
  state.baseArray = generateArray(state.size, state.range, state.duplicates, state.distribution);
  state.maxValue = Math.max(...state.baseArray, 1);
  updateSoundForSize(state.baseArray.length);
  state.elapsedMs = 0;
  renderer.setArray(state.baseArray);
  if (state.algorithm) {
    engine.record(algorithmsByKey[state.algorithm].gen, state.baseArray, capForAlgorithm(state.algorithm));
    renderFrame();
    if (engine.truncated) warnTruncated();
  } else {
    setActiveButton(null);
    engine.record(() => [].values(), state.baseArray); // empty recording
    renderer.clearHighlights(state.baseArray, engine.sorted);
    renderer.setStats(engine.stats, 0, false);
    dom.progress.hidden = false;
    dom.progress.textContent = '0%';
    dom.status.textContent = 'Select an algorithm to visualize.';
  }
  syncUrlState();
}

function runAlgorithm(key, array = state.baseArray) {
  pause();
  clearPickAlgorithmPrompt();
  state.algorithm = key;
  state.baseArray = array;
  state.maxValue = Math.max(...array, 1);
  updateSoundForSize(array.length);
  state.elapsedMs = 0;
  setActiveButton(key);
  engine.record(algorithmsByKey[key].gen, array, capForAlgorithm(key));
  renderer.setArray(array);
  renderFrame();
  if (engine.truncated) warnTruncated();
  syncUrlState();
}

function runPreset(key, caseType) {
  const size = DEFAULT_SIZE;
  const makers = { best: bestCaseArray, worst: worstCaseArray, random: randomCaseArray };
  const array = (makers[caseType] ?? randomCaseArray)(key, size);
  const preset = presetForAlgorithmCase(key, caseType);
  state.size = array.length;
  state.range = preset.range;
  state.duplicates = preset.duplicates;
  state.distribution = preset.distribution;
  dom.sizeInput.value = array.length;
  dom.range.value = preset.range;
  dom.duplicates.value = preset.duplicates;
  dom.distribution.value = preset.distribution;
  state.speed = DEFAULT_SPEED;
  dom.speed.value = DEFAULT_SPEED;
  updateOpsRate();
  closeModal();
  setTimeout(() => {
    runAlgorithm(key, array);
    play();
  }, 250);
}

// --- array controls ----------------------------------------------------------

function generateFromControls() {
  const raw = parseInt(dom.sizeInput.value, 10);
  let value = raw;
  if (Number.isNaN(raw)) {
    value = state.size;
    showWarning(`Enter a size between ${MIN_SIZE} and ${MAX_SIZE.toLocaleString()}.`);
  } else if (raw < MIN_SIZE || raw > MAX_SIZE) {
    value = Math.min(MAX_SIZE, Math.max(MIN_SIZE, raw));
    showWarning(
      `Size must be between ${MIN_SIZE} and ${MAX_SIZE.toLocaleString()} — using ${value.toLocaleString()}.`
    );
  }
  dom.sizeInput.value = value;
  state.size = value;
  state.range = dom.range.value;
  state.duplicates = dom.duplicates.value;
  state.distribution = dom.distribution.value;
  regenerate();
}

// --- modal -------------------------------------------------------------------

let docsModal = null; // { scrollToAlgorithm } from buildModal

function openModal() {
  dom.modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  dom.modalContent.dispatchEvent(new Event('scroll'));
}

// Deep link from an algorithm chip's info icon straight to its docs section.
function openModalAt(key) {
  openModal();
  docsModal?.scrollToAlgorithm(key, 'auto');
}

function closeModal() {
  dom.modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
}

function openShortcuts() {
  dom.shortcutsOverlay.classList.add('active');
}

function closeShortcuts() {
  dom.shortcutsOverlay.classList.remove('active');
}

// --- events ------------------------------------------------------------------

function bindEvents() {
  dom.sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      generateFromControls();
    }
  });
  dom.sizeInput.addEventListener('change', generateFromControls);
  dom.range.addEventListener('change', generateFromControls);
  dom.duplicates.addEventListener('change', generateFromControls);
  dom.distribution.addEventListener('change', generateFromControls);
  dom.regenerate.addEventListener('click', generateFromControls);
  dom.moreInfo.addEventListener('click', openModal);

  dom.playPause.addEventListener('click', togglePlay);
  dom.stepForward.addEventListener('click', () => stepMany(true));
  dom.stepBack.addEventListener('click', () => stepMany(false));
  dom.stepForwardLarge.addEventListener('click', () => stepMany(true, LARGE_STEP));
  dom.stepBackLarge.addEventListener('click', () => stepMany(false, LARGE_STEP));

  dom.speed.addEventListener('input', () => {
    state.speed = Number(dom.speed.value);
    updateOpsRate();
    syncUrlState();
  });

  // Scrubbing: input events can fire far faster than frames, and a long drag
  // can ask for seeks millions of ops apart. Coalesce to one seek + one paint
  // per animation frame, reading the latest slider value at frame time.
  let scrubPending = false;
  dom.scrub.addEventListener('input', () => {
    pause();
    if (scrubPending) return;
    scrubPending = true;
    requestAnimationFrame(() => {
      scrubPending = false;
      engine.seek(Number(dom.scrub.value));
      renderFrame();
    });
  });

  dom.modalClose.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) closeModal();
  });

  dom.soundToggle.addEventListener('click', () => {
    if (soundMutedForSize) return;
    setSoundEnabled(!audio.enabled);
  });
  dom.shortcutsButton.addEventListener('click', openShortcuts);
  dom.shortcutsClose.addEventListener('click', closeShortcuts);
  dom.shortcutsOverlay.addEventListener('click', (e) => {
    if (e.target === dom.shortcutsOverlay) closeShortcuts();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      // Close the topmost layer only: shortcuts sit above the docs modal.
      if (dom.shortcutsOverlay.classList.contains('active')) closeShortcuts();
      else closeModal();
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (dom.modalOverlay.classList.contains('active')) return;
    if (dom.shortcutsOverlay.classList.contains('active')) return;

    const target = e.target;
    // Sliders handle their own arrow keys but don't use space/enter/letters.
    const isSlider = target instanceof HTMLInputElement && target.type === 'range';
    const isTyping =
      (target instanceof HTMLInputElement && !isSlider) ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable;
    const isDisclosure = target instanceof HTMLElement && target.tagName === 'SUMMARY';
    if (isTyping) return;

    if ((e.key === ' ' || e.key === 'Enter') && !isDisclosure) {
      e.preventDefault();
      togglePlay();
    } else if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && !isSlider) {
      e.preventDefault();
      stepMany(e.key === 'ArrowRight', e.shiftKey ? LARGE_STEP : 1);
    } else if (e.key === 'r' || e.key === 'R') {
      generateFromControls();
    } else if (e.key === 'm' || e.key === 'M') {
      if (!soundMutedForSize) setSoundEnabled(!audio.enabled);
    } else if (e.key === '?') {
      openShortcuts();
    }
  });

  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      renderer.relayout(engine.array);
      renderFrame();
    }, 120);
  });
}

// --- init --------------------------------------------------------------------

function init() {
  applyUrlState();
  buildAlgorithmButtons(dom.algoButtons, (key) => runAlgorithm(key), openModalAt, () => state.algorithm);
  buildDistributionOptions(dom.range, rangeGroups);
  buildDistributionOptions(dom.duplicates, duplicateGroups);
  buildDistributionOptions(dom.distribution, distributionGroups);
  docsModal = buildModal(
    { sidebar: dom.modalSidebar, content: dom.modalContent },
    runPreset
  );
  dom.sizeInput.value = state.size;
  dom.range.value = state.range;
  dom.duplicates.value = state.duplicates;
  dom.distribution.value = state.distribution;
  dom.speed.value = state.speed;
  updateOpsRate();
  setSoundEnabled(readSoundPreference(), { persist: false });
  bindEvents();
  regenerate();
}

init();
