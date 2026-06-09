// Wires the registry, engine, renderer, and DOM controls together, and runs
// the auto-play driver (speed -> ops-per-tick + delay).

import { algorithmsByKey } from './algorithms.js';
import { createEngine } from './engine.js';
import { createRenderer } from './renderer.js';
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

const MIN_SIZE = 3;
const MAX_SIZE = 1000;
const DEFAULT_SIZE = 100;
const DEFAULT_SPEED = 55;
const LARGE_STEP = 50;
const BOGO_CAP = 50000;

const $ = (id) => document.getElementById(id);

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
  progress: $('progress'),
  status: $('status'),
  modalOverlay: $('modal-overlay'),
  modalSidebar: $('modal-sidebar'),
  modalContent: $('modal-content'),
  modalClose: $('modal-close'),
  statsPanel: $('stats-panel'),
};

const engine = createEngine();
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
};

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

// --- time --------------------------------------------------------------------

function currentTimeSec() {
  let ms = state.elapsedMs;
  if (state.playing) ms += performance.now() - state.playStartedAt;
  return ms / 1000;
}

// --- rendering ---------------------------------------------------------------

const isBogo = () => state.algorithm === 'bogo';
const capForAlgorithm = (key) => (key === 'bogo' ? BOGO_CAP : undefined);

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

function renderFrame() {
  // Smooth bar-height tweens while stepping/paused or at one-op-per-frame
  // speeds; snap heights when frames batch many ops.
  renderer.setSmooth(!state.playing || opsPerTick() === 1);
  renderer.frame(engine.array, engine.sorted, engine.pivots, engine.currentOp());
  renderer.setStats(engine.stats, currentTimeSec(), isBogo());
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

let pickAlgorithmPromptTimer = null;
let capWarningTimer = null;

function clearPickAlgorithmPrompt() {
  clearTimeout(pickAlgorithmPromptTimer);
  dom.status.classList.remove('needs-algorithm');
  dom.algoButtons.classList.remove('needs-selection');
}

function promptPickAlgorithm() {
  dom.status.textContent = 'Select an algorithm above';
  dom.status.classList.add('needs-algorithm');
  dom.algoButtons.classList.add('needs-selection');
  clearTimeout(pickAlgorithmPromptTimer);
  pickAlgorithmPromptTimer = setTimeout(() => {
    dom.status.classList.remove('needs-algorithm');
    dom.algoButtons.classList.remove('needs-selection');
    if (engine.total === 0) dom.status.textContent = 'Select an algorithm to visualize.';
  }, 2500);
}

function flashCapWarning() {
  clearTimeout(capWarningTimer);
  dom.status.classList.remove('needs-cap-warning');
  void dom.status.offsetWidth;
  dom.status.classList.add('needs-cap-warning');
  capWarningTimer = setTimeout(() => {
    dom.status.classList.remove('needs-cap-warning');
  }, 1300);
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
      return;
    }
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
  renderFrame();
}

// --- array / algorithm selection --------------------------------------------

function regenerate() {
  pause();
  state.baseArray = generateArray(state.size, state.range, state.duplicates, state.distribution);
  state.elapsedMs = 0;
  renderer.setArray(state.baseArray);
  if (state.algorithm) {
    engine.record(algorithmsByKey[state.algorithm].gen, state.baseArray, capForAlgorithm(state.algorithm));
    renderFrame();
    if (engine.truncated) flashCapWarning();
  } else {
    setActiveButton(null);
    engine.record(() => [].values(), state.baseArray); // empty recording
    renderer.clearHighlights(state.baseArray, engine.sorted);
    renderer.setStats(engine.stats, 0, false);
    dom.progress.hidden = false;
    dom.progress.textContent = '0%';
    dom.status.textContent = 'Select an algorithm to visualize.';
  }
}

function runAlgorithm(key, array = state.baseArray) {
  pause();
  clearPickAlgorithmPrompt();
  state.algorithm = key;
  state.baseArray = array;
  state.elapsedMs = 0;
  setActiveButton(key);
  engine.record(algorithmsByKey[key].gen, array, capForAlgorithm(key));
  renderer.setArray(array);
  renderFrame();
  if (engine.truncated) flashCapWarning();
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
  dom.speed.value = DEFAULT_SPEED;
  closeModal();
  setTimeout(() => {
    runAlgorithm(key, array);
    play();
  }, 250);
}

// --- array controls ----------------------------------------------------------

function generateFromControls() {
  const value = parseInt(dom.sizeInput.value, 10);
  if (Number.isNaN(value) || value < MIN_SIZE || value > MAX_SIZE) {
    dom.sizeInput.value = state.size;
    return;
  }
  state.size = value;
  state.range = dom.range.value;
  state.duplicates = dom.duplicates.value;
  state.distribution = dom.distribution.value;
  regenerate();
}

// --- modal -------------------------------------------------------------------

function openModal() {
  dom.modalOverlay.classList.add('active');
  document.body.style.overflow = 'hidden';
  dom.modalContent.dispatchEvent(new Event('scroll'));
}

function closeModal() {
  dom.modalOverlay.classList.remove('active');
  document.body.style.overflow = '';
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
  dom.moreInfo.addEventListener('click', openModal);

  dom.playPause.addEventListener('click', togglePlay);
  dom.stepForward.addEventListener('click', () => stepMany(true));
  dom.stepBack.addEventListener('click', () => stepMany(false));
  dom.stepForwardLarge.addEventListener('click', () => stepMany(true, LARGE_STEP));
  dom.stepBackLarge.addEventListener('click', () => stepMany(false, LARGE_STEP));

  dom.modalClose.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal();
      return;
    }

    const target = e.target;
    const isTyping =
      target instanceof HTMLInputElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement ||
      target?.isContentEditable;
    const isDisclosure = target instanceof HTMLElement && target.tagName === 'SUMMARY';
    if ((e.key === ' ' || e.key === 'Enter') && !isTyping && !isDisclosure && !dom.modalOverlay.classList.contains('active')) {
      e.preventDefault();
      togglePlay();
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
  buildAlgorithmButtons(dom.algoButtons, (key) => runAlgorithm(key));
  buildDistributionOptions(dom.range, rangeGroups);
  buildDistributionOptions(dom.duplicates, duplicateGroups);
  buildDistributionOptions(dom.distribution, distributionGroups);
  buildModal(
    { sidebar: dom.modalSidebar, content: dom.modalContent },
    runPreset
  );
  dom.sizeInput.value = state.size;
  dom.speed.value = DEFAULT_SPEED;
  bindEvents();
  regenerate();
}

init();
