// Wires the registry, engine, renderer, and DOM controls together, and runs
// the auto-play driver (speed -> ops-per-tick + delay).

import { algorithmsByKey } from './algorithms.js';
import { createEngine } from './engine.js';
import { createRenderer } from './renderer.js';
import {
  generateArray,
  distributionLabels,
  bestCaseArray,
  worstCaseArray,
  randomCaseArray,
} from './arrays.js';
import {
  buildAlgorithmButtons,
  buildModal,
  buildDistributionOptions,
} from './ui.js';

const MIN_SIZE = 3;
const MAX_SIZE = 300;
const DEFAULT_SIZE = 100;
const DEFAULT_SPEED = 55;

const $ = (id) => document.getElementById(id);

const dom = {
  container: $('array-container'),
  algoButtons: $('algo-buttons'),
  sizeInput: $('size-input'),
  sizeUpdate: $('size-update'),
  distribution: $('distribution'),
  newArray: $('new-array'),
  moreInfo: $('more-info'),
  stepBack: $('step-back'),
  playPause: $('play-pause'),
  stepForward: $('step-forward'),
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

function setActiveButton(key) {
  dom.algoButtons.querySelectorAll('.algo-button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.algorithm === key);
  });
  const activeMoreButton = key
    ? dom.algoButtons.querySelector(`.more-algorithms-content .algo-button[data-algorithm="${key}"]`)
    : null;
  if (activeMoreButton) {
    const moreContent = dom.algoButtons.querySelector('.more-algorithms-content');
    const moreToggle = dom.algoButtons.querySelector('.more-toggle');
    moreContent?.classList.add('open');
    moreToggle?.setAttribute('aria-expanded', 'true');
    moreToggle?.setAttribute('aria-label', 'Hide more algorithms');
    if (moreToggle) {
      moreToggle.dataset.tooltip = 'Hide more algorithms';
      moreToggle.classList.remove('active');
    }
  } else {
    dom.algoButtons.querySelector('.more-toggle')?.classList.remove('active');
  }
}

function renderFrame() {
  renderer.frame(engine.array, engine.sorted, engine.currentOp());
  renderer.setStats(engine.stats, currentTimeSec(), isBogo());
  const progress = engine.total === 0 ? 0 : Math.round((engine.cursor / engine.total) * 100);
  dom.progress.textContent = `${progress}%`;
  if (engine.total === 0) {
    dom.status.textContent = 'Pick an algorithm';
  } else if (engine.done) {
    dom.status.textContent = engine.truncated ? `Stopped at cap (${engine.cap.toLocaleString()} steps)` : 'Sorted';
  } else {
    dom.status.textContent = state.playing ? 'Sorting...' : 'Paused';
  }
}

function setPlayIcon(playing) {
  dom.playPause.innerHTML = playing
    ? '<i class="fas fa-pause" aria-hidden="true"></i>'
    : '<i class="fas fa-play" aria-hidden="true"></i>';
}

// --- driver ------------------------------------------------------------------

function play() {
  if (engine.total === 0 || state.playing) return;
  if (engine.done) engine.seek(0); // replay from the start
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

function stepOnce(forward) {
  pause();
  forward ? engine.stepForward() : engine.stepBackward();
  renderFrame();
}

// --- array / algorithm selection --------------------------------------------

function regenerate() {
  pause();
  state.baseArray = generateArray(state.size, state.distribution);
  state.elapsedMs = 0;
  renderer.setArray(state.baseArray);
  if (state.algorithm) {
    engine.record(algorithmsByKey[state.algorithm].gen, state.baseArray);
    renderFrame();
  } else {
    setActiveButton(null);
    engine.record(() => [].values(), state.baseArray); // empty recording
    renderer.clearHighlights(state.baseArray, engine.sorted);
    renderer.setStats(engine.stats, 0, false);
    dom.progress.textContent = '0%';
    dom.status.textContent = 'Pick an algorithm';
  }
}

function runAlgorithm(key, array = state.baseArray) {
  pause();
  state.algorithm = key;
  state.baseArray = array;
  state.elapsedMs = 0;
  setActiveButton(key);
  engine.record(algorithmsByKey[key].gen, array);
  renderer.setArray(array);
  renderFrame();
}

function runPreset(key, caseType) {
  const size = DEFAULT_SIZE;
  const makers = { best: bestCaseArray, worst: worstCaseArray, random: randomCaseArray };
  const array = (makers[caseType] ?? randomCaseArray)(key, size);
  const presetDistribution = (() => {
    if (caseType === 'random') return 'random';
    if (caseType === 'best') return key === 'quick' ? 'balancedPivot' : 'sorted';
    if (key === 'quick') return 'sorted';
    if (key === 'comb' || key === 'shell') return 'highDisorder';
    if (key === 'tim') return 'fragmentedRuns';
    if (key === 'bogo') return 'random';
    return 'reversed';
  })();
  state.size = array.length;
  state.distribution = presetDistribution;
  dom.sizeInput.value = array.length;
  dom.distribution.value = presetDistribution;
  dom.speed.value = DEFAULT_SPEED;
  closeModal();
  setTimeout(() => runAlgorithm(key, array), 250);
}

// --- size / distribution -----------------------------------------------------

function updateSize() {
  const value = parseInt(dom.sizeInput.value, 10);
  if (Number.isNaN(value) || value < MIN_SIZE || value > MAX_SIZE) {
    dom.sizeInput.value = state.size;
    return;
  }
  state.size = value;
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
  dom.sizeUpdate.addEventListener('click', updateSize);
  dom.sizeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      updateSize();
    }
  });
  dom.distribution.addEventListener('change', () => {
    state.distribution = dom.distribution.value;
    regenerate();
  });
  dom.newArray.addEventListener('click', regenerate);
  dom.moreInfo.addEventListener('click', openModal);

  dom.playPause.addEventListener('click', togglePlay);
  dom.stepForward.addEventListener('click', () => stepOnce(true));
  dom.stepBack.addEventListener('click', () => stepOnce(false));

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
  buildDistributionOptions(dom.distribution, distributionLabels);
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
