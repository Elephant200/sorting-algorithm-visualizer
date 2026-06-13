// Renders the array as bars and paints per-frame color states from the engine.
// Bar elements are created once per array and reused; only heights, classes,
// and a per-bar `--bar-color` custom property change each frame. Each bar's
// base color is mapped from its value (deep sand for small values, bright sand
// for large), so a sorted array reads as a smooth luminance ramp and misplaced
// values stand out. Stats are written into cached <span> nodes (no innerHTML
// rebuilds).

export const SMOOTH_MAX_BARS = 200; // height transitions get janky beyond this

export function createRenderer({ container, stats }) {
  let bars = [];
  let heightCache = [];
  let classCache = [];
  let colorCache = [];
  let statCache = {};
  let cachedHeight = 0;
  let cachedWidth = 0;
  let maxValue = 1;
  let smoothPlayback = false;

  function measure() {
    const styles = getComputedStyle(container);
    const padX = parseFloat(styles.paddingLeft) + parseFloat(styles.paddingRight);
    const padY = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom);
    cachedWidth = container.clientWidth - padX;
    cachedHeight = container.clientHeight - padY;
  }

  // Rebuild bar elements for a new array (length or identity change).
  function setArray(array) {
    container.innerHTML = '';
    const frag = document.createDocumentFragment();
    bars = array.map(() => {
      const bar = document.createElement('div');
      bar.className = 'bar';
      frag.appendChild(bar);
      return bar;
    });
    container.appendChild(frag);
    heightCache = new Array(array.length).fill('');
    classCache = new Array(array.length).fill('');
    colorCache = new Array(array.length).fill('');
    maxValue = Math.max(...array, 1);
    measure();
    applyWidths(array.length);
    updateSmoothing();
    drawHeights(array);
  }

  function applyWidths(n) {
    const gap = n > 60 ? 0 : Math.min(3, Math.floor(cachedWidth / n / 6));
    const barWidth = (cachedWidth - gap * (n - 1)) / n;
    for (let i = 0; i < n; i++) {
      bars[i].style.width = `${barWidth}px`;
      bars[i].style.marginRight = i < n - 1 ? `${gap}px` : '0';
    }
  }

  function drawHeights(array) {
    const scale = cachedHeight / maxValue;
    for (let i = 0; i < array.length; i++) {
      setBarHeight(i, array[i], scale);
    }
  }

  function setBarHeight(i, value, scale) {
    const height = `${Math.max(2, value * scale)}px`;
    if (heightCache[i] !== height) {
      bars[i].style.height = height;
      heightCache[i] = height;
    }
    setBarColor(i, value);
  }

  // Map a value onto the sand palette: deep muted brown -> bright warm cream.
  function setBarColor(i, value) {
    const t = value / maxValue;
    const color = `hsl(${(32 + t * 8).toFixed(1)} ${(34 + t * 26).toFixed(1)}% ${(42 + t * 28).toFixed(1)}%)`;
    if (colorCache[i] !== color) {
      bars[i].style.setProperty('--bar-color', color);
      colorCache[i] = color;
    }
  }

  function setBarClass(i, cls) {
    if (classCache[i] !== cls) {
      bars[i].className = cls;
      classCache[i] = cls;
    }
  }

  // Height transitions look great while stepping or at one-op-per-frame
  // speeds, but turn to mush when frames batch many ops or bars get thin.
  function setSmooth(on) {
    smoothPlayback = on;
    updateSmoothing();
  }

  function updateSmoothing() {
    container.classList.toggle('smooth', smoothPlayback && bars.length <= SMOOTH_MAX_BARS);
  }

  // Re-measure and re-apply widths/heights on container resize.
  function relayout(array) {
    if (bars.length !== array.length) return;
    measure();
    applyWidths(array.length);
    drawHeights(array);
  }

  // Paint the frame: transient highlights from the most recent op, plus the
  // persistent pivot and sorted sets. Priority (high to low): sorted, swap,
  // write, pivot, compare — so a pivot being compared against stays teal.
  function frame(array, sorted, pivots, op) {
    const scale = cachedHeight / maxValue;
    let compareSet = null;
    let swapSet = null;
    let writeIdx = -1;

    if (op) {
      if (op.type === 'compare') compareSet = op.indices;
      else if (op.type === 'swap') swapSet = op.indices;
      else if (op.type === 'overwrite') writeIdx = op.index;
    }

    for (let i = 0; i < array.length; i++) {
      setBarHeight(i, array[i], scale);
      let cls = 'bar';
      if (sorted.has(i)) cls += ' sorted';
      else if (swapSet && swapSet.includes(i)) cls += ' swapping';
      else if (writeIdx === i) cls += ' writing';
      else if (pivots.has(i)) cls += ' pivot';
      else if (compareSet && compareSet.includes(i)) cls += ' comparing';
      setBarClass(i, cls);
    }
  }

  function clearHighlights(array, sorted) {
    for (let i = 0; i < array.length; i++) {
      setBarClass(i, sorted.has(i) ? 'bar sorted' : 'bar');
    }
  }

  function setStats({ comparisons, writes, shuffles }, timeSec, isBogo) {
    stats.panel.classList.toggle('is-bogo', !!isBogo);
    setStat('comparisons', stats.comparisons, comparisons.toLocaleString());
    setStat('writes', stats.writes, writes.toLocaleString());
    setStat('shuffles', stats.shuffles, shuffles.toLocaleString());
    setStat('time', stats.time, timeSec.toFixed(2));
  }

  function setStat(key, node, value) {
    if (statCache[key] !== value) {
      node.textContent = value;
      statCache[key] = value;
    }
  }

  return { setArray, relayout, frame, clearHighlights, drawHeights, setStats, setSmooth };
}
