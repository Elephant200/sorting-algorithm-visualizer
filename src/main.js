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
  scrub: $('scrub'),
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
  size: 50,
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

function renderFrame() {
  renderer.frame(engine.array, engine.sorted, engine.currentOp());
  renderer.setStats(engine.stats, currentTimeSec(), isBogo());
  dom.scrub.max = engine.total;
  dom.scrub.value = engine.cursor;
  dom.status.textContent = engine.total
    ? `${engine.cursor} / ${engine.total}${engine.truncated ? ' (capped)' : ''}`
    : 'Pick an algorithm';
}

function setPlayIcon(playing) {
  dom.playPause.innerHTML = playing
    ? '<i class="fas fa-pause"></i>'
    : '<i class="fas fa-play"></i>';
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
  if (state.playing) {
    state.elapsedMs += performance.now() - state.playStartedAt;
  }
  state.playing = false;
  clearTimeout(state.timer);
  setPlayIcon(false);
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
  state.algorithm = null;
  state.elapsedMs = 0;
  engine.record(() => [].values(), state.baseArray); // empty recording
  renderer.setArray(state.baseArray);
  renderer.clearHighlights(state.baseArray, engine.sorted);
  renderer.setStats(engine.stats, 0, false);
  dom.scrub.max = 0;
  dom.scrub.value = 0;
  dom.status.textContent = 'Pick an algorithm';
}

function runAlgorithm(key, array = state.baseArray) {
  pause();
  state.algorithm = key;
  state.baseArray = array;
  state.elapsedMs = 0;
  engine.record(algorithmsByKey[key].gen, array);
  renderer.setArray(array);
  renderFrame();
  play();
}

function runPreset(key, caseType) {
  const size = key === 'bogo' ? 6 : 30;
  const makers = { best: bestCaseArray, worst: worstCaseArray, random: randomCaseArray };
  const array = (makers[caseType] ?? randomCaseArray)(key, size);
  state.size = array.length;
  dom.sizeInput.value = array.length;
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
  dom.scrub.addEventListener('input', () => {
    pause();
    engine.seek(Number(dom.scrub.value));
    renderFrame();
  });

  dom.modalClose.addEventListener('click', closeModal);
  dom.modalOverlay.addEventListener('click', (e) => {
    if (e.target === dom.modalOverlay) closeModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
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
  bindEvents();
  regenerate();
}

init();
