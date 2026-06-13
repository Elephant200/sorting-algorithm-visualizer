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

// Ascending odds then descending evens: rises to the max, falls back down.
function mountainValues(values) {
  const sorted = values.slice().sort(numericAsc);
  const up = [];
  const down = [];
  sorted.forEach((v, i) => (i % 2 === 0 ? up.push(v) : down.push(v)));
  return up.concat(down.reverse());
}

// Descending odds then ascending evens: falls to the min, climbs back up.
function valleyValues(values) {
  const sorted = values.slice().sort(numericAsc);
  const down = [];
  const up = [];
  sorted.forEach((v, i) => (i % 2 === 0 ? down.push(v) : up.push(v)));
  return down.reverse().concat(up);
}

// Deal sorted values round-robin into k runs: k ascending "teeth", each
// spanning the full value range.
function sawtoothValues(values) {
  const sorted = values.slice().sort(numericAsc);
  const teeth = Math.max(3, Math.min(8, Math.floor(sorted.length / 12)));
  const runs = Array.from({ length: teeth }, () => []);
  sorted.forEach((v, i) => runs[i % teeth].push(v));
  return runs.flat();
}

// Alternate extremes converging toward the middle: min, max, 2nd-min, ...
function zigzagValues(values) {
  const sorted = values.slice().sort(numericAsc);
  const out = [];
  let lo = 0;
  let hi = sorted.length - 1;
  while (lo <= hi) {
    out.push(sorted[lo++]);
    if (lo <= hi) out.push(sorted[hi--]);
  }
  return out;
}

// Sorted, then rotated left ~15% — one long run plus a displaced prefix.
function rotatedValues(values) {
  const sorted = values.slice().sort(numericAsc);
  const k = Math.max(1, Math.round(sorted.length * 0.15));
  return sorted.slice(k).concat(sorted.slice(0, k));
}

// Mostly sorted with a scrambled final quarter — the "append then re-sort" case.
function shuffledTailValues(values) {
  const sorted = values.slice().sort(numericAsc);
  const start = Math.floor(sorted.length * 0.75);
  return sorted.slice(0, start).concat(shuffle(sorted.slice(start)));
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

function nearlySortedValues(values) {
  const sorted = values.slice().sort(numericAsc);
  const n = sorted.length;
  if (n < 2) return sorted;

  const jitter = Math.max(2, Math.round(n * 0.08));
  return sorted
    .map((value, index) => ({
      value,
      order: index + (Math.random() * 2 - 1) * jitter,
    }))
    .sort((a, b) => a.order - b.order)
    .map((item) => item.value);
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
  range1000000: () => 1000000,
};

export const distributions = {
  random: (values) => shuffle(values.slice()),
  sorted: (values) => values.slice().sort(numericAsc),
  reversed: (values) => values.slice().sort(numericDesc),
  nearlySorted: (values) => nearlySortedValues(values),
  shuffledTail: (values) => shuffledTailValues(values),
  rotated: (values) => rotatedValues(values),
  partiallySortedRuns: (values) => partiallySortedRunValues(values),
  mountain: (values) => mountainValues(values),
  valley: (values) => valleyValues(values),
  sawtooth: (values) => sawtoothValues(values),
  zigzag: (values) => zigzagValues(values),
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
      ['range1000000', '1-1M'],
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
      ['shuffledTail', 'Sorted + shuffled tail'],
      ['rotated', 'Rotated sorted'],
      ['partiallySortedRuns', 'Partially sorted runs'],
    ],
  },
  {
    label: 'Shapes',
    options: [
      ['mountain', 'Mountain (organ pipe)'],
      ['valley', 'Valley'],
      ['sawtooth', 'Sawtooth'],
      ['zigzag', 'Zigzag'],
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
