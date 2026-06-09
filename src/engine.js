// Records a sorting generator's full op stream up front, then exposes a
// reversible playback cursor over it. Because every op is invertible, the UI
// gets step-forward, step-back, scrub-to-any-point, and auto-play for free,
// all sharing one consistent counter of comparisons / writes.

export const DEFAULT_CAP = 500000; // safety bound so recording always terminates

export function createEngine() {
  let ops = [];
  let initial = []; // array state before sorting began
  let array = []; // current working state at `cursor`
  let cursor = 0; // number of ops applied so far
  let comparisons = 0;
  let writes = 0;
  let shuffles = 0;
  let sorted = new Set(); // indices finalized via markSorted
  let truncated = false;
  let activeCap = DEFAULT_CAP;

  // Run `gen(workingCopy)` to completion, capturing every op.
  function record(genFactory, inputArray, operationCap = DEFAULT_CAP) {
    const work = inputArray.slice();
    ops = [];
    truncated = false;
    activeCap = operationCap;
    for (const op of genFactory(work)) {
      ops.push(op);
      if (ops.length >= operationCap) {
        truncated = true;
        break;
      }
    }
    initial = inputArray.slice();
    reset();
  }

  function reset() {
    array = initial.slice();
    cursor = 0;
    comparisons = 0;
    writes = 0;
    shuffles = 0;
    sorted = new Set();
  }

  function applyForward(op) {
    switch (op.type) {
      case 'compare':
        comparisons++;
        break;
      case 'swap': {
        const [i, j] = op.indices;
        [array[i], array[j]] = [array[j], array[i]];
        writes += 2;
        break;
      }
      case 'overwrite':
        array[op.index] = op.value;
        writes++;
        break;
      case 'setArray':
        array = op.value.slice();
        shuffles++;
        break;
      case 'markSorted':
        for (const i of op.indices) sorted.add(i);
        break;
      // pivot is purely visual — nothing to apply.
    }
  }

  function applyBackward(op) {
    switch (op.type) {
      case 'compare':
        comparisons--;
        break;
      case 'swap': {
        const [i, j] = op.indices;
        [array[i], array[j]] = [array[j], array[i]];
        writes -= 2;
        break;
      }
      case 'overwrite':
        array[op.index] = op.prev;
        writes--;
        break;
      case 'setArray':
        array = op.prev.slice();
        shuffles--;
        break;
      case 'markSorted':
        for (const i of op.indices) sorted.delete(i);
        break;
    }
  }

  function stepForward() {
    if (cursor >= ops.length) return false;
    applyForward(ops[cursor]);
    cursor++;
    return true;
  }

  function stepBackward() {
    if (cursor <= 0) return false;
    cursor--;
    applyBackward(ops[cursor]);
    return true;
  }

  // Move the cursor to an absolute op index (used by the scrub bar).
  function seek(target) {
    const clamped = Math.max(0, Math.min(target, ops.length));
    while (cursor < clamped) stepForward();
    while (cursor > clamped) stepBackward();
  }

  // The op most recently applied — drives the transient highlight colors.
  function currentOp() {
    return cursor > 0 ? ops[cursor - 1] : null;
  }

  return {
    record,
    reset,
    stepForward,
    stepBackward,
    seek,
    currentOp,
    get array() {
      return array;
    },
    get sorted() {
      return sorted;
    },
    get cursor() {
      return cursor;
    },
    get total() {
      return ops.length;
    },
    get done() {
      return cursor >= ops.length;
    },
    get truncated() {
      return truncated;
    },
    get cap() {
      return activeCap;
    },
    get stats() {
      return { comparisons, writes, shuffles };
    },
  };
}
