// Array generators: distributions for the main view and best/worst-case
// presets used by the per-algorithm "Run" buttons in the docs modal.

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ascending = (size) => Array.from({ length: size }, (_, i) => i + 1);
const descending = (size) => Array.from({ length: size }, (_, i) => size - i);

function quickBalancedPivotArray(size) {
  function arrange(values) {
    if (values.length < 2) return values;
    const pivotIndex = Math.floor((values.length - 1) / 2);
    const pivot = values[pivotIndex];
    const left = arrange(values.slice(0, pivotIndex));
    const right = arrange(values.slice(pivotIndex + 1));
    const rotatedRight = right.length ? [right[right.length - 1], ...right.slice(0, -1)] : [];
    return [...left, ...rotatedRight, pivot];
  }
  return arrange(ascending(size));
}

function fragmentedRuns(size) {
  const a = [];
  let lo = 1;
  let hi = size;
  while (lo <= hi) {
    a.push(hi--);
    if (lo <= hi) a.push(lo++);
  }
  return a;
}

function highDisorder(size) {
  const a = ascending(size);
  let seed = 91;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// --- distributions (main view) ----------------------------------------------

export const distributions = {
  random: (size) => shuffle(ascending(size)),
  sorted: (size) => ascending(size),
  reversed: (size) => descending(size),
  balancedPivot: (size) => quickBalancedPivotArray(size),
  fragmentedRuns: (size) => fragmentedRuns(size),
  highDisorder: (size) => highDisorder(size),
  nearlySorted: (size) => {
    const a = ascending(size);
    const swaps = Math.max(1, Math.round(size * 0.05));
    for (let k = 0; k < swaps; k++) {
      const i = Math.floor(Math.random() * size);
      const j = Math.floor(Math.random() * size);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  fewUnique: (size) => {
    const levels = [
      Math.round(size * 0.2),
      Math.round(size * 0.45),
      Math.round(size * 0.7),
      size,
    ].map((v) => Math.max(1, v));
    return shuffle(Array.from({ length: size }, (_, i) => levels[i % levels.length]));
  },
};

export const distributionLabels = {
  random: 'Random',
  sorted: 'Sorted',
  reversed: 'Reversed',
  balancedPivot: 'Balanced Pivot',
  fragmentedRuns: 'Fragmented Runs',
  highDisorder: 'High Disorder',
  nearlySorted: 'Nearly Sorted',
  fewUnique: 'Few Unique',
};

export function generateArray(size, distribution = 'random') {
  const make = distributions[distribution] ?? distributions.random;
  return make(size);
}

// --- presets (docs modal Run buttons) ---------------------------------------

export function bestCaseArray(algorithm, size = 30) {
  switch (algorithm) {
    case 'quick':
      return quickBalancedPivotArray(size);
    default:
      // Already-sorted input is best (or neutral) for everything else here.
      return ascending(size);
  }
}

export function worstCaseArray(algorithm, size = 30) {
  switch (algorithm) {
    case 'quick':
      // Already-sorted + last-element pivot is quicksort's O(n²) trap.
      return ascending(size);
    case 'comb':
    case 'shell':
      return highDisorder(size);
    case 'tim':
      return fragmentedRuns(size);
    case 'bogo':
      return shuffle(ascending(size));
    default:
      return descending(size);
  }
}

export function randomCaseArray(algorithm, size = 30) {
  return shuffle(ascending(size));
}
