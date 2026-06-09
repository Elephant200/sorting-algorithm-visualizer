// Sorting algorithms expressed as generators.
//
// Each generator receives a working array (a plain copy it is free to mutate)
// and `yield`s operation objects describing what it is doing. It never touches
// the DOM. The engine records these ops and replays them, which is what makes
// pause / speed / step-forward / step-back / scrub all work uniformly.
//
// Op shapes:
//   { type: 'compare',    indices: [i, j] }            read/compare (visual only)
//   { type: 'swap',       indices: [i, j] }            exchange two elements
//   { type: 'overwrite',  index, value, prev }         write `value` into a[index]
//   { type: 'setArray',   value: [...], prev: [...] }  replace the whole array
//   { type: 'pivot',      index }                       mark a pivot (visual only)
//   { type: 'clearPivots' }                              drop all pivot marks
//   { type: 'markSorted', indices: [...] }              finalize elements (green)
//
// Pivot marks persist on screen until a clearPivots op, so partitions should
// end by yielding clearPivots(). The engine annotates both ops with the prior
// pivot set during recording to keep playback reversible.

// --- op helpers --------------------------------------------------------------

const compare = (i, j) => ({ type: 'compare', indices: [i, j] });
const pivot = (i) => ({ type: 'pivot', index: i });
const clearPivots = () => ({ type: 'clearPivots' });
const markSorted = (...indices) => ({ type: 'markSorted', indices });

function* swap(a, i, j) {
  [a[i], a[j]] = [a[j], a[i]];
  yield { type: 'swap', indices: [i, j] };
}

function* write(a, i, value) {
  const prev = a[i];
  a[i] = value;
  yield { type: 'overwrite', index: i, value, prev };
}

// Final left-to-right green sweep so a finished sort reads as "done".
function* sweep(a) {
  for (let i = 0; i < a.length; i++) yield markSorted(i);
}

function isSorted(a) {
  for (let i = 1; i < a.length; i++) if (a[i - 1] > a[i]) return false;
  return true;
}

function shuffleInPlace(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

// --- O(n^2) family -----------------------------------------------------------

function* bubble(a) {
  const n = a.length;
  for (let i = 0; i < n - 1; i++) {
    let swapped = false;
    for (let j = 0; j < n - i - 1; j++) {
      yield compare(j, j + 1);
      if (a[j] > a[j + 1]) {
        yield* swap(a, j, j + 1);
        swapped = true;
      }
    }
    yield markSorted(n - i - 1);
    if (!swapped) break; // already sorted — best case becomes O(n)
  }
  yield* sweep(a);
}

function* insertion(a) {
  for (let i = 1; i < a.length; i++) {
    const key = a[i];
    let j = i - 1;
    while (j >= 0) {
      yield compare(j, j + 1);
      if (a[j] > key) {
        yield* write(a, j + 1, a[j]);
        j--;
      } else break;
    }
    yield* write(a, j + 1, key);
  }
  yield* sweep(a);
}

function* selection(a) {
  const n = a.length;
  for (let i = 0; i < n; i++) {
    let min = i;
    for (let j = i + 1; j < n; j++) {
      yield compare(j, min);
      if (a[j] < a[min]) min = j;
    }
    if (min !== i) yield* swap(a, i, min);
    yield markSorted(i);
  }
}

function* cocktail(a) {
  let lo = 0;
  let hi = a.length - 1;
  let swapped = true;
  while (swapped) {
    swapped = false;
    for (let i = lo; i < hi; i++) {
      yield compare(i, i + 1);
      if (a[i] > a[i + 1]) {
        yield* swap(a, i, i + 1);
        swapped = true;
      }
    }
    yield markSorted(hi);
    hi--;
    if (!swapped) break;
    swapped = false;
    for (let i = hi; i > lo; i--) {
      yield compare(i - 1, i);
      if (a[i - 1] > a[i]) {
        yield* swap(a, i - 1, i);
        swapped = true;
      }
    }
    yield markSorted(lo);
    lo++;
  }
  yield* sweep(a);
}

function* comb(a) {
  const n = a.length;
  let gap = n;
  let swapped = true;
  while (gap > 1 || swapped) {
    gap = Math.max(1, Math.floor(gap / 1.3));
    swapped = false;
    for (let i = 0; i + gap < n; i++) {
      yield compare(i, i + gap);
      if (a[i] > a[i + gap]) {
        yield* swap(a, i, i + gap);
        swapped = true;
      }
    }
  }
  yield* sweep(a);
}

function* shell(a) {
  const n = a.length;
  for (let gap = Math.floor(n / 2); gap > 0; gap = Math.floor(gap / 2)) {
    for (let i = gap; i < n; i++) {
      const temp = a[i];
      let j = i;
      while (j >= gap) {
        yield compare(j - gap, j);
        if (a[j - gap] > temp) {
          yield* write(a, j, a[j - gap]);
          j -= gap;
        } else break;
      }
      yield* write(a, j, temp);
    }
  }
  yield* sweep(a);
}

// --- O(n log n) family -------------------------------------------------------

function* siftDown(a, root, end) {
  while (true) {
    let largest = root;
    const l = 2 * root + 1;
    const r = 2 * root + 2;
    if (l < end) {
      yield compare(l, largest);
      if (a[l] > a[largest]) largest = l;
    }
    if (r < end) {
      yield compare(r, largest);
      if (a[r] > a[largest]) largest = r;
    }
    if (largest === root) break;
    yield* swap(a, root, largest);
    root = largest;
  }
}

function* heap(a) {
  const n = a.length;
  for (let i = Math.floor(n / 2) - 1; i >= 0; i--) yield* siftDown(a, i, n);
  for (let end = n - 1; end > 0; end--) {
    yield* swap(a, 0, end);
    yield markSorted(end);
    yield* siftDown(a, 0, end);
  }
  yield markSorted(0);
}

function* mergeRange(a, lo, mid, hi) {
  const temp = [];
  let i = lo;
  let j = mid;
  while (i < mid && j < hi) {
    yield compare(i, j);
    if (a[i] <= a[j]) temp.push(a[i++]);
    else temp.push(a[j++]);
  }
  while (i < mid) temp.push(a[i++]);
  while (j < hi) temp.push(a[j++]);
  for (let k = 0; k < temp.length; k++) yield* write(a, lo + k, temp[k]);
}

function* mergeSort(a, lo, hi) {
  if (hi - lo < 2) return;
  const mid = (lo + hi) >> 1;
  yield* mergeSort(a, lo, mid);
  yield* mergeSort(a, mid, hi);
  yield* mergeRange(a, lo, mid, hi);
}

function* merge(a) {
  yield* mergeSort(a, 0, a.length);
  yield* sweep(a);
}

function* partition(a, lo, hi) {
  const pivotValue = a[hi];
  yield pivot(hi);
  let i = lo - 1;
  for (let j = lo; j < hi; j++) {
    yield compare(j, hi);
    if (a[j] <= pivotValue) {
      i++;
      if (i !== j) yield* swap(a, i, j);
    }
  }
  if (i + 1 !== hi) yield* swap(a, i + 1, hi);
  yield clearPivots();
  return i + 1;
}

function* quickSort(a, lo, hi) {
  if (lo >= hi) {
    if (lo === hi) yield markSorted(lo);
    return;
  }
  const p = yield* partition(a, lo, hi);
  yield markSorted(p);
  yield* quickSort(a, lo, p - 1);
  yield* quickSort(a, p + 1, hi);
}

function* quick(a) {
  yield* quickSort(a, 0, a.length - 1);
  yield* sweep(a);
}

function* insertionRange(a, lo, hi) {
  for (let i = lo + 1; i < hi; i++) {
    const key = a[i];
    let j = i - 1;
    while (j >= lo) {
      yield compare(j, j + 1);
      if (a[j] > key) {
        yield* write(a, j + 1, a[j]);
        j--;
      } else break;
    }
    yield* write(a, j + 1, key);
  }
}

function* siftDownRange(a, lo, root, end) {
  while (true) {
    let largest = root;
    const left = lo + 2 * (root - lo) + 1;
    const right = left + 1;
    if (left < end) {
      yield compare(left, largest);
      if (a[left] > a[largest]) largest = left;
    }
    if (right < end) {
      yield compare(right, largest);
      if (a[right] > a[largest]) largest = right;
    }
    if (largest === root) break;
    yield* swap(a, root, largest);
    root = largest;
  }
}

function* heapSortRange(a, lo, hi) {
  for (let i = lo + Math.floor((hi - lo) / 2) - 1; i >= lo; i--) {
    yield* siftDownRange(a, lo, i, hi);
  }
  for (let end = hi - 1; end > lo; end--) {
    yield* swap(a, lo, end);
    yield* siftDownRange(a, lo, lo, end);
  }
}

function* introsortRange(a, lo, hi, depthLimit) {
  const size = hi - lo;
  if (size < 2) return;
  if (size < 16) {
    yield* insertionRange(a, lo, hi);
    return;
  }
  if (depthLimit === 0) {
    yield* heapSortRange(a, lo, hi);
    return;
  }
  const p = yield* partition(a, lo, hi - 1);
  yield* introsortRange(a, lo, p, depthLimit - 1);
  yield* introsortRange(a, p + 1, hi, depthLimit - 1);
}

function* introspective(a) {
  const depthLimit = a.length > 1 ? 2 * Math.floor(Math.log2(a.length)) : 0;
  yield* introsortRange(a, 0, a.length, depthLimit);
  yield* sweep(a);
}

function* dualPivotPartition(a, lo, hi) {
  yield compare(lo, hi);
  if (a[lo] > a[hi]) yield* swap(a, lo, hi);
  yield pivot(lo);
  yield pivot(hi);

  const leftPivot = a[lo];
  const rightPivot = a[hi];
  let lt = lo + 1;
  let gt = hi - 1;
  let i = lt;

  while (i <= gt) {
    yield compare(i, lo);
    if (a[i] < leftPivot) {
      if (i !== lt) yield* swap(a, i, lt);
      lt++;
      i++;
      continue;
    }

    yield compare(i, hi);
    if (a[i] > rightPivot) {
      while (i < gt) {
        yield compare(gt, hi);
        if (a[gt] <= rightPivot) break;
        gt--;
      }
      if (i !== gt) yield* swap(a, i, gt);
      gt--;
      yield compare(i, lo);
      if (a[i] < leftPivot) {
        if (i !== lt) yield* swap(a, i, lt);
        lt++;
      }
    }
    i++;
  }

  lt--;
  gt++;
  if (lo !== lt) yield* swap(a, lo, lt);
  if (hi !== gt) yield* swap(a, hi, gt);
  yield clearPivots();
  return [lt, gt];
}

function* dualPivotQuickSort(a, lo, hi) {
  if (lo >= hi) {
    if (lo === hi) yield markSorted(lo);
    return;
  }
  const [lp, rp] = yield* dualPivotPartition(a, lo, hi);
  yield markSorted(lp, rp);
  yield* dualPivotQuickSort(a, lo, lp - 1);
  if (a[lp] < a[rp]) yield* dualPivotQuickSort(a, lp + 1, rp - 1);
  yield* dualPivotQuickSort(a, rp + 1, hi);
}

function* dualPivot(a) {
  yield* dualPivotQuickSort(a, 0, a.length - 1);
  yield* sweep(a);
}

function* medianOfThree(a, lo, mid, hi) {
  yield compare(mid, lo);
  if (a[mid] < a[lo]) yield* swap(a, mid, lo);
  yield compare(hi, mid);
  if (a[hi] < a[mid]) yield* swap(a, hi, mid);
  yield compare(mid, lo);
  if (a[mid] < a[lo]) yield* swap(a, mid, lo);
  return mid;
}

function* pdqPartition(a, lo, hi) {
  const mid = lo + ((hi - lo) >> 1);
  const pivotIndex = yield* medianOfThree(a, lo, mid, hi - 1);
  if (pivotIndex !== lo) yield* swap(a, lo, pivotIndex);
  yield pivot(lo);
  const pivotValue = a[lo];
  let i = lo + 1;
  let j = hi - 1;
  let alreadyPartitioned = true;

  while (true) {
    while (i <= j) {
      yield compare(i, lo);
      if (a[i] >= pivotValue) break;
      i++;
    }
    while (i <= j) {
      yield compare(j, lo);
      if (a[j] <= pivotValue) break;
      j--;
    }
    if (i >= j) break;
    yield* swap(a, i, j);
    alreadyPartitioned = false;
    i++;
    j--;
  }

  if (lo !== j) yield* swap(a, lo, j);
  yield clearPivots();
  return { pivot: j, alreadyPartitioned };
}

function* partialInsertionSort(a, lo, hi) {
  let moves = 0;
  const moveLimit = 8;
  for (let i = lo + 1; i < hi; i++) {
    const key = a[i];
    let j = i - 1;
    while (j >= lo) {
      yield compare(j, j + 1);
      if (a[j] <= key) break;
      if (++moves > moveLimit) {
        yield* write(a, j + 1, key);
        return false;
      }
      yield* write(a, j + 1, a[j]);
      j--;
    }
    yield* write(a, j + 1, key);
  }
  return true;
}

function* breakPatterns(a, lo, hi) {
  const size = hi - lo;
  if (size < 8) return;
  const mid = lo + (size >> 1);
  const offsets = [-1, 0, 1];
  let seed = size;
  const nextIndex = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return lo + Math.abs(seed) % size;
  };

  for (const offset of offsets) {
    const i = mid + offset;
    const j = nextIndex();
    if (i >= lo && i < hi && i !== j) yield* swap(a, i, j);
  }
}

function* pdqsortRange(a, lo, hi, badAllowed, leftMost = true) {
  while (hi - lo > 16) {
    const { pivot: p, alreadyPartitioned } = yield* pdqPartition(a, lo, hi);
    const leftSize = p - lo;
    const rightSize = hi - (p + 1);
    const highlyUnbalanced = leftSize < (hi - lo) / 8 || rightSize < (hi - lo) / 8;

    if (highlyUnbalanced) {
      badAllowed--;
      if (badAllowed === 0) {
        yield* heapSortRange(a, lo, hi);
        return;
      }
      yield* breakPatterns(a, lo, p);
      yield* breakPatterns(a, p + 1, hi);
    } else if (alreadyPartitioned) {
      const leftDone = yield* partialInsertionSort(a, lo, p);
      const rightDone = yield* partialInsertionSort(a, p + 1, hi);
      if (leftDone && rightDone) return;
    }

    yield markSorted(p);
    if (leftSize < rightSize) {
      yield* pdqsortRange(a, lo, p, badAllowed, leftMost);
      lo = p + 1;
      leftMost = false;
    } else {
      yield* pdqsortRange(a, p + 1, hi, badAllowed, false);
      hi = p;
    }
  }

  yield* insertionRange(a, lo, hi);
}

function* pdqsort(a) {
  const badAllowed = a.length > 1 ? 2 * Math.floor(Math.log2(a.length)) : 0;
  yield* pdqsortRange(a, 0, a.length, badAllowed);
  yield* sweep(a);
}

// Faithful Timsort: natural run detection, minrun-padded binary insertion
// sort, galloping merges, and a run stack merged under Timsort's size invariants.

const MIN_MERGE = 32;
const MIN_GALLOP = 7;
let minGallop = MIN_GALLOP;

function minRunLength(n) {
  let r = 0;
  while (n >= MIN_MERGE) {
    r |= n & 1;
    n >>= 1;
  }
  return n + r;
}

function* reverseRange(a, lo, hi) {
  hi--;
  while (lo < hi) {
    yield* swap(a, lo, hi);
    lo++;
    hi--;
  }
}

// Find the run starting at lo, flip it ascending if descending; return length.
function* countRunAndMakeAscending(a, lo, hi) {
  let runHi = lo + 1;
  if (runHi === hi) return 1;
  yield compare(runHi, lo);
  if (a[runHi++] < a[lo]) {
    while (runHi < hi) {
      yield compare(runHi, runHi - 1);
      if (a[runHi] < a[runHi - 1]) runHi++;
      else break;
    }
    yield* reverseRange(a, lo, runHi);
  } else {
    while (runHi < hi) {
      yield compare(runHi, runHi - 1);
      if (a[runHi] >= a[runHi - 1]) runHi++;
      else break;
    }
  }
  return runHi - lo;
}

// Extend a sorted prefix [lo, start) to [lo, hi) using binary insertion.
function* binaryInsertionSort(a, lo, hi, start) {
  if (start === lo) start++;
  for (; start < hi; start++) {
    const pivot = a[start];
    let left = lo;
    let right = start;
    while (left < right) {
      const mid = (left + right) >>> 1;
      yield compare(start, mid);
      if (pivot < a[mid]) right = mid;
      else left = mid + 1;
    }
    for (let i = start; i > left; i--) yield* write(a, i, a[i - 1]);
    yield* write(a, left, pivot);
  }
}

// Exponential search + binary search; returns an offset into [0, len).
function* gallopRight(keyIdx, key, getVal, len, hint, getIdx) {
  let ofs = 1;
  let lastOfs = 0;
  if (key < getVal(hint)) {
    const maxOfs = hint + 1;
    while (ofs < maxOfs) {
      yield compare(keyIdx, getIdx(hint - ofs));
      if (key < getVal(hint - ofs)) {
        lastOfs = ofs;
        ofs = (ofs << 1) + 1;
        if (ofs <= 0) ofs = maxOfs;
      } else break;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    const tmp = lastOfs;
    lastOfs = hint - ofs;
    ofs = hint - tmp;
  } else {
    const maxOfs = len - hint;
    while (ofs < maxOfs) {
      yield compare(keyIdx, getIdx(hint + ofs));
      if (key >= getVal(hint + ofs)) {
        lastOfs = ofs;
        ofs = (ofs << 1) + 1;
        if (ofs <= 0) ofs = maxOfs;
      } else break;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    lastOfs += hint;
    ofs += hint;
  }
  lastOfs++;
  while (lastOfs < ofs) {
    const m = lastOfs + ((ofs - lastOfs) >>> 1);
    yield compare(keyIdx, getIdx(m));
    if (key < getVal(m)) ofs = m;
    else lastOfs = m + 1;
  }
  return ofs;
}

function* gallopLeft(keyIdx, key, getVal, len, hint, getIdx) {
  let lastOfs = 0;
  let ofs = 1;
  if (key > getVal(hint)) {
    const maxOfs = len - hint;
    while (ofs < maxOfs) {
      yield compare(keyIdx, getIdx(hint + ofs));
      if (key > getVal(hint + ofs)) {
        lastOfs = ofs;
        ofs = (ofs << 1) + 1;
        if (ofs <= 0) ofs = maxOfs;
      } else break;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    lastOfs += hint;
    ofs += hint;
  } else {
    const maxOfs = hint + 1;
    while (ofs < maxOfs) {
      yield compare(keyIdx, getIdx(hint - ofs));
      if (key <= getVal(hint - ofs)) {
        lastOfs = ofs;
        ofs = (ofs << 1) + 1;
        if (ofs <= 0) ofs = maxOfs;
      } else break;
    }
    if (ofs > maxOfs) ofs = maxOfs;
    const tmp = lastOfs;
    lastOfs = hint - ofs;
    ofs = hint - tmp;
  }
  lastOfs++;
  while (lastOfs < ofs) {
    const m = lastOfs + ((ofs - lastOfs) >>> 1);
    yield compare(keyIdx, getIdx(m));
    if (key > getVal(m)) lastOfs = m + 1;
    else ofs = m;
  }
  return ofs;
}

function* copyChunk(values, start, count, a, dest) {
  for (let i = 0; i < count; i++) yield* write(a, dest + i, values[start + i]);
}

function* copyFromArray(a, src, count, dest) {
  for (let i = 0; i < count; i++) yield* write(a, dest + i, a[src + i]);
}

function* mergeRuns(a, base1, len1, base2, len2) {
  const left = a.slice(base1, base1 + len1);
  let i = 0;
  let j = base2;
  let k = base1;
  const hi = base2 + len2;
  let localMinGallop = minGallop;

  while (i < len1 && j < hi) {
    let count1 = 0;
    let count2 = 0;

    do {
      yield compare(k, j);
      if (a[j] < left[i]) {
        yield* write(a, k++, a[j++]);
        count2++;
        count1 = 0;
      } else {
        yield* write(a, k++, left[i++]);
        count1++;
        count2 = 0;
      }
    } while (i < len1 && j < hi && (count1 | count2) < localMinGallop);

    if (i >= len1 || j >= hi) break;

    do {
      count1 = yield* gallopRight(
        j,
        a[j],
        (off) => left[i + off],
        len1 - i,
        0,
        (off) => base1 + i + off
      );
      if (count1 !== 0) {
        yield* copyChunk(left, i, count1, a, k);
        k += count1;
        i += count1;
        if (i >= len1) break;
      }
      yield* write(a, k++, a[j++]);
      if (j >= hi) break;

      count2 = yield* gallopLeft(
        base1 + i,
        left[i],
        (off) => a[j + off],
        hi - j,
        0,
        (off) => j + off
      );
      if (count2 !== 0) {
        yield* copyFromArray(a, j, count2, k);
        k += count2;
        j += count2;
        if (j >= hi) break;
      }
      yield* write(a, k++, left[i++]);
      if (i >= len1) break;

      localMinGallop--;
    } while (count1 >= MIN_GALLOP || count2 >= MIN_GALLOP);

    if (localMinGallop < 0) localMinGallop = 0;
    localMinGallop += 2;
  }

  minGallop = localMinGallop < 1 ? 1 : localMinGallop;
  while (i < len1) yield* write(a, k++, left[i++]);
}

function* mergeAt(a, runBase, runLen, i) {
  const base1 = runBase[i];
  const len1 = runLen[i];
  const base2 = runBase[i + 1];
  const len2 = runLen[i + 1];
  runLen[i] = len1 + len2;
  runBase.splice(i + 1, 1);
  runLen.splice(i + 1, 1);
  yield* mergeRuns(a, base1, len1, base2, len2);
}

function* mergeCollapse(a, runBase, runLen) {
  while (runLen.length > 1) {
    let n = runLen.length - 2;
    if (
      (n > 0 && runLen[n - 1] <= runLen[n] + runLen[n + 1]) ||
      (n > 1 && runLen[n - 2] <= runLen[n - 1] + runLen[n])
    ) {
      if (runLen[n - 1] < runLen[n + 1]) n--;
      yield* mergeAt(a, runBase, runLen, n);
    } else if (runLen[n] <= runLen[n + 1]) {
      yield* mergeAt(a, runBase, runLen, n);
    } else break;
  }
}

function* mergeForceCollapse(a, runBase, runLen) {
  while (runLen.length > 1) {
    let n = runLen.length - 2;
    if (n > 0 && runLen[n - 1] < runLen[n + 1]) n--;
    yield* mergeAt(a, runBase, runLen, n);
  }
}

function* tim(a) {
  minGallop = MIN_GALLOP;
  const n = a.length;
  if (n < 2) return;
  if (n < MIN_MERGE) {
    const runLen = yield* countRunAndMakeAscending(a, 0, n);
    yield* binaryInsertionSort(a, 0, n, runLen);
    yield* sweep(a);
    return;
  }

  const runBase = [];
  const runLen = [];
  const minRun = minRunLength(n);
  let low = 0;
  let remaining = n;
  do {
    let runLength = yield* countRunAndMakeAscending(a, low, n);
    if (runLength < minRun) {
      const force = Math.min(remaining, minRun);
      yield* binaryInsertionSort(a, low, low + force, low + runLength);
      runLength = force;
    }
    runBase.push(low);
    runLen.push(runLength);
    yield* mergeCollapse(a, runBase, runLen);
    low += runLength;
    remaining -= runLength;
  } while (remaining !== 0);

  yield* mergeForceCollapse(a, runBase, runLen);
  yield* sweep(a);
}

function nodePower(n, s1, n1, s2, n2) {
  const denominator = 2 * n;
  let left = 2 * s1 + n1;
  let right = 2 * s2 + n2;
  let power = 0;

  while (true) {
    power++;
    left *= 2;
    right *= 2;
    const leftBit = left >= denominator ? 1 : 0;
    const rightBit = right >= denominator ? 1 : 0;
    if (leftBit !== rightBit) return power;
    if (leftBit) left -= denominator;
    if (rightBit) right -= denominator;
  }
}

function* mergePowerAt(a, pending, i) {
  const left = pending[i];
  const right = pending[i + 1];
  pending[i] = {
    base: left.base,
    len: left.len + right.len,
    power: left.power,
  };
  pending.splice(i + 1, 1);
  yield* mergeRuns(a, left.base, left.len, right.base, right.len);
}

function* foundNewPowerRun(a, pending, next, n) {
  const current = pending[pending.length - 1];
  const power = nodePower(n, current.base, current.len, next.base, next.len);
  while (pending.length > 1 && pending[pending.length - 2].power > power) {
    yield* mergePowerAt(a, pending, pending.length - 2);
  }
  pending[pending.length - 1].power = power;
  pending.push({ ...next, power: 0 });
}

function* powerForceCollapse(a, pending) {
  while (pending.length > 1) {
    yield* mergePowerAt(a, pending, pending.length - 2);
  }
}

function* powersort(a) {
  minGallop = MIN_GALLOP;
  const n = a.length;
  if (n < 2) return;
  if (n < MIN_MERGE) {
    const runLen = yield* countRunAndMakeAscending(a, 0, n);
    yield* binaryInsertionSort(a, 0, n, runLen);
    yield* sweep(a);
    return;
  }

  const minRun = minRunLength(n);
  const pending = [];
  let low = 0;
  while (low < n) {
    let runLength = yield* countRunAndMakeAscending(a, low, n);
    if (runLength < minRun) {
      const force = Math.min(n - low, minRun);
      yield* binaryInsertionSort(a, low, low + force, low + runLength);
      runLength = force;
    }
    const run = { base: low, len: runLength, power: 0 };
    if (pending.length === 0) pending.push(run);
    else yield* foundNewPowerRun(a, pending, run, n);
    low += runLength;
  }

  yield* powerForceCollapse(a, pending);
  yield* sweep(a);
}

// --- non-comparison family ---------------------------------------------------

function* radix(a) {
  if (a.length === 0) return;
  const max = Math.max(...a);
  for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
    const output = new Array(a.length);
    const count = new Array(10).fill(0);
    for (let i = 0; i < a.length; i++) {
      yield compare(i, i);
      count[Math.floor(a[i] / exp) % 10]++;
    }
    for (let i = 1; i < 10; i++) count[i] += count[i - 1];
    for (let i = a.length - 1; i >= 0; i--) {
      const d = Math.floor(a[i] / exp) % 10;
      output[--count[d]] = a[i];
    }
    for (let i = 0; i < a.length; i++) yield* write(a, i, output[i]);
  }
  yield* sweep(a);
}

function* counting(a) {
  if (a.length === 0) return;
  const min = Math.min(...a);
  const max = Math.max(...a);
  const count = new Array(max - min + 1).fill(0);
  for (let i = 0; i < a.length; i++) {
    yield compare(i, i);
    count[a[i] - min]++;
  }
  for (let i = 1; i < count.length; i++) count[i] += count[i - 1];
  const output = new Array(a.length);
  for (let i = a.length - 1; i >= 0; i--) output[--count[a[i] - min]] = a[i];
  for (let i = 0; i < a.length; i++) yield* write(a, i, output[i]);
  yield* sweep(a);
}

function* bead(a) {
  if (a.length === 0) return;
  const max = Math.max(...a);
  const beadRows = new Array(max).fill(0);
  for (let i = 0; i < a.length; i++) {
    yield compare(i, i);
    for (let level = 0; level < a[i]; level++) beadRows[level]++;
  }
  for (let i = 0; i < a.length; i++) {
    const threshold = a.length - 1 - i;
    let value = 0;
    for (let level = 0; level < max; level++) {
      if (beadRows[level] > threshold) value++;
    }
    yield* write(a, i, value);
  }
  yield* sweep(a);
}

function* bucket(a) {
  const n = a.length;
  if (n === 0) return;
  const min = Math.min(...a);
  const max = Math.max(...a);
  const range = max - min + 1;
  const buckets = Array.from({ length: n }, () => []);

  for (let i = 0; i < n; i++) {
    yield compare(i, i);
    const index = Math.min(n - 1, Math.floor(((a[i] - min) * n) / range));
    buckets[index].push(a[i]);
  }

  const sorted = [];
  for (const bucketItems of buckets) {
    for (let i = 1; i < bucketItems.length; i++) {
      const key = bucketItems[i];
      let j = i - 1;
      while (j >= 0 && bucketItems[j] > key) {
        bucketItems[j + 1] = bucketItems[j];
        j--;
      }
      bucketItems[j + 1] = key;
    }
    sorted.push(...bucketItems);
  }

  for (let i = 0; i < n; i++) yield* write(a, i, sorted[i]);
  yield* sweep(a);
}

function* gnome(a) {
  let i = 1;
  while (i < a.length) {
    yield compare(i - 1, i);
    if (a[i - 1] <= a[i]) i++;
    else {
      yield* swap(a, i - 1, i);
      if (i > 1) i--;
      else i = 1;
    }
  }
  yield* sweep(a);
}

function* oddEven(a) {
  let sortedPass = false;
  while (!sortedPass) {
    sortedPass = true;
    for (let i = 1; i < a.length - 1; i += 2) {
      yield compare(i, i + 1);
      if (a[i] > a[i + 1]) {
        yield* swap(a, i, i + 1);
        sortedPass = false;
      }
    }
    for (let i = 0; i < a.length - 1; i += 2) {
      yield compare(i, i + 1);
      if (a[i] > a[i + 1]) {
        yield* swap(a, i, i + 1);
        sortedPass = false;
      }
    }
  }
  yield* sweep(a);
}

function nextPowerOfTwo(n) {
  let power = 1;
  while (power < n) power <<= 1;
  return power;
}

function* bitonicMergePadded(values, visibleLength, lo, count, ascending) {
  if (count <= 1) return;
  const step = count / 2;
  for (let i = lo; i < lo + step; i++) {
    if (i < visibleLength && i + step < visibleLength) yield compare(i, i + step);
    if (
      (ascending && values[i] > values[i + step]) ||
      (!ascending && values[i] < values[i + step])
    ) {
      [values[i], values[i + step]] = [values[i + step], values[i]];
    }
  }
  yield* bitonicMergePadded(values, visibleLength, lo, step, ascending);
  yield* bitonicMergePadded(values, visibleLength, lo + step, step, ascending);
}

function* bitonicSortPadded(values, visibleLength, lo, count, ascending) {
  if (count <= 1) return;
  const split = count / 2;
  yield* bitonicSortPadded(values, visibleLength, lo, split, true);
  yield* bitonicSortPadded(values, visibleLength, lo + split, split, false);
  yield* bitonicMergePadded(values, visibleLength, lo, count, ascending);
}

function* bitonic(a) {
  const n = a.length;
  if (n === 0) return;
  const paddedLength = nextPowerOfTwo(n);
  const sentinel = Math.max(...a) + 1;
  const values = a.concat(Array.from({ length: paddedLength - n }, () => sentinel));
  yield* bitonicSortPadded(values, n, 0, paddedLength, true);
  for (let i = 0; i < n; i++) yield* write(a, i, values[i]);
  yield* sweep(a);
}

function* cycle(a) {
  const n = a.length;
  for (let cycleStart = 0; cycleStart < n - 1; cycleStart++) {
    let item = a[cycleStart];
    let pos = cycleStart;

    for (let i = cycleStart + 1; i < n; i++) {
      yield compare(i, cycleStart);
      if (a[i] < item) pos++;
    }

    if (pos === cycleStart) {
      yield markSorted(cycleStart);
      continue;
    }

    while (item === a[pos]) pos++;
    let prev = a[pos];
    yield* write(a, pos, item);
    yield markSorted(pos);
    item = prev;

    while (pos !== cycleStart) {
      pos = cycleStart;
      for (let i = cycleStart + 1; i < n; i++) {
        yield compare(i, cycleStart);
        if (a[i] < item) pos++;
      }

      while (item === a[pos]) pos++;
      prev = a[pos];
      yield* write(a, pos, item);
      yield markSorted(pos);
      item = prev;
    }
  }
  if (n > 0) yield markSorted(n - 1);
}

// Shuffles until sorted. Only sensible on a handful of elements; the engine's
// global recording cap is the sole backstop against an unlucky large array.
function* bogo(a) {
  while (!isSorted(a)) {
    const prev = a.slice();
    shuffleInPlace(a);
    yield { type: 'setArray', value: a.slice(), prev };
  }
  yield* sweep(a);
}

// --- registry: single source of truth for UI + docs -------------------------

const algorithmRegistry = [
  {
    key: 'bubble',
    category: 'Simple',
    name: 'Bubble Sort',
    tooltip: 'O(n²) avg/worst — teaching sort; compares adjacent pairs and swaps inversions',
    gen: bubble,
    docs: {
      description:
        'A simple comparison sort that repeatedly scans adjacent pairs and swaps inverted neighbors. Each pass pushes the largest remaining value toward the end of the unsorted region, so the sorted suffix grows from right to left. It is easy to understand and stable, but it does many local comparisons; the early-exit check is what gives it a fast best case on already sorted input.',
      steps: [
        'Compare the first two elements; swap if the first is greater.',
        'Move one position right and repeat across the array.',
        'After each pass the largest unsorted element settles at the end.',
        'Repeat over the shrinking unsorted portion.',
        'Stop early as soon as a pass makes no swaps.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n²)', average: 'O(n²)', space: 'O(1)' },
      code: `def bubble_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using bubble sort."""
    n = len(arr)
    result = arr.copy()

    for i in range(n):
        swapped = False
        for j in range(0, n - i - 1):
            if result[j] > result[j + 1]:
                result[j], result[j + 1] = result[j + 1], result[j]
                swapped = True
        if not swapped:
            break

    return result`,
    },
  },
  {
    key: 'insertion',
    category: 'Simple',
    name: 'Insertion Sort',
    tooltip: 'O(n²) avg/worst — small/nearly-sorted data; shifts a key into a sorted prefix',
    gen: insertion,
    docs: {
      description:
        'Builds a sorted prefix one value at a time, much like sorting cards in your hand. For each new value, it walks left through the prefix, shifts larger values one slot to the right, and inserts the value into the gap. It is stable, in-place, and excellent on small or nearly sorted arrays because misplaced values usually travel only a short distance.',
      steps: [
        'Treat the first element as a sorted prefix of length one.',
        'Take the next element as the key.',
        'Shift larger elements in the prefix one slot to the right.',
        'Drop the key into the gap that opens up.',
        'Repeat until every element has been inserted.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n²)', average: 'O(n²)', space: 'O(1)' },
      code: `def insertion_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using insertion sort."""
    result = arr.copy()

    for i in range(1, len(result)):
        key = result[i]
        j = i - 1
        # Shift elements greater than key one position right
        while j >= 0 and result[j] > key:
            result[j + 1] = result[j]
            j -= 1
        result[j + 1] = key

    return result`,
    },
  },
  {
    key: 'selection',
    category: 'Simple',
    name: 'Selection Sort',
    tooltip: 'O(n²) — low-write teaching sort; selects the minimum for each output position',
    gen: selection,
    docs: {
      description:
        'Splits the array into a sorted prefix and an unsorted remainder. Each pass scans the entire remainder to find the minimum value, then swaps that minimum into the next prefix position. It performs very few swaps compared with Bubble Sort, but it is not adaptive: even a fully sorted array still requires the same complete scans.',
      steps: [
        'Find the minimum element in the unsorted remainder.',
        'Swap it to the boundary of the sorted prefix.',
        'Advance the boundary one position right.',
        'Repeat until the remainder is empty.',
      ],
      complexity: { best: 'O(n²)', worst: 'O(n²)', average: 'O(n²)', space: 'O(1)' },
      code: `def selection_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using selection sort."""
    result = arr.copy()
    n = len(result)

    for i in range(n):
        min_idx = i
        for j in range(i + 1, n):
            if result[j] < result[min_idx]:
                min_idx = j
        result[i], result[min_idx] = result[min_idx], result[i]

    return result`,
    },
  },
  {
    key: 'merge',
    category: 'Efficient / Gap-Based',
    name: 'Merge Sort',
    tooltip: 'O(n log n) — stable general sort; recursively merges sorted halves',
    gen: merge,
    docs: {
      description:
        'A stable divide-and-conquer sort with predictable performance. It splits the array into halves until each subarray is trivially sorted, then merges neighboring sorted runs by repeatedly taking the smaller front value. Merge Sort does not depend on lucky pivots or existing order for its O(n log n) bound, but the merge step needs extra temporary storage.',
      steps: [
        'Divide the array into two halves.',
        'Recursively sort each half.',
        'Merge the halves by repeatedly taking the smaller front element.',
        'A subarray of length 0 or 1 is already sorted (base case).',
      ],
      complexity: { best: 'O(n log n)', worst: 'O(n log n)', average: 'O(n log n)', space: 'O(n)' },
      code: `def merge_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using merge sort."""
    if len(arr) <= 1:
        return arr.copy()

    mid = len(arr) // 2
    left = merge_sort(arr[:mid])
    right = merge_sort(arr[mid:])
    return merge(left, right)

def merge(left: list[int], right: list[int]) -> list[int]:
    """Merge two sorted lists into one sorted list."""
    result = []
    i = j = 0
    while i < len(left) and j < len(right):
        if left[i] <= right[j]:
            result.append(left[i])
            i += 1
        else:
            result.append(right[j])
            j += 1
    result.extend(left[i:])
    result.extend(right[j:])
    return result`,
    },
  },
  {
    key: 'quick',
    category: 'Efficient / Gap-Based',
    name: 'Quick Sort',
    tooltip: 'O(n log n) avg — in-place general sort; partitions around a last-element pivot',
    gen: quick,
    docs: {
      description:
        'A divide-and-conquer sort that chooses a pivot, partitions the range so smaller values land on one side and larger values on the other, then recursively sorts those partitions. This implementation uses the last element as the pivot, which keeps the code compact and the partition easy to see. It is usually very fast and in-place, but poor pivot choices create unbalanced recursion and can degrade to O(n²).',
      steps: [
        'Choose a pivot (here, the last element of the range).',
        'Partition so values ≤ pivot move left of it and the rest move right.',
        'Place the pivot at its final sorted position.',
        'Recurse on the left and right partitions.',
        'Ranges of length 0 or 1 are the base case.',
      ],
      complexity: { best: 'O(n log n)', worst: 'O(n²)', average: 'O(n log n)', space: 'O(log n)' },
      code: `def quick_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using quick sort."""
    result = arr.copy()
    _quick_sort(result, 0, len(result) - 1)
    return result

def _quick_sort(arr: list[int], low: int, high: int) -> None:
    if low < high:
        p = partition(arr, low, high)
        _quick_sort(arr, low, p - 1)
        _quick_sort(arr, p + 1, high)

def partition(arr: list[int], low: int, high: int) -> int:
    pivot = arr[high]
    i = low - 1
    for j in range(low, high):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1`,
    },
  },
  {
    key: 'heap',
    category: 'Efficient / Gap-Based',
    name: 'Heap Sort',
    tooltip: 'O(n log n) — guaranteed in-place sort; builds a max-heap then extracts maxima',
    gen: heap,
    docs: {
      description:
        'Turns the array into a binary max-heap, where every parent is at least as large as its children. The largest value is always at the root, so the algorithm swaps that root to the end, shrinks the heap, and sifts the new root down to restore the heap property. Heap Sort is in-place and has a guaranteed O(n log n) bound, though it is not stable and its memory access pattern is less cache-friendly than Merge Sort or Quick Sort.',
      steps: [
        'Build a max-heap so each parent is ≥ its children.',
        'Swap the root (maximum) with the last heap element.',
        'Shrink the heap by one and sift the new root down.',
        'Repeat until the heap holds a single element.',
      ],
      complexity: { best: 'O(n log n)', worst: 'O(n log n)', average: 'O(n log n)', space: 'O(1)' },
      code: `def heap_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using heap sort."""
    result = arr.copy()
    n = len(result)

    for i in range(n // 2 - 1, -1, -1):
        sift_down(result, i, n)
    for end in range(n - 1, 0, -1):
        result[0], result[end] = result[end], result[0]
        sift_down(result, 0, end)

    return result

def sift_down(arr: list[int], root: int, end: int) -> None:
    while True:
        largest = root
        left, right = 2 * root + 1, 2 * root + 2
        if left < end and arr[left] > arr[largest]:
            largest = left
        if right < end and arr[right] > arr[largest]:
            largest = right
        if largest == root:
            return
        arr[root], arr[largest] = arr[largest], arr[root]
        root = largest`,
    },
  },
  {
    key: 'cocktail',
    category: 'Simple',
    name: 'Cocktail Shaker Sort',
    tooltip: 'O(n²) avg/worst — bidirectional bubble variant; sweeps forward then backward',
    gen: cocktail,
    docs: {
      description:
        'A bidirectional variation of Bubble Sort. A forward pass bubbles the largest remaining value to the right, then a backward pass bubbles the smallest remaining value to the left. By shrinking both ends of the active range, Cocktail Shaker Sort handles small values trapped near the far end better than one-direction Bubble Sort while preserving the same simple adjacent-swap idea.',
      steps: [
        'Bubble the largest element rightward in a forward pass.',
        'Bubble the smallest element leftward in a backward pass.',
        'Shrink the active range from both ends.',
        'Repeat until a full round makes no swaps.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n²)', average: 'O(n²)', space: 'O(1)' },
      code: `def cocktail_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using cocktail shaker sort."""
    result = arr.copy()
    lo, hi = 0, len(result) - 1
    swapped = True

    while swapped:
        swapped = False
        for i in range(lo, hi):
            if result[i] > result[i + 1]:
                result[i], result[i + 1] = result[i + 1], result[i]
                swapped = True
        hi -= 1
        if not swapped:
            break
        swapped = False
        for i in range(hi, lo, -1):
            if result[i - 1] > result[i]:
                result[i - 1], result[i] = result[i], result[i - 1]
                swapped = True
        lo += 1

    return result`,
    },
  },
  {
    key: 'introsort',
    category: 'Real-World Implementations',
    name: 'Introsort',
    tooltip: 'O(n log n) — C++ std::sort style hybrid; quicksort falls back to heapsort',
    gen: introspective,
    docs: {
      description:
        'A hybrid comparison sort, usually called Introsort. It begins like Quick Sort because partitioning is fast in practice, tracks recursion depth to detect bad pivot behavior, and switches the current partition to Heap Sort if recursion gets too deep. Small partitions are finished with Insertion Sort. This gives it Quick Sort’s average-case speed while preserving a worst-case O(n log n) bound.',
      steps: [
        'Start with a depth limit of about 2 × log₂(n).',
        'Partition the range as Quick Sort would.',
        'Recurse on the partitions while decreasing the depth limit.',
        'If the depth limit reaches zero, heap-sort that range.',
        'Use insertion sort for small ranges.',
      ],
      complexity: { best: 'O(n log n)', worst: 'O(n log n)', average: 'O(n log n)', space: 'O(log n)' },
      code: `def intro_sort(arr: list[int]) -> list[int]:
    """Introsort: quicksort with heapsort fallback."""
    result = arr.copy()
    depth_limit = 2 * (len(result).bit_length() - 1)
    intro_sort_util(result, 0, len(result) - 1, depth_limit)
    return result

def intro_sort_util(arr: list[int], begin: int, end: int, depth_limit: int) -> None:
    size = end - begin + 1
    if size <= 1:
        return
    if size < 16:
        insertion_sort_range(arr, begin, end)
        return
    if depth_limit == 0:
        heap_sort_range(arr, begin, end)
        return
    pivot = partition(arr, begin, end)
    intro_sort_util(arr, begin, pivot - 1, depth_limit - 1)
    intro_sort_util(arr, pivot + 1, end, depth_limit - 1)

def partition(arr: list[int], low: int, high: int) -> int:
    pivot = arr[high]
    i = low - 1
    for j in range(low, high):
        if arr[j] <= pivot:
            i += 1
            arr[i], arr[j] = arr[j], arr[i]
    arr[i + 1], arr[high] = arr[high], arr[i + 1]
    return i + 1

def insertion_sort_range(arr: list[int], begin: int, end: int) -> None:
    for i in range(begin + 1, end + 1):
        key = arr[i]
        j = i - 1
        while j >= begin and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key

def heap_sort_range(arr: list[int], begin: int, end: int) -> None:
    count = end - begin + 1
    for root in range(count // 2 - 1, -1, -1):
        heapify(arr, count, root, begin)
    for last in range(count - 1, 0, -1):
        arr[begin], arr[begin + last] = arr[begin + last], arr[begin]
        heapify(arr, last, 0, begin)

def heapify(arr: list[int], count: int, root: int, offset: int) -> None:
    largest = root
    left = 2 * root + 1
    right = 2 * root + 2
    if left < count and arr[offset + left] > arr[offset + largest]:
        largest = left
    if right < count and arr[offset + right] > arr[offset + largest]:
        largest = right
    if largest != root:
        arr[offset + root], arr[offset + largest] = arr[offset + largest], arr[offset + root]
        heapify(arr, count, largest, offset)`,
    },
  },
  {
    key: 'comb',
    category: 'Efficient / Gap-Based',
    name: 'Comb Sort',
    tooltip: 'O(n²) worst — gap-based bubble variant; shrinks a comb gap toward one',
    gen: comb,
    docs: {
      description:
        'Improves on Bubble Sort by comparing values that are far apart before it compares neighbors. The gap starts near the array length and shrinks by about 1.3 each pass until it reaches one, where the algorithm finishes with bubble-like adjacent passes. Those wide early comparisons move badly misplaced values long distances, which reduces the "turtle" problem that makes Bubble Sort slow on many inputs.',
      steps: [
        'Start with a gap equal to the array length.',
        'Compare and swap elements that are `gap` apart.',
        'Divide the gap by ~1.3 after each pass.',
        'Once the gap is one, finish like a bubble pass.',
        'Stop when the gap is one and no swaps occur.',
      ],
      complexity: { best: 'O(n log n)', worst: 'O(n²)', average: 'O(n² / 2^p)', space: 'O(1)' },
      code: `def comb_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using comb sort."""
    result = arr.copy()
    n = len(result)
    gap = n
    swapped = True

    while gap > 1 or swapped:
        gap = max(1, int(gap / 1.3))
        swapped = False
        for i in range(n - gap):
            if result[i] > result[i + gap]:
                result[i], result[i + gap] = result[i + gap], result[i]
                swapped = True

    return result`,
    },
  },
  {
    key: 'shell',
    category: 'Efficient / Gap-Based',
    name: 'Shell Sort',
    tooltip: 'O(n log²n) avg — gap-based insertion sort; halves the gap to one',
    gen: shell,
    docs: {
      description:
        'A generalization of Insertion Sort that first sorts interleaved subsequences separated by a gap. The gap gradually shrinks, so early passes can move values across large distances and later passes clean up local disorder. When the gap finally reaches one, Shell Sort becomes ordinary insertion sort over an array that is often already close to sorted; its exact complexity depends heavily on the chosen gap sequence.',
      steps: [
        'Choose a starting gap (here, half the length).',
        'Run a gapped insertion sort over the array.',
        'Halve the gap and repeat.',
        'Finish with a normal insertion pass at gap one.',
      ],
      complexity: { best: 'O(n log n)', worst: 'O(n²)', average: 'O(n log²n)', space: 'O(1)' },
      code: `def shell_sort(arr: list[int]) -> list[int]:
    """Sort a list of integers using shell sort."""
    result = arr.copy()
    n = len(result)
    gap = n // 2

    while gap > 0:
        for i in range(gap, n):
            temp = result[i]
            j = i
            while j >= gap and result[j - gap] > temp:
                result[j] = result[j - gap]
                j -= gap
            result[j] = temp
        gap //= 2

    return result`,
    },
  },
  {
    key: 'tim',
    category: 'Real-World Implementations',
    name: 'Timsort',
    tooltip: 'O(n log n) avg/worst — Python/Java-style stable sort; detects runs and merges them',
    gen: tim,
    docs: {
      description:
        'A hybrid, stable sort based on the strategy used by Python and Java standard library sorts. It scans for naturally ordered runs, reverses descending runs, extends short runs with binary insertion sort, and merges runs from a stack while maintaining balance rules. During merging, galloping searches can bulk-copy stretches when one run keeps winning. Timsort is adaptive: already ordered or partially ordered data can be processed much faster than random data.',
      steps: [
        'Compute a minimum run length from the array size.',
        'Scan for the next natural run, reversing it if it descends.',
        'Pad runs shorter than minrun using binary insertion sort.',
        'Push each run on a stack and merge while size invariants are violated.',
        'Switch to galloping mode when one run wins MIN_GALLOP times in a row.',
        'Force-merge the remaining runs into one sorted array.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n log n)', average: 'O(n log n)', space: 'O(n)' },
      code: `MIN_MERGE = 32

def tim_sort(arr: list[int]) -> list[int]:
    """A compact Timsort-style implementation."""
    result = arr.copy()
    n = len(result)
    if n < 2:
        return result

    min_run = min_run_length(n)
    runs = []
    low = 0
    while low < n:
        run_len = count_run_and_make_ascending(result, low, n)
        if run_len < min_run:
            force = min(n - low, min_run)
            binary_insertion_sort(result, low, low + force, low + run_len)
            run_len = force
        runs.append((low, run_len))
        low += run_len

    while len(runs) > 1:
        merged = []
        for i in range(0, len(runs), 2):
            if i + 1 == len(runs):
                merged.append(runs[i])
            else:
                base1, len1 = runs[i]
                base2, len2 = runs[i + 1]
                merge_runs(result, base1, len1, base2, len2)
                merged.append((base1, len1 + len2))
        runs = merged

    return result

def min_run_length(n: int) -> int:
    r = 0
    while n >= MIN_MERGE:
        r |= n & 1
        n >>= 1
    return n + r

def count_run_and_make_ascending(arr: list[int], lo: int, hi: int) -> int:
    run_hi = lo + 1
    if run_hi == hi:
        return 1
    if arr[run_hi] < arr[lo]:
        while run_hi < hi and arr[run_hi] < arr[run_hi - 1]:
            run_hi += 1
        arr[lo:run_hi] = reversed(arr[lo:run_hi])
    else:
        while run_hi < hi and arr[run_hi] >= arr[run_hi - 1]:
            run_hi += 1
    return run_hi - lo

def binary_insertion_sort(arr: list[int], lo: int, hi: int, start: int) -> None:
    for i in range(start, hi):
        pivot = arr[i]
        left, right = lo, i
        while left < right:
            mid = (left + right) // 2
            if pivot < arr[mid]:
                right = mid
            else:
                left = mid + 1
        for j in range(i, left, -1):
            arr[j] = arr[j - 1]
        arr[left] = pivot

def merge_runs(arr: list[int], base1: int, len1: int, base2: int, len2: int) -> None:
    left = arr[base1:base1 + len1]
    right = arr[base2:base2 + len2]
    i = j = 0
    dest = base1
    while i < len1 and j < len2:
        if left[i] <= right[j]:
            arr[dest] = left[i]
            i += 1
        else:
            arr[dest] = right[j]
            j += 1
        dest += 1
    arr[dest:dest + len1 - i] = left[i:]
    dest += len1 - i
    arr[dest:dest + len2 - j] = right[j:]`,
    },
  },
  {
    key: 'powersort',
    category: 'Real-World Implementations',
    name: 'CPython Powersort',
    tooltip: 'O(n log n) avg/worst — Python list.sort() strategy; detects runs and merges by node power',
    gen: powersort,
    docs: {
      description:
        'CPython Powersort is the stable adaptive merge sort used by modern Python list.sort() and sorted(). It keeps Timsort’s natural-run detection, descending-run reversal, minrun extension by binary insertion sort, and galloping merge machinery, but replaces Timsort’s older stack invariants with a node-power merge policy. The node power estimates where adjacent runs belong in a near-optimal binary merge tree, so runs are merged when the stack power order says delaying would make the merge tree worse.',
      steps: [
        'Scan the next natural ascending or descending run.',
        'Reverse descending runs so every run is ascending.',
        'Extend short runs to minrun with binary insertion sort.',
        'Compute the previous run’s node power from the midpoints of two adjacent runs.',
        'Merge pending runs while their stored power is deeper than the new power.',
        'Force-merge the stack after all runs have been discovered.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n log n)', average: 'O(n log n)', space: 'O(n)' },
      code: `MIN_MERGE = 32

def powersort(arr: list[int]) -> list[int]:
    """CPython-style Powersort: natural runs plus a node-power merge policy."""
    result = arr.copy()
    n = len(result)
    if n < 2:
        return result

    min_run = min_run_length(n)
    pending = []
    low = 0
    while low < n:
        run_len = count_run_and_make_ascending(result, low, n)
        if run_len < min_run:
            force = min(n - low, min_run)
            binary_insertion_sort(result, low, low + force, low + run_len)
            run_len = force

        run = [low, run_len, 0]
        if not pending:
            pending.append(run)
        else:
            found_new_run(result, pending, run, n)
        low += run_len

    while len(pending) > 1:
        merge_at(result, pending, len(pending) - 2)
    return result

def powerloop(n: int, s1: int, n1: int, s2: int, n2: int) -> int:
    denominator = 2 * n
    left = 2 * s1 + n1
    right = 2 * s2 + n2
    power = 0
    while True:
        power += 1
        left *= 2
        right *= 2
        left_bit = left >= denominator
        right_bit = right >= denominator
        if left_bit != right_bit:
            return power
        if left_bit:
            left -= denominator
        if right_bit:
            right -= denominator

def found_new_run(arr: list[int], pending: list[list[int]], run: list[int], n: int) -> None:
    current = pending[-1]
    power = powerloop(n, current[0], current[1], run[0], run[1])
    while len(pending) > 1 and pending[-2][2] > power:
        merge_at(arr, pending, len(pending) - 2)
    pending[-1][2] = power
    pending.append(run)`,
    },
  },
  {
    key: 'dual-pivot',
    category: 'Real-World Implementations',
    name: 'Dual-Pivot Quicksort',
    tooltip: 'O(n log n) avg — Java primitive-array style sort; partitions into three regions with two pivots',
    gen: dualPivot,
    docs: {
      description:
        'Dual-Pivot Quicksort is the Yaroslavskiy-style quicksort family used for primitive arrays in Java. It chooses two pivots, orders them, partitions the range into values below the left pivot, between the pivots, and above the right pivot, then recursively sorts the three regions. This visualizer uses the canonical two-pivot partition shape so the three-way split is easy to inspect.',
      steps: [
        'Use the first and last values as pivots, swapping them if needed.',
        'Walk through the middle region with three pointers.',
        'Move values below the left pivot to the left side.',
        'Move values above the right pivot to the right side.',
        'Swap both pivots into their final boundaries.',
        'Recursively sort the left, middle, and right partitions.',
      ],
      complexity: { best: 'O(n log n)', worst: 'O(n²)', average: 'O(n log n)', space: 'O(log n)' },
      code: `def dual_pivot_quicksort(arr: list[int]) -> list[int]:
    """Sort using Yaroslavskiy's dual-pivot partitioning scheme."""
    result = arr.copy()
    sort(result, 0, len(result) - 1)
    return result

def sort(arr: list[int], low: int, high: int) -> None:
    if low >= high:
        return
    lp, rp = partition(arr, low, high)
    sort(arr, low, lp - 1)
    if arr[lp] < arr[rp]:
        sort(arr, lp + 1, rp - 1)
    sort(arr, rp + 1, high)

def partition(arr: list[int], low: int, high: int) -> tuple[int, int]:
    if arr[low] > arr[high]:
        arr[low], arr[high] = arr[high], arr[low]

    left_pivot = arr[low]
    right_pivot = arr[high]
    lt = low + 1
    gt = high - 1
    i = lt

    while i <= gt:
        if arr[i] < left_pivot:
            arr[i], arr[lt] = arr[lt], arr[i]
            lt += 1
        elif arr[i] > right_pivot:
            while arr[gt] > right_pivot and i < gt:
                gt -= 1
            arr[i], arr[gt] = arr[gt], arr[i]
            gt -= 1
            if arr[i] < left_pivot:
                arr[i], arr[lt] = arr[lt], arr[i]
                lt += 1
        i += 1

    lt -= 1
    gt += 1
    arr[low], arr[lt] = arr[lt], arr[low]
    arr[high], arr[gt] = arr[gt], arr[high]
    return lt, gt`,
    },
  },
  {
    key: 'pdqsort',
    category: 'Real-World Implementations',
    name: 'PDQsort',
    tooltip: 'O(n log n) avg/worst — pattern-defeating quicksort; breaks bad patterns and falls back to heapsort',
    gen: pdqsort,
    docs: {
      description:
        'PDQsort, short for pattern-defeating quicksort, is Orson Peters’s refinement of Introsort. It keeps quicksort’s fast partitioning, uses insertion sort on small ranges, detects already partitioned data, attempts a tiny partial insertion sort on nearly sorted partitions, breaks suspicious patterns after highly unbalanced partitions, and falls back to Heap Sort when too many bad partitions occur.',
      steps: [
        'Choose a median-of-three pivot for the current range.',
        'Partition values below and above the pivot.',
        'Use insertion sort for small partitions.',
        'If a partition was already clean, try a bounded partial insertion sort.',
        'After highly unbalanced partitions, perturb the middle elements to defeat patterns.',
        'When the bad-partition budget is exhausted, heap-sort the range.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n log n)', average: 'O(n log n)', space: 'O(log n)' },
      code: `def pdqsort(arr: list[int]) -> list[int]:
    """Pattern-defeating quicksort in the style of pdqsort."""
    result = arr.copy()
    bad_allowed = 2 * (len(result).bit_length() - 1)
    sort(result, 0, len(result), bad_allowed)
    return result

def sort(arr: list[int], lo: int, hi: int, bad_allowed: int) -> None:
    while hi - lo > 16:
        pivot = partition(arr, lo, hi)
        left = pivot - lo
        right = hi - pivot - 1

        if left < (hi - lo) // 8 or right < (hi - lo) // 8:
            bad_allowed -= 1
            if bad_allowed == 0:
                heap_sort_range(arr, lo, hi)
                return
            break_patterns(arr, lo, pivot)
            break_patterns(arr, pivot + 1, hi)

        if left < right:
            sort(arr, lo, pivot, bad_allowed)
            lo = pivot + 1
        else:
            sort(arr, pivot + 1, hi, bad_allowed)
            hi = pivot

    insertion_sort_range(arr, lo, hi)

def partition(arr: list[int], lo: int, hi: int) -> int:
    mid = lo + (hi - lo) // 2
    median_of_three(arr, lo, mid, hi - 1)
    arr[lo], arr[mid] = arr[mid], arr[lo]
    pivot = arr[lo]
    i, j = lo + 1, hi - 1
    while True:
        while i <= j and arr[i] < pivot:
            i += 1
        while i <= j and arr[j] > pivot:
            j -= 1
        if i >= j:
            break
        arr[i], arr[j] = arr[j], arr[i]
        i += 1
        j -= 1
    arr[lo], arr[j] = arr[j], arr[lo]
    return j`,
    },
  },
  {
    key: 'radix',
    category: 'Non-Comparison',
    name: 'Radix Sort',
    tooltip: 'O(d × (n + k)) — integer key sort; runs stable counting sort by digit',
    gen: radix,
    docs: {
      description:
        'A non-comparison sort for non-negative integers. It processes values digit by digit from least significant to most significant, using a stable counting sort for each digit so earlier digit ordering is preserved. Its cost depends on the number of digits and items rather than on pairwise comparisons, which makes it attractive when the key range and digit count are controlled.',
      steps: [
        'Find the maximum value to learn the digit count.',
        'Starting at the ones place, bucket items by the current digit.',
        'Rebuild the array stably from the buckets.',
        'Advance to the next more significant digit.',
        'Repeat until all digit positions are processed.',
      ],
      complexity: { best: 'O(d × (n + k))', worst: 'O(d × (n + k))', average: 'O(d × (n + k))', space: 'O(n + k)' },
      code: `def radix_sort(arr: list[int]) -> list[int]:
    """Sort non-negative integers using LSD radix sort."""
    if not arr:
        return []

    result = arr.copy()
    exp = 1
    while max(result) // exp > 0:
        counting_sort_by_digit(result, exp)
        exp *= 10
    return result

def counting_sort_by_digit(arr: list[int], exp: int) -> None:
    n = len(arr)
    output = [0] * n
    count = [0] * 10
    for num in arr:
        count[(num // exp) % 10] += 1
    for i in range(1, 10):
        count[i] += count[i - 1]
    for i in range(n - 1, -1, -1):
        digit = (arr[i] // exp) % 10
        output[count[digit] - 1] = arr[i]
        count[digit] -= 1
    for i in range(n):
        arr[i] = output[i]`,
    },
  },
  {
    key: 'counting',
    category: 'Non-Comparison',
    name: 'Counting Sort',
    tooltip: 'O(n + k) — small integer range sort; counts values then writes prefix positions',
    gen: counting,
    docs: {
      description:
        'A non-comparison sort for integers drawn from a limited range. It counts how often each value appears, converts those counts into final positions with a prefix sum, and places each item directly into an output array. Counting Sort can be stable and linear in the number of items plus the value range, but it becomes wasteful when the range is much larger than the input.',
      steps: [
        'Count occurrences of every value into a count array.',
        'Take a running prefix sum so counts become end positions.',
        'Scan right-to-left, placing each value at its position.',
        'Decrement the position after each placement (stable).',
      ],
      complexity: { best: 'O(n + k)', worst: 'O(n + k)', average: 'O(n + k)', space: 'O(n + k)' },
      code: `def counting_sort(arr: list[int]) -> list[int]:
    """Sort integers using counting sort."""
    if not arr:
        return []

    lo, hi = min(arr), max(arr)
    count = [0] * (hi - lo + 1)
    for num in arr:
        count[num - lo] += 1
    for i in range(1, len(count)):
        count[i] += count[i - 1]

    output = [0] * len(arr)
    for num in reversed(arr):
        count[num - lo] -= 1
        output[count[num - lo]] = num
    return output`,
    },
  },
  {
    key: 'bead',
    category: 'Non-Comparison',
    name: 'Bead Sort',
    tooltip: 'O(n × m) — simulates beads falling under gravity',
    gen: bead,
    docs: {
      description:
        'A non-comparison sort inspired by an abacus. Each value is represented as beads stacked up to that height, then the beads are allowed to "fall" so dense columns collect on one side. Reading the resulting column heights gives a sorted sequence. It is a memorable physical model for non-negative integers, but in software it is mostly educational because the work depends on both the number of values and the maximum value.',
      steps: [
        'Represent each value as that many beads.',
        'Count how many beads exist at each height.',
        'Let those bead counts fall to the right.',
        'Read the resulting column heights back as sorted values.',
      ],
      complexity: { best: 'O(n × m)', worst: 'O(n × m)', average: 'O(n × m)', space: 'O(m)' },
      code: `def bead_sort(arr: list[int]) -> list[int]:
    """Sort non-negative integers by simulating beads falling under gravity."""
    if not arr:
        return []

    n = len(arr)
    max_value = max(arr)
    # grid[i][j] is 1 when row i has a bead on rod j.
    grid = [[0] * max_value for _ in range(n)]
    for i in range(n):
        for j in range(arr[i]):
            grid[i][j] = 1

    # Let the beads on each rod fall to the bottom rows.
    for j in range(max_value):
        beads = sum(grid[i][j] for i in range(n))
        for i in range(n):
            grid[i][j] = 1 if i >= n - beads else 0

    # Each row's bead count is its sorted value (ascending top to bottom).
    return [sum(row) for row in grid]`,
    },
  },
  {
    key: 'bucket',
    category: 'Non-Comparison',
    name: 'Bucket Sort',
    tooltip: 'O(n + k) average — distribution sort; buckets values then insertion-sorts buckets',
    gen: bucket,
    docs: {
      description:
        'A distribution sort that places values into a set of buckets, sorts each bucket, and concatenates the buckets in order. The usual textbook version assumes values are spread fairly evenly, so each bucket stays small and insertion sort is cheap. If many values land in one bucket, the per-bucket insertion sort can dominate and the worst case becomes quadratic.',
      steps: [
        'Find the input range and create one bucket per item.',
        'Map each value into a bucket based on its relative position in the range.',
        'Sort each bucket, usually with insertion sort.',
        'Concatenate the buckets from low to high.',
      ],
      complexity: { best: 'O(n + k)', worst: 'O(n²)', average: 'O(n + k)', space: 'O(n + k)' },
      code: `def bucket_sort(arr: list[int]) -> list[int]:
    """Sort integers by distributing them into buckets."""
    if not arr:
        return []

    result = arr.copy()
    bucket_count = len(result)
    min_value = min(result)
    max_value = max(result)
    value_range = max_value - min_value + 1
    buckets = [[] for _ in range(bucket_count)]

    for value in result:
        index = ((value - min_value) * bucket_count) // value_range
        buckets[min(bucket_count - 1, index)].append(value)

    output = []
    for bucket in buckets:
        insertion_sort(bucket)
        output.extend(bucket)
    return output

def insertion_sort(arr: list[int]) -> None:
    for i in range(1, len(arr)):
        key = arr[i]
        j = i - 1
        while j >= 0 and arr[j] > key:
            arr[j + 1] = arr[j]
            j -= 1
        arr[j + 1] = key`,
    },
  },
  {
    key: 'gnome',
    category: 'Simple',
    name: 'Gnome Sort',
    tooltip: 'O(n²) avg/worst — tiny insertion variant; swaps backward until ordered',
    gen: gnome,
    docs: {
      description:
        'A deliberately awkward cousin of Insertion Sort. Instead of holding one key value and shifting a block, it repeatedly swaps adjacent inverted pairs and walks backward until the current value reaches its proper spot in the prefix. The result is conceptually close to insertion sort, but with more individual swaps. Its tiny control flow makes it charming to animate even though it is rarely practical.',
      steps: [
        'Start at the second element, just after the sorted prefix.',
        'If the adjacent pair is ordered, walk one step right.',
        'If the pair is inverted, swap it and walk one step left.',
        'This backward walk inserts the value into the prefix, one adjacent swap at a time.',
        'Repeat until the walk reaches the end.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n²)', average: 'O(n²)', space: 'O(1)' },
      code: `def gnome_sort(arr: list[int]) -> list[int]:
    """Sort by walking backward whenever adjacent values are inverted."""
    result = arr.copy()
    i = 1
    while i < len(result):
        if result[i - 1] <= result[i]:
            i += 1
        else:
            result[i - 1], result[i] = result[i], result[i - 1]
            i = max(1, i - 1)
    return result`,
    },
  },
  {
    key: 'odd-even',
    category: 'Simple',
    name: 'Odd-Even Sort',
    tooltip: 'O(n²) avg/worst — parallel-friendly bubble variant; alternates odd and even pairs',
    gen: oddEven,
    docs: {
      description:
        'A variation of Bubble Sort, also called Brick Sort. Instead of scanning every adjacent pair in one linear pass, it alternates between odd-indexed pairs and even-indexed pairs. Those two phases can be run in parallel on suitable hardware because pairs inside a phase do not overlap. In this visualizer they run sequentially, which makes the phase pattern easy to see.',
      steps: [
        'Compare and swap odd-indexed adjacent pairs.',
        'Compare and swap even-indexed adjacent pairs.',
        'If either phase swapped, repeat both phases.',
        'Stop after a full odd/even round with no swaps.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n²)', average: 'O(n²)', space: 'O(1)' },
      code: `def odd_even_sort(arr: list[int]) -> list[int]:
    """Sort by alternating odd and even adjacent pair passes."""
    result = arr.copy()
    sorted_pass = False
    while not sorted_pass:
        sorted_pass = True
        for i in range(1, len(result) - 1, 2):
            if result[i] > result[i + 1]:
                result[i], result[i + 1] = result[i + 1], result[i]
                sorted_pass = False
        for i in range(0, len(result) - 1, 2):
            if result[i] > result[i + 1]:
                result[i], result[i + 1] = result[i + 1], result[i]
                sorted_pass = False
    return result`,
    },
  },
  {
    key: 'cycle',
    category: 'Special-Purpose',
    name: 'Cycle Sort',
    tooltip: 'O(n²) — write-minimizing sort; rotates each item into its final cycle position',
    gen: cycle,
    docs: {
      description:
        'An in-place comparison sort designed to minimize writes, useful as a teaching example for memory with limited write endurance. For each cycle start, it counts how many values are smaller than the current item to find that item’s final position, writes it there, then rotates the displaced item into its own final position until the cycle closes. The implementation follows the canonical cycle sort structure and marks each placement as sorted for visualization.',
      steps: [
        'Pick the start of the next cycle.',
        'Count smaller values to find the item’s final position.',
        'Write the item there, displacing the previous occupant.',
        'Repeat with displaced items until the cycle returns to the start.',
        'Advance to the next cycle start and repeat.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n²)', average: 'O(n²)', space: 'O(1)' },
      code: `def cycle_sort(arr: list[int]) -> list[int]:
    """Sort in place while minimizing writes."""
    result = arr.copy()
    n = len(result)

    for cycle_start in range(n - 1):
        item = result[cycle_start]
        pos = cycle_start

        for i in range(cycle_start + 1, n):
            if result[i] < item:
                pos += 1

        if pos == cycle_start:
            continue

        while item == result[pos]:
            pos += 1
        result[pos], item = item, result[pos]

        while pos != cycle_start:
            pos = cycle_start
            for i in range(cycle_start + 1, n):
                if result[i] < item:
                    pos += 1
            while item == result[pos]:
                pos += 1
            result[pos], item = item, result[pos]
    return result`,
    },
  },
  {
    key: 'bitonic',
    category: 'Special-Purpose',
    name: 'Bitonic Sort',
    tooltip: 'O(n log²n) — parallel sorting network; recursively builds and merges bitonic runs',
    gen: bitonic,
    docs: {
      description:
        'A comparison sorting network designed for parallel hardware. It recursively creates bitonic sequences, where one half rises and the other half falls, then merges each bitonic sequence into a fully sorted run using fixed compare-and-swap patterns. Classic Bitonic Sort is usually presented for powers of two; this implementation pads internally to the next power of two so arbitrary lengths still sort correctly.',
      steps: [
        'Recursively sort the first half ascending.',
        'Recursively sort the second half descending.',
        'Compare and swap across a fixed stride to form the requested direction.',
        'Recursively merge the two smaller bitonic halves.',
      ],
      complexity: { best: 'O(n log²n)', worst: 'O(n log²n)', average: 'O(n log²n)', space: 'O(log n)' },
      code: `def bitonic_sort(arr: list[int]) -> list[int]:
    """Sort using a bitonic sorting-network pattern."""
    if not arr:
        return []

    original_length = len(arr)
    padded_length = next_power_of_two(original_length)
    sentinel = max(arr) + 1
    result = arr.copy() + [sentinel] * (padded_length - original_length)
    bitonic_sort_rec(result, 0, len(result), True)
    return result[:original_length]

def bitonic_sort_rec(arr: list[int], low: int, count: int, ascending: bool) -> None:
    if count <= 1:
        return
    split = count // 2
    bitonic_sort_rec(arr, low, split, True)
    bitonic_sort_rec(arr, low + split, count - split, False)
    bitonic_merge(arr, low, count, ascending)

def bitonic_merge(arr: list[int], low: int, count: int, ascending: bool) -> None:
    if count <= 1:
        return
    step = count // 2
    for i in range(low, low + step):
        if (ascending and arr[i] > arr[i + step]) or (not ascending and arr[i] < arr[i + step]):
            arr[i], arr[i + step] = arr[i + step], arr[i]
    bitonic_merge(arr, low, step, ascending)
    bitonic_merge(arr, low + step, step, ascending)

def next_power_of_two(n: int) -> int:
    power = 1
    while power < n:
        power <<= 1
    return power`,
    },
  },
  {
    key: 'bogo',
    category: 'For Fun',
    name: 'Bogo Sort',
    tooltip: 'O(n × n!) avg — joke algorithm; shuffles randomly until the array is sorted',
    gen: bogo,
    docs: {
      description:
        'A deliberately terrible "generate and test" algorithm. It checks whether the array is sorted; if not, it shuffles everything randomly and tries again. The expected number of shuffles grows factorially, so it is useful only as a joke, a probability lesson, or a warning about algorithms that rely on blind luck.',
      steps: [
        'Check whether the array is sorted.',
        'If it is, stop — you got lucky.',
        'Otherwise shuffle every element randomly.',
        'Go back and check again.',
      ],
      complexity: { best: 'O(n)', worst: 'O(∞)', average: 'O(n × n!)', space: 'O(1)' },
      code: `import random

def bogo_sort(arr: list[int]) -> list[int]:
    """Sort a list using bogo sort. Do not use on real data!"""
    result = arr.copy()
    while not is_sorted(result):
        random.shuffle(result)
    return result

def is_sorted(arr: list[int]) -> bool:
    return all(arr[i] <= arr[i + 1] for i in range(len(arr) - 1))

# For n elements the expected number of shuffles is n!.
# n = 10 already means ~3,628,800 shuffles on average.`,
    },
  },
];

const ALGORITHM_ORDER = [
  'bubble',
  'insertion',
  'selection',
  'cocktail',
  'gnome',
  'odd-even',
  'merge',
  'quick',
  'heap',
  'shell',
  'comb',
  'tim',
  'powersort',
  'introsort',
  'dual-pivot',
  'pdqsort',
  'counting',
  'radix',
  'bucket',
  'bitonic',
  'cycle',
  'bogo',
];

const registryByKey = Object.fromEntries(algorithmRegistry.map((a) => [a.key, a]));

export const algorithms = ALGORITHM_ORDER.map((key) => registryByKey[key]);
export const algorithmsByKey = Object.fromEntries(algorithms.map((a) => [a.key, a]));
