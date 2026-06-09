// Renders the array as bars and paints per-frame color states from the engine.
// Bar elements are created once per array and reused; only heights and classes
// change each frame. Stats are written into cached <span> nodes (no innerHTML
// rebuilds).

export function createRenderer({ container, stats }) {
  let bars = [];
  let heightCache = [];
  let classCache = [];
  let statCache = {};
  let cachedHeight = 0;
  let cachedWidth = 0;
  let maxValue = 1;

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
    maxValue = Math.max(...array, 1);
    measure();
    applyWidths(array.length);
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
  }

  function setBarClass(i, cls) {
    if (classCache[i] !== cls) {
      bars[i].className = cls;
      classCache[i] = cls;
    }
  }

  // Re-measure and re-apply widths/heights on container resize.
  function relayout(array) {
    if (bars.length !== array.length) return;
    measure();
    applyWidths(array.length);
    drawHeights(array);
  }

  // Translate the most recent op into transient highlight classes.
  function frame(array, sorted, op) {
    const scale = cachedHeight / maxValue;
    let compareSet = null;
    let swapSet = null;
    let pivotIdx = -1;

    if (op) {
      if (op.type === 'compare') compareSet = op.indices;
      else if (op.type === 'swap') swapSet = op.indices;
      else if (op.type === 'overwrite') swapSet = [op.index];
      else if (op.type === 'pivot') pivotIdx = op.index;
    }

    for (let i = 0; i < array.length; i++) {
      setBarHeight(i, array[i], scale);
      let cls = 'bar';
      if (sorted.has(i)) cls += ' sorted';
      else if (pivotIdx === i) cls += ' pivot';
      else if (swapSet && swapSet.includes(i)) cls += ' swapping';
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

  return { setArray, relayout, frame, clearHighlights, drawHeights, setStats };
}
