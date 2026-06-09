// Array generators: ranges, duplicates, and distributions for the main view,
// plus best/worst-case presets used by the per-algorithm "Run" buttons.

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const ascending = (size) => Array.from({ length: size }, (_, i) => i + 1);
const descending = (size) => Array.from({ length: size }, (_, i) => size - i);
const numericAsc = (a, b) => a - b;
const numericDesc = (a, b) => b - a;

function quickBalancedPivotValues(values) {
  function arrange(values) {
    if (values.length < 2) return values;
    const pivotIndex = Math.floor((values.length - 1) / 2);
    const pivot = values[pivotIndex];
    const left = arrange(values.slice(0, pivotIndex));
    const right = arrange(values.slice(pivotIndex + 1));
    const rotatedRight = right.length ? [right[right.length - 1], ...right.slice(0, -1)] : [];
    return [...left, ...rotatedRight, pivot];
  }
  return arrange(values.slice().sort(numericAsc));
}

function quickBalancedPivotArray(size) {
  return quickBalancedPivotValues(ascending(size));
}

function dualPivotBalancedValues(values) {
  function arrange(values) {
    if (values.length < 3) return values;
    const leftPivotIndex = Math.max(0, Math.floor((values.length - 1) / 3));
    const rightPivotIndex = Math.min(values.length - 1, Math.floor((2 * (values.length - 1)) / 3));
    const leftPivot = values[leftPivotIndex];
    const rightPivot = values[rightPivotIndex];
    const left = arrange(values.slice(0, leftPivotIndex));
    const middle = arrange(values.slice(leftPivotIndex + 1, rightPivotIndex));
    const right = arrange(values.slice(rightPivotIndex + 1));
    return [leftPivot, ...left, ...middle, ...right, rightPivot];
  }
  return arrange(values.slice().sort(numericAsc));
}

function dualPivotBalancedArray(size) {
  return dualPivotBalancedValues(ascending(size));
}

function highDisorderValues(values) {
  const a = values.slice().sort(numericAsc);
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

function highDisorder(size) {
  return highDisorderValues(ascending(size));
}

function randomRange(size, maxValue) {
  return Array.from({ length: size }, () => Math.floor(Math.random() * maxValue) + 1);
}

function uniqueRandomRange(size, maxValue) {
  if (maxValue <= size) return ascending(size);
  const picked = new Set();
  while (picked.size < size) {
    picked.add(Math.floor(Math.random() * maxValue) + 1);
  }
  return [...picked].sort(numericAsc);
}

function partiallySortedRunValues(values) {
  const runs = [];
  const sorted = values.slice().sort(numericAsc);
  let next = 0;
  while (next < sorted.length) {
    const remaining = sorted.length - next;
    const runLength = Math.min(remaining, 6 + Math.floor(Math.random() * 18));
    runs.push(sorted.slice(next, next + runLength));
    next += runLength;
  }
  return shuffle(runs).flat();
}

export const quicksortFirstAlgorithms = new Set(['quick', 'introsort', 'pdqsort', 'dual-pivot']);
export const noSpecialWorstCaseAlgorithms = new Set(['tim', 'powersort']);
export const valueSensitiveAlgorithms = new Set(['counting', 'radix', 'bead', 'bucket']);

// --- ranges + duplicates + distributions (main view) -------------------------

const rangeMax = {
  length: (size) => size,
  range5000: () => 5000,
  range50000: () => 50000,
  range500000: () => 500000,
};

export const distributions = {
  random: (values) => shuffle(values.slice()),
  sorted: (values) => values.slice().sort(numericAsc),
  reversed: (values) => values.slice().sort(numericDesc),
  nearlySorted: (values) => {
    const a = values.slice().sort(numericAsc);
    const swaps = Math.max(1, Math.round(a.length * 0.05));
    for (let k = 0; k < swaps; k++) {
      const i = Math.floor(Math.random() * a.length);
      const j = Math.floor(Math.random() * a.length);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  partiallySortedRuns: (values) => partiallySortedRunValues(values),
  balancedPivot: (values) => quickBalancedPivotValues(values),
  dualPivotBalanced: (values) => dualPivotBalancedValues(values),
  highDisorder: (values) => highDisorderValues(values),
};

export const rangeGroups = [
  {
    label: 'Range',
    options: [
      ['length', '1-n'],
      ['range5000', '1-5k'],
      ['range50000', '1-50k'],
      ['range500000', '1-500k'],
    ],
  },
];

export const duplicateGroups = [
  {
    label: 'Duplicates',
    options: [
      ['none', 'None'],
      ['some', 'Some'],
      ['many', 'Many'],
    ],
  },
];

export const distributionGroups = [
  {
    label: 'General distributions',
    options: [
      ['random', 'Random'],
      ['sorted', 'Sorted'],
      ['reversed', 'Reversed'],
      ['nearlySorted', 'Nearly sorted'],
      ['partiallySortedRuns', 'Partially sorted runs'],
    ],
  },
  {
    label: 'Algorithm-specific cases',
    options: [
      ['balancedPivot', 'Balanced pivot'],
      ['dualPivotBalanced', 'Dual pivot'],
      ['highDisorder', 'Gap stress'],
    ],
  },
];

function generateValues(size, range = 'length', duplicates = 'none') {
  const maxValue = (rangeMax[range] ?? rangeMax.length)(size);
  if (duplicates === 'many') {
    const levels = [
      Math.round(maxValue * 0.2),
      Math.round(maxValue * 0.45),
      Math.round(maxValue * 0.7),
      maxValue,
    ].map((v) => Math.max(1, v));
    return Array.from({ length: size }, (_, i) => levels[i % levels.length]).sort(numericAsc);
  }
  if (duplicates === 'some') {
    const bucketCount = Math.max(2, Math.min(maxValue, Math.round(size * 0.65)));
    const buckets = uniqueRandomRange(bucketCount, maxValue);
    return Array.from(
      { length: size },
      () => buckets[Math.floor(Math.random() * buckets.length)]
    ).sort(numericAsc);
  }
  return uniqueRandomRange(size, maxValue);
}

export function generateArray(size, range = 'length', duplicates = 'none', distribution = 'random') {
  const distribute = distributions[distribution] ?? distributions.random;
  return distribute(generateValues(size, range, duplicates));
}

export function presetForAlgorithmCase(algorithm, caseType) {
  if (caseType === 'random') {
    return { range: 'length', duplicates: 'none', distribution: 'random' };
  }
  if (caseType === 'best') {
    if (quicksortFirstAlgorithms.has(algorithm)) {
      return {
        range: 'length',
        duplicates: 'none',
        distribution: algorithm === 'dual-pivot' ? 'dualPivotBalanced' : 'balancedPivot',
      };
    }
    if (algorithm === 'counting' || algorithm === 'radix' || algorithm === 'bead') {
      return { range: 'length', duplicates: 'many', distribution: 'random' };
    }
    if (algorithm === 'bucket') {
      return { range: 'range5000', duplicates: 'none', distribution: 'random' };
    }
    return { range: 'length', duplicates: 'none', distribution: 'sorted' };
  }

  if (noSpecialWorstCaseAlgorithms.has(algorithm)) {
    return { range: 'length', duplicates: 'none', distribution: 'random' };
  }
  switch (algorithm) {
    case 'counting':
    case 'radix':
      return { range: 'range500000', duplicates: 'none', distribution: 'random' };
    case 'bead':
      return { range: 'range5000', duplicates: 'none', distribution: 'random' };
    case 'quick':
      return { range: 'length', duplicates: 'none', distribution: 'sorted' };
    case 'comb':
    case 'shell':
      return { range: 'length', duplicates: 'none', distribution: 'highDisorder' };
    case 'bucket':
      return { range: 'length', duplicates: 'some', distribution: 'reversed' };
    case 'bogo':
      return { range: 'length', duplicates: 'none', distribution: 'random' };
    default:
      return { range: 'length', duplicates: 'none', distribution: 'reversed' };
  }
}

// --- presets (docs modal Run buttons) ---------------------------------------

export function bestCaseArray(algorithm, size = 30) {
  const preset = presetForAlgorithmCase(algorithm, 'best');
  if (algorithm === 'dual-pivot') return dualPivotBalancedArray(size);
  if (quicksortFirstAlgorithms.has(algorithm)) return quickBalancedPivotArray(size);
  return generateArray(size, preset.range, preset.duplicates, preset.distribution);
}

export function worstCaseArray(algorithm, size = 30) {
  const preset = presetForAlgorithmCase(algorithm, 'worst');
  return generateArray(size, preset.range, preset.duplicates, preset.distribution);
}

export function randomCaseArray(algorithm, size = 30) {
  const preset = presetForAlgorithmCase(algorithm, 'random');
  return generateArray(size, preset.range, preset.duplicates, preset.distribution);
}
