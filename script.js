let arraySize = 50;
let array = [];
let delay = 5;

let isRunning = false;
let isPaused = false;
let shouldStop = false;
let currentSortingAlgorithm = null;
let shuffleCount = 0;
let comparisons = 0;
let swaps = 0;
let startTime = 0;
let totalPausedTime = 0;
let pauseStartTime = 0;

function resetStats() {
  comparisons = 0;
  swaps = 0;
  shuffleCount = 0;
  startTime = Date.now();
  totalPausedTime = 0;
  pauseStartTime = 0;
  updateStats();
}

function updateStats(algorithm = currentSortingAlgorithm) {
  const statsPanel = document.getElementById('stats-panel');
  let timeElapsed = 0;
  
  if (startTime > 0) {
    let currentTime = Date.now();
    let effectivePausedTime = totalPausedTime;
    if (isPaused && pauseStartTime > 0) {
      effectivePausedTime += (currentTime - pauseStartTime);
    }
    timeElapsed = ((currentTime - startTime - effectivePausedTime) / 1000).toFixed(2);
  }

  if (algorithm === 'bogo') {
    statsPanel.innerHTML = `
      <h3>Sorting Statistics</h3>
      <p>Shuffle Count: <span id="shuffleCount">${shuffleCount}</span></p>
      <p>Time Elapsed: <span id="timeElapsed">${timeElapsed}</span>s</p>
    `;
  } else {
    statsPanel.innerHTML = `
      <h3>Sorting Statistics</h3>
      <p>Comparisons: <span id="comparisons">${comparisons}</span></p>
      <p>Swaps: <span id="swaps">${swaps}</span></p>
      <p>Time Elapsed: <span id="timeElapsed">${timeElapsed}</span>s</p>
    `;
  }
}

document.getElementById("startBox").value = arraySize;

function updateSize() {
  const newSize = parseInt(document.getElementById("startBox").value);
  if (isNaN(newSize) || newSize < 3 || newSize > 500) {
    alert("Please enter a valid array size between 3 and 500");
    return;
  }

  arraySize = newSize;
  initializeArray();
}

function togglePause() {
  isPaused = !isPaused;
  const pauseButton = document.getElementById('pauseButton');
  if (isPaused) {
    pauseStartTime = Date.now();
    pauseButton.innerHTML = '<i class="fas fa-play"></i>';
    pauseButton.style.backgroundColor = 'var(--elephant-success)';
  } else {
    if (pauseStartTime > 0) {
      totalPausedTime += (Date.now() - pauseStartTime);
      pauseStartTime = 0;
    }
    pauseButton.innerHTML = '<i class="fas fa-pause"></i>';
    pauseButton.style.backgroundColor = 'var(--elephant-danger)';
  }
}

function updateDelay() {
  const speed = document.getElementById('speedControl').value;
  delay = 50 - speed;
}

function disableControls(disable) {
  const buttons = document.querySelectorAll('button:not(#pauseButton):not(#stopButton)');
  buttons.forEach(button => button.disabled = disable);
}

function handleKeyPress(event) {
  if (event.key === 'Enter') {
    event.preventDefault();
    updateSize();
  }
}

async function radixSort() {
  resetStats();
  const getMax = (arr) => Math.max(...arr);
  const countingSort = async (exp) => {
    const output = new Array(array.length).fill(0);
    const count = new Array(10).fill(0);

    for (let i = 0; i < array.length; i++) {
      count[Math.floor(array[i] / exp) % 10]++;
      comparisons++;
    }

    for (let i = 1; i < 10; i++) {
      count[i] += count[i - 1];
    }

    for (let i = array.length - 1; i >= 0; i--) {
      output[count[Math.floor(array[i] / exp) % 10] - 1] = array[i];
      count[Math.floor(array[i] / exp) % 10]--;
      swaps++;
    }

    for (let i = 0; i < array.length; i++) {
      while (isPaused) await sleep(100);
      array[i] = output[i];
      updateBars();
      updateStats();
      await sleep(delay);
    }
  }

  const max = getMax(array);
  for (let exp = 1; Math.floor(max / exp) > 0; exp *= 10) {
    await countingSort(exp);
  }
}

function renderArray() {
  const container = document.getElementById('array-container');
  container.innerHTML = '';
  const containerWidth = container.clientWidth - 32;
  let containerHeight = container.clientHeight - 32;
  
  // Ensure minimum height on mobile
  if (containerHeight < 200) {
    containerHeight = 350;
  }
  
  const barWidth = containerWidth / arraySize;
  const heightScale = containerHeight / arraySize;
  
  array.forEach(value => {
    const bar = document.createElement('div');
    bar.classList.add('bar');
    bar.style.width = `${barWidth}px`;
    bar.style.height = `${value * heightScale}px`;
    bar.style.margin = '0';
    container.appendChild(bar);
  });
}

function updateBars() {
  const container = document.getElementById('array-container');
  const bars = container.getElementsByClassName('bar');
  let containerHeight = container.clientHeight - 32;
  
  if (containerHeight < 200) {
    containerHeight = 350;
  }
  
  const heightScale = containerHeight / arraySize;
  for (let i = 0; i < arraySize; i++) {
    bars[i].style.height = `${array[i] * heightScale}px`;
  }
}

function highlightRange(start, end) {
  const bars = document.getElementById('array-container').getElementsByClassName('bar');
  for (let i = 0; i < bars.length; i++) {
    bars[i].classList.remove('range-highlight', 'range-dim');
    if (i >= start && i <= end) {
      bars[i].classList.add('range-highlight');
    } else {
      bars[i].classList.add('range-dim');
    }
  }
}

function clearRangeHighlight() {
  const bars = document.getElementById('array-container').getElementsByClassName('bar');
  for (let i = 0; i < bars.length; i++) {
    bars[i].classList.remove('range-highlight', 'range-dim', 'pivot-highlight');
  }
}

function highlightPivot(index) {
  const bars = document.getElementById('array-container').getElementsByClassName('bar');
  if (index >= 0 && index < bars.length) {
    bars[index].classList.add('pivot-highlight');
  }
}


function initializeArray() {
  array = Array.from({ length: arraySize }, (_, i) => i + 1);
  shuffleArray(array);
  renderArray();
}

function setPresetArray(presetArray) {
  array = presetArray.slice();
  arraySize = array.length;
  document.getElementById("startBox").value = arraySize;
  renderArray();
}

function swapBars(i, j) {
  [array[i], array[j]] = [array[j], array[i]];
  updateBars();
}

function highlightBars(i, j) {
  const bars = document.getElementById('array-container').getElementsByClassName('bar');
  const highlightStyle = 'linear-gradient(180deg, #d4b896 0%, #c9a67a 50%, #b8956a 100%)';

  bars[i].style.background = highlightStyle;
  bars[i].style.boxShadow = '0 0 8px rgba(212, 184, 150, 0.6)';
  if (j !== undefined) {
    bars[j].style.background = highlightStyle;
    bars[j].style.boxShadow = '0 0 8px rgba(212, 184, 150, 0.6)';
  }

  setTimeout(() => {
    bars[i].style.background = '';
    bars[i].style.boxShadow = '';
    if (j !== undefined) {
      bars[j].style.background = '';
      bars[j].style.boxShadow = '';
    }
  }, delay);
}

async function sleep(ms) {
  if (shouldStop) {
    throw new Error('Sorting stopped');
  }
  while (isPaused && !shouldStop) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (shouldStop) {
    throw new Error('Sorting stopped');
  }
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function bubbleSort() {
  resetStats();
  for (let i = 0; i < array.length - 1; i++) {
    for (let j = 0; j < array.length - i - 1; j++) {
      while (isPaused) await sleep(100);
      highlightBars(j, j + 1);
      await sleep(delay / 2);
      comparisons++;

      if (array[j] > array[j + 1]) {
        swapBars(j, j + 1);
        swaps++;
        await sleep(delay / 2);
      }
      updateStats();
    }
  }
}

async function insertionSort() {
  resetStats();
  for (let i = 1; i < array.length; i++) {
    while (isPaused) await sleep(100);
    let key = array[i];
    let j = i - 1;

    while (j >= 0) {
      highlightBars(j, j + 1);
      await sleep(delay / 2);
      comparisons++;

      if (array[j] > key) {
        array[j + 1] = array[j];
        swaps++;
        j--;
        updateBars();
        await sleep(delay / 2);
      } else {
        break;
      }
      updateStats();
    }
    array[j + 1] = key;
    swaps++;
    updateBars();
    updateStats();
  }
}

async function selectionSort() {
  resetStats();
  for (let i = 0; i < array.length; i++) {
    let minIndex = i;
    for (let j = i + 1; j < array.length; j++) {
      while (isPaused) await sleep(100);
      highlightBars(j, minIndex);
      await sleep(delay / 2);
      comparisons++;
      if (array[j] < array[minIndex]) {
        minIndex = j;
      }
      updateStats();
    }
    if (minIndex !== i) {
      swapBars(i, minIndex);
      swaps++;
      updateStats();
      await sleep(delay);
    }
  }
}

async function mergeSort(start = 0, end = array.length) {
  if (start === 0 && end === array.length) resetStats();
  if (end - start < 2) return;
  while (isPaused) await sleep(100);
  
  highlightRange(start, end - 1);
  
  const mid = Math.floor((start + end) / 2);
  await mergeSort(start, mid);
  await mergeSort(mid, end);

  highlightRange(start, end - 1);

  let tempArray = [];
  let leftIndex = start;
  let rightIndex = mid;

  while (leftIndex < mid && rightIndex < end) {
    while (isPaused) await sleep(100);
    highlightBars(leftIndex, rightIndex);
    await sleep(delay / 2);
    comparisons++;
    updateStats();

    if (array[leftIndex] <= array[rightIndex]) {
      tempArray.push(array[leftIndex++]);
    } else {
      tempArray.push(array[rightIndex++]);
      swaps++;
    }
    updateStats();
  }

  while (leftIndex < mid) tempArray.push(array[leftIndex++]);
  while (rightIndex < end) tempArray.push(array[rightIndex++]);

  for (let i = start; i < end; i++) {
    while (isPaused) await sleep(100);
    array[i] = tempArray[i - start];
    updateBars();
    highlightRange(start, end - 1);
    await sleep(delay / 3);
  }
  
  if (start === 0 && end === array.length) {
    clearRangeHighlight();
  }
}

async function quickSort(start = 0, end = array.length - 1) {
  if (start === 0 && end === array.length - 1) resetStats();
  if (start >= end) {
    if (start === 0 && end === array.length - 1) {
      clearRangeHighlight();
    }
    return;
  }
  while (isPaused) await sleep(100);
  
  highlightRange(start, end);
  
  const pivotIndex = await partition(start, end);
  await quickSort(start, pivotIndex - 1);
  await quickSort(pivotIndex + 1, end);
  
  if (start === 0 && end === array.length - 1) {
    clearRangeHighlight();
  }
}

async function partition(start, end) {
  const pivot = array[end];
  let i = start - 1;
  
  highlightRange(start, end);
  highlightPivot(end);

  for (let j = start; j < end; j++) {
    while (isPaused) await sleep(100);
    
    clearPivotHighlight();
    highlightRange(start, end);
    highlightPivot(end);
    
    await sleep(delay / 2);
    comparisons++;
    updateStats();

    if (array[j] <= pivot) {
      i++;
      swapBars(i, j);
      swaps++;
      updateStats();
      
      clearPivotHighlight();
      highlightRange(start, end);
      highlightPivot(end);
      
      await sleep(delay / 2);
    }
  }
  
  clearPivotHighlight();
  swapBars(i + 1, end);
  swaps++;
  updateStats();
  
  highlightRange(start, end);
  highlightPivot(i + 1);
  await sleep(delay);
  
  return i + 1;
}

function clearPivotHighlight() {
  const bars = document.getElementById('array-container').getElementsByClassName('bar');
  for (let i = 0; i < bars.length; i++) {
    bars[i].classList.remove('pivot-highlight');
  }
}

function isSorted(arr) {
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] < arr[i - 1]) {
      return false;
    }
  }
  return true;
}

async function bogoSort() {
  resetStats();
  while (!isSorted(array) && !shouldStop) {
    while (isPaused && !shouldStop) await sleep(100);
    if (shouldStop) break;

    shuffleArray(array);
    shuffleCount++;
    updateStats();
    const speedValue = parseInt(document.getElementById('speedControl').value);
    const bogoDelay = 500 - ((speedValue + 100) / 150) * 490;
    await sleep(Math.max(Math.round(bogoDelay), 50));
    updateBars();
  }
}

async function hybridAdaptiveSort(start = 0, end = array.length) {
  if (end - start < 2) return;
  while (isPaused) await sleep(100);

  const mid = Math.floor((start + end) / 2);
  await hybridAdaptiveSort(start, mid);
  await hybridAdaptiveSort(mid, end);

  let leftIndex = start;
  let rightIndex = mid;
  let tempArray = [];

  while (leftIndex < mid && rightIndex < end) {
    while (isPaused) await sleep(100);
    highlightBars(leftIndex, rightIndex);
    await sleep(delay / 2);

    if (array[leftIndex] <= array[rightIndex]) {
      tempArray.push(array[leftIndex++]);
    } else {
      tempArray.push(array[rightIndex++]);
    }
  }

  while (leftIndex < mid) tempArray.push(array[leftIndex++]);
  while (rightIndex < end) tempArray.push(array[rightIndex++]);

  for (let i = start; i < end; i++) {
    while (isPaused) await sleep(100);
    array[i] = tempArray[i - start];
    updateBars();
    await sleep(delay / 3);
  }
}

function shuffleArray(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function stopSort() {
  shouldStop = true;
  isRunning = false;
  isPaused = false;
  const pauseButton = document.getElementById('pauseButton');
  pauseButton.innerHTML = '<i class="fas fa-pause"></i>';
  pauseButton.style.backgroundColor = 'var(--elephant-danger)';
  disableControls(false);
}

async function startSort(algorithm) {
  if (isRunning) return;
  isRunning = true;
  shouldStop = false;
  disableControls(true);
  try {
    let counterDisplay = document.getElementById('counter');
    counterDisplay.style.opacity = '0'

    currentSortingAlgorithm = algorithm;
    switch (algorithm) {
      case 'hybrid': await hybridAdaptiveSort(); break;
      case 'bubble': await bubbleSort(); break;
      case 'insertion': await insertionSort(); break;
      case 'selection': await selectionSort(); break;
      case 'merge': await mergeSort(); break;
      case 'quick': await quickSort(); break;
      case 'radix': await radixSort(); break;
      case 'bogo': await bogoSort(); break;
    }
  } catch (error) {
    console.error('Sorting error:', error);
  } finally {
    isRunning = false;
    shouldStop = false;
    disableControls(false);
    isPaused = false;
    clearRangeHighlight();
    const pauseButton = document.getElementById('pauseButton');
    pauseButton.innerHTML = '<i class="fas fa-pause"></i>';
    pauseButton.style.backgroundColor = 'var(--elephant-danger)';
  }
}

function openModal() {
  const modal = document.getElementById('algorithmModal');
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('algorithmModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

document.querySelectorAll('.sidebar-item').forEach(item => {
  item.addEventListener('click', function() {
    document.querySelectorAll('.sidebar-item').forEach(i => i.classList.remove('active'));
    this.classList.add('active');
    
    const algorithm = this.dataset.algorithm;
    const section = document.getElementById(`section-${algorithm}`);
    
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });
});

const modalContent = document.getElementById('modalContent');
if (modalContent) {
  modalContent.addEventListener('scroll', function() {
    const sections = document.querySelectorAll('.algorithm-section');
    const scrollPos = this.scrollTop + 150;
    
    let currentSection = null;
    sections.forEach(section => {
      if (section.offsetTop <= scrollPos) {
        currentSection = section.id.replace('section-', '');
      }
    });
    
    if (currentSection) {
      document.querySelectorAll('.sidebar-item').forEach(item => {
        item.classList.remove('active');
        if (item.dataset.algorithm === currentSection) {
          item.classList.add('active');
        }
      });
    }
  });
}

document.getElementById('algorithmModal').addEventListener('click', function(e) {
  if (e.target === this) {
    closeModal();
  }
});

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    closeModal();
  }
});

function generateBestCaseArray(algorithm, size = 30) {
  switch (algorithm) {
    case 'bubble':
    case 'insertion':
    case 'bogo':
      return Array.from({ length: size }, (_, i) => i + 1);
    case 'selection':
    case 'merge':
    case 'radix':
      return Array.from({ length: size }, (_, i) => i + 1);
    case 'quick':
      const arr = Array.from({ length: size }, (_, i) => i + 1);
      const mid = Math.floor(size / 2);
      [arr[mid], arr[size - 1]] = [arr[size - 1], arr[mid]];
      return arr;
    default:
      return Array.from({ length: size }, (_, i) => i + 1);
  }
}

function generateWorstCaseArray(algorithm, size = 30) {
  switch (algorithm) {
    case 'bubble':
    case 'insertion':
      return Array.from({ length: size }, (_, i) => size - i);
    case 'selection':
      return Array.from({ length: size }, (_, i) => size - i);
    case 'merge':
    case 'radix':
      return Array.from({ length: size }, (_, i) => size - i);
    case 'quick':
      return Array.from({ length: size }, (_, i) => i + 1);
    case 'bogo':
      const arr = Array.from({ length: Math.min(size, 6) }, (_, i) => i + 1);
      shuffleArray(arr);
      return arr;
    default:
      return Array.from({ length: size }, (_, i) => size - i);
  }
}

function generateRandomArray(algorithm, size = 30) {
  const arr = Array.from({ length: size }, (_, i) => i + 1);
  shuffleArray(arr);
  return arr;
}

function runPresetCase(algorithm, caseType) {
  if (isRunning) {
    stopSort();
    setTimeout(() => runPresetCase(algorithm, caseType), 100);
    return;
  }
  
  const size = algorithm === 'bogo' ? 6 : 30;
  let presetArray;
  
  if (caseType === 'best') {
    presetArray = generateBestCaseArray(algorithm, size);
  } else if (caseType === 'worst') {
    presetArray = generateWorstCaseArray(algorithm, size);
  } else {
    presetArray = generateRandomArray(algorithm, size);
  }
  
  setPresetArray(presetArray);
  closeModal();
  
  setTimeout(() => {
    startSort(algorithm);
  }, 300);
}

window.onload = initializeArray;
