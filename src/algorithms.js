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
//   { type: 'markSorted', indices: [...] }              finalize elements (green)

// --- op helpers --------------------------------------------------------------

const compare = (i, j) => ({ type: 'compare', indices: [i, j] });
const pivot = (i) => ({ type: 'pivot', index: i });
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

// Faithful Timsort: natural run detection, minrun-padded binary insertion
// sort, and a run stack merged under Timsort's size invariants. (Galloping
// mode is omitted — it is an optimization, not part of correctness.)

const MIN_MERGE = 32;

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

// Stable merge of two adjacent runs via a copy of the (smaller) left run.
function* mergeRuns(a, base1, len1, base2, len2) {
  const hi = base2 + len2;
  const left = a.slice(base1, base1 + len1);
  let i = 0;
  let j = base2;
  let k = base1;
  while (i < len1 && j < hi) {
    yield compare(k, j);
    if (left[i] <= a[j]) yield* write(a, k++, left[i++]);
    else yield* write(a, k++, a[j++]);
  }
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

export const algorithms = [
  {
    key: 'bubble',
    category: 'Simple — O(n²)',
    name: 'Bubble Sort',
    tooltip: 'O(n²) — compares adjacent elements and swaps if out of order',
    gen: bubble,
    docs: {
      description:
        'A simple comparison sort. It repeatedly steps through the list, compares adjacent elements, and swaps them if they are in the wrong order, so larger elements "bubble" toward the end on each pass. With an early-exit check, a list that is already sorted finishes in a single pass.',
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
    category: 'Simple — O(n²)',
    name: 'Insertion Sort',
    tooltip: 'O(n²) — builds the sorted list one element at a time',
    gen: insertion,
    docs: {
      description:
        'Builds the final sorted array one item at a time. Each new element is compared backwards into the already-sorted prefix and shifted into place. It is efficient on small or nearly-sorted data, stable, adaptive, and sorts in place.',
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
    category: 'Simple — O(n²)',
    name: 'Selection Sort',
    tooltip: 'O(n²) — repeatedly selects the minimum element',
    gen: selection,
    docs: {
      description:
        'Splits the array into a sorted prefix and an unsorted remainder. Each pass scans the remainder for its minimum and swaps it to the front of the unsorted part. Because it always scans the whole remainder, its best and worst cases are identical — it never benefits from existing order.',
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
    key: 'cocktail',
    category: 'Optimized Variants',
    name: 'Cocktail Shaker Sort',
    tooltip: 'O(n²) — bidirectional bubble sort',
    gen: cocktail,
    docs: {
      description:
        'A bidirectional variation of bubble sort. Each round bubbles the largest element to the right end and then the smallest element back to the left end. Sweeping both ways clears small values stranded near the end ("turtles") faster than plain bubble sort.',
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
        for i in range(hi, lo, -1):
            if result[i - 1] > result[i]:
                result[i - 1], result[i] = result[i], result[i - 1]
                swapped = True
        lo += 1

    return result`,
    },
  },
  {
    key: 'comb',
    category: 'Optimized Variants',
    name: 'Comb Sort',
    tooltip: 'O(n²) worst — bubble sort with shrinking gap',
    gen: comb,
    docs: {
      description:
        'Improves on bubble sort by comparing elements a large gap apart and shrinking the gap by a factor of about 1.3 each pass until it reaches one. The wide early gaps move small values out of the tail quickly, eliminating bubble sort’s "turtle" problem.',
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
    category: 'Optimized Variants',
    name: 'Shell Sort',
    tooltip: 'O(n log²n) — gapped insertion sort',
    gen: shell,
    docs: {
      description:
        'A generalization of insertion sort that first sorts elements far apart, then progressively reduces the gap between compared elements. Moving items long distances early means that by the time the gap is one, the array is nearly sorted and the final insertion pass is cheap.',
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
    key: 'merge',
    category: 'Efficient — O(n log n)',
    name: 'Merge Sort',
    tooltip: 'O(n log n) — divides and merges sorted halves',
    gen: merge,
    docs: {
      description:
        'A stable divide-and-conquer sort. It splits the array in half, recursively sorts each half, then merges the two sorted halves back together. Performance is a guaranteed O(n log n) regardless of the input, at the cost of O(n) auxiliary space.',
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
    category: 'Efficient — O(n log n)',
    name: 'Quick Sort',
    tooltip: 'O(n log n) avg — partitions around a pivot',
    gen: quick,
    docs: {
      description:
        'A divide-and-conquer sort that picks a pivot and partitions the array so smaller elements come before it and larger ones after, then recurses on each side. Very fast on average and in place, but degrades to O(n²) when pivots split poorly (e.g. an already-sorted input with a last-element pivot).',
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
    category: 'Efficient — O(n log n)',
    name: 'Heap Sort',
    tooltip: 'O(n log n) — sorts via a binary max-heap',
    gen: heap,
    docs: {
      description:
        'Builds a binary max-heap from the array, then repeatedly swaps the largest element (the root) to the end and restores the heap over the shrinking front. It sorts in place with a guaranteed O(n log n) bound and no recursion.',
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
    key: 'tim',
    category: 'Optimized Variants',
    name: 'Tim Sort',
    tooltip: 'O(n log n) — insertion-sorted runs merged together',
    gen: tim,
    docs: {
      description:
        'A hybrid, stable sort — the standard library sort in Python and Java. It finds naturally ordered "runs" in the data, pads short runs to a minimum length with binary insertion sort, then merges runs off a stack while maintaining size invariants that keep merges balanced. It is adaptive: existing order in the input makes it approach O(n).',
      steps: [
        'Compute a minimum run length from the array size.',
        'Scan for the next natural run, reversing it if it descends.',
        'Pad runs shorter than minrun using binary insertion sort.',
        'Push each run on a stack and merge while size invariants are violated.',
        'Force-merge the remaining runs into one sorted array.',
      ],
      complexity: { best: 'O(n)', worst: 'O(n log n)', average: 'O(n log n)', space: 'O(n)' },
      code: `MIN_MERGE = 32

def tim_sort(arr: list[int]) -> list[int]:
    """Timsort: detect runs, pad to minrun, merge under size invariants."""
    result = arr.copy()
    n = len(result)
    if n < 2:
        return result

    min_run = min_run_length(n)
    runs = []  # stack of (base, length)
    low = 0
    while low < n:
        run_len = count_run_and_make_ascending(result, low, n)
        if run_len < min_run:
            force = min(n - low, min_run)
            binary_insertion_sort(result, low, low + force, low + run_len)
            run_len = force
        runs.append((low, run_len))
        merge_collapse(result, runs)
        low += run_len

    merge_force_collapse(result, runs)
    return result

def min_run_length(n: int) -> int:
    r = 0
    while n >= MIN_MERGE:
        r |= n & 1
        n >>= 1
    return n + r`,
    },
  },
  {
    key: 'radix',
    category: 'Non-comparison',
    name: 'Radix Sort',
    tooltip: 'O(d × n) — sorts digit by digit',
    gen: radix,
    docs: {
      description:
        'A non-comparison sort for integers. It sorts numbers digit by digit from least to most significant, using a stable counting sort as the per-digit subroutine. Runs in O(d × n) where d is the number of digits, independent of the data’s order.',
      steps: [
        'Find the maximum value to learn the digit count.',
        'Starting at the ones place, bucket items by the current digit.',
        'Rebuild the array stably from the buckets.',
        'Advance to the next more significant digit.',
        'Repeat until all digit positions are processed.',
      ],
      complexity: { best: 'O(d × n)', worst: 'O(d × n)', average: 'O(d × n)', space: 'O(n + k)' },
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
    category: 'Non-comparison',
    name: 'Counting Sort',
    tooltip: 'O(n + k) — counts occurrences of each value',
    gen: counting,
    docs: {
      description:
        'A non-comparison sort for integers drawn from a small range. It tallies how many times each value occurs, turns those tallies into positions with a prefix sum, then writes each element straight to its slot. Runs in O(n + k) where k is the value range.',
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
    key: 'bogo',
    category: 'For fun',
    name: 'Bogo Sort',
    tooltip: 'O(n × n!) — shuffles until sorted (joke algorithm)',
    gen: bogo,
    docs: {
      description:
        'A deliberately terrible "generate and test" algorithm: shuffle the whole array at random, check if it happens to be sorted, and repeat. Expected work is O(n × n!), so it is only usable on a handful of elements — try it with a small array size.',
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

export const algorithmsByKey = Object.fromEntries(algorithms.map((a) => [a.key, a]));
