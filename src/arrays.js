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

// --- distributions (main view) ----------------------------------------------

export const distributions = {
  random: (size) => shuffle(ascending(size)),
  reversed: (size) => descending(size),
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
  reversed: 'Reversed',
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
    case 'quick': {
      // Last-element pivot splits evenly when the median sits at the end.
      const a = ascending(size);
      const mid = Math.floor(size / 2);
      [a[mid], a[size - 1]] = [a[size - 1], a[mid]];
      return a;
    }
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
    case 'bogo':
      return shuffle(ascending(Math.min(size, 6)));
    default:
      return descending(size);
  }
}

export function randomCaseArray(algorithm, size = 30) {
  return shuffle(ascending(size));
}
