// Builds the algorithm toolbar and the docs modal from the algorithms registry,
// so adding an algorithm is a single registry entry. Also provides a small
// Python syntax highlighter for the code blocks.

import { algorithms } from './algorithms.js';

const MAIN_ALGORITHMS = new Set(['bubble', 'insertion', 'selection', 'merge', 'quick', 'heap']);
let tooltipsReady = false;

const PY_KEYWORDS = new Set([
  'def', 'return', 'for', 'while', 'if', 'elif', 'else', 'in', 'and', 'or',
  'not', 'break', 'continue', 'import', 'from', 'as', 'None', 'True', 'False',
  'pass', 'is', 'lambda', 'with', 'yield', 'class',
]);

const PY_BUILTINS = new Set([
  'len', 'range', 'max', 'min', 'list', 'int', 'bool', 'str', 'float', 'print',
  'enumerate', 'abs', 'sorted', 'reversed', 'all', 'any',
]);

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

function escapeAttr(text) {
  return escapeHtml(text).replace(/"/g, '&quot;');
}

export function highlightPython(code) {
  const token =
    /(#[^\n]*)|("""[\s\S]*?"""|'''[\s\S]*?'''|"[^"\n]*"|'[^'\n]*')|(\b\d+\b)|([A-Za-z_]\w*)/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = token.exec(code))) {
    out += escapeHtml(code.slice(last, m.index));
    last = token.lastIndex;
    if (m[1]) out += `<span class="comment">${escapeHtml(m[1])}</span>`;
    else if (m[2]) out += `<span class="string">${escapeHtml(m[2])}</span>`;
    else if (m[3]) out += `<span class="number">${m[3]}</span>`;
    else if (PY_KEYWORDS.has(m[4])) out += `<span class="keyword">${m[4]}</span>`;
    else if (PY_BUILTINS.has(m[4])) out += `<span class="function">${m[4]}</span>`;
    else out += m[4];
  }
  out += escapeHtml(code.slice(last));
  return out;
}

function setupFloatingTooltips() {
  if (tooltipsReady) return;
  tooltipsReady = true;

  const tip = document.createElement('div');
  tip.className = 'floating-tooltip';
  document.body.appendChild(tip);

  const show = (target) => {
    const text = target?.dataset?.tooltip;
    if (!text) return;
    tip.textContent = text;
    tip.classList.add('active');
    const rect = target.getBoundingClientRect();
    const tipRect = tip.getBoundingClientRect();
    const x = Math.min(
      window.innerWidth - tipRect.width - 12,
      Math.max(12, rect.left + rect.width / 2 - tipRect.width / 2)
    );
    const y = Math.max(12, rect.top - tipRect.height - 10);
    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  };

  const hide = () => {
    tip.classList.remove('active');
  };

  document.addEventListener('pointerover', (e) => show(e.target.closest?.('[data-tooltip]')));
  document.addEventListener('pointerout', (e) => {
    if (e.target.closest?.('[data-tooltip]')) hide();
  });
  document.addEventListener('focusin', (e) => show(e.target.closest?.('[data-tooltip]')));
  document.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, true);
  window.addEventListener('resize', hide);
}

// --- toolbar -----------------------------------------------------------------

// Preserve registry order while collecting each category's algorithms.
function groupByCategory(list) {
  const groups = new Map();
  for (const algo of list) {
    if (!groups.has(algo.category)) groups.set(algo.category, []);
    groups.get(algo.category).push(algo);
  }
  return [...groups];
}

function flattenGroups(groups) {
  return groups.flatMap(([, items]) => items);
}

export function buildAlgorithmButtons(container, onSelect) {
  setupFloatingTooltips();
  container.innerHTML = '';
  const mainAlgorithms = algorithms.filter((algo) => MAIN_ALGORITHMS.has(algo.key));
  const moreAlgorithms = algorithms.filter((algo) => !MAIN_ALGORITHMS.has(algo.key));

  const makeAlgorithmButton = (algo) => {
    const button = document.createElement('button');
    button.className = 'algo-button tooltip';
    button.textContent = algo.name.replace(/ Sort$/, '');
    button.dataset.tooltip = algo.tooltip;
    button.dataset.algorithm = algo.key;
    button.addEventListener('click', () => onSelect(algo.key));
    return button;
  };

  const appendGroups = (parent, list) => {
    for (const [category, items] of groupByCategory(list)) {
      const group = document.createElement('div');
      group.className = 'algo-group';

      const label = document.createElement('span');
      label.className = 'algo-group-label';
      label.textContent = category;
      group.appendChild(label);

      const chips = document.createElement('div');
      chips.className = 'algo-chips';
      for (const algo of items) {
        chips.appendChild(makeAlgorithmButton(algo));
      }
      group.appendChild(chips);
      parent.appendChild(group);
    }
  };

  appendGroups(container, mainAlgorithms);

  const toggle = document.createElement('button');
  toggle.className = 'more-toggle tooltip';
  toggle.type = 'button';
  toggle.setAttribute('aria-expanded', 'false');
  toggle.setAttribute('aria-controls', 'more-algorithms-panel');
  toggle.setAttribute('aria-label', 'Show more algorithms');
  toggle.dataset.tooltip = 'Show more algorithms';
  toggle.innerHTML = '<i class="fas fa-plus" aria-hidden="true"></i>';
  container.appendChild(toggle);

  const moreContent = document.createElement('div');
  moreContent.className = 'more-algorithms-content';
  moreContent.id = 'more-algorithms-panel';
  appendGroups(moreContent, moreAlgorithms);
  container.appendChild(moreContent);

  toggle.addEventListener('click', () => {
    const open = !moreContent.classList.contains('open');
    moreContent.classList.toggle('open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Hide more algorithms' : 'Show more algorithms');
    toggle.dataset.tooltip = open ? 'Hide more algorithms' : 'Show more algorithms';
    const hasHiddenActive = !!moreContent.querySelector('.algo-button.active');
    toggle.classList.toggle('active', !open && hasHiddenActive);
  });
}

// --- docs modal --------------------------------------------------------------

function briefPhrase(algo) {
  return algo.tooltip.replace(/^.*?—\s*/, '');
}

function complexitiesMatch(algo) {
  const { best, average, worst } = algo.docs.complexity;
  return best === average && average === worst;
}

function runnableCase(algo, caseType) {
  return complexitiesMatch(algo) ? 'random' : caseType;
}

function caseIsDisabled(algo, caseType) {
  return complexitiesMatch(algo) && caseType !== 'random';
}

function caseShape(algo, caseType) {
  if (complexitiesMatch(algo)) {
    if (caseType === 'best' || caseType === 'worst') {
      return 'No distinct best or worst case: this algorithm has the same time complexity for every input shape.';
    }
    return 'Random array. All input cases have the same time complexity for this algorithm.';
  }
  if (caseType === 'random') return 'Randomly shuffled array.';
  if (caseType === 'best') {
    if (algo.key === 'quick') return 'Balanced pivot setup: the median value is placed at the final pivot position.';
    return 'Already sorted ascending array.';
  }
  if (caseType === 'worst') {
    if (algo.key === 'quick') return 'Already sorted ascending array, which is poor for this last-element pivot quicksort.';
    if (algo.key === 'comb' || algo.key === 'shell') return 'Deterministic high-disorder shuffle selected to exercise this gap sequence heavily.';
    if (algo.key === 'tim') return 'Fragmented alternating high/low runs that prevent a single natural run.';
    if (algo.key === 'bogo') return 'Random array; bad luck can keep shuffling until the recording cap.';
    return 'Reverse-sorted descending array.';
  }
  return 'Randomly shuffled array.';
}

function caseButtonAttrs(algo, caseType) {
  const disabled = caseIsDisabled(algo, caseType)
    ? ' aria-disabled="true" data-disabled-case="true"'
    : '';
  return `data-algorithm="${algo.key}" data-case="${runnableCase(algo, caseType)}" data-tooltip="${escapeAttr(caseShape(algo, caseType))}"${disabled}`;
}

function overviewHtml(groups) {
  const rows = groups
    .map(
      ([category, items]) => `
        <tr class="overview-category-row">
          <th scope="rowgroup" colspan="5">${category}</th>
        </tr>
        ${items
          .map((algo) => {
            const { complexity } = algo.docs;
            return `
              <tr>
                <th scope="row">
                  <button class="overview-name" data-algorithm="${algo.key}">${algo.name}</button>
                </th>
                <td>${escapeHtml(briefPhrase(algo))}</td>
                <td><button class="complexity-run tooltip" ${caseButtonAttrs(algo, 'best')}>${complexity.best}</button></td>
                <td><button class="complexity-run tooltip" ${caseButtonAttrs(algo, 'random')}>${complexity.average}</button></td>
                <td><button class="complexity-run tooltip" ${caseButtonAttrs(algo, 'worst')}>${complexity.worst}</button></td>
              </tr>`;
          })
          .join('')}`
    )
    .join('');

  return `
    <section class="algorithm-overview" aria-label="Algorithm overview">
      <h3 class="section-title">At a Glance</h3>
      <div class="overview-table-wrap">
        <table class="overview-table">
          <thead>
            <tr>
              <th scope="col">Algorithm</th>
              <th scope="col">Idea</th>
              <th scope="col">Best</th>
              <th scope="col">Average</th>
              <th scope="col">Worst</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </section>`;
}

function sectionHtml(algo) {
  const { docs } = algo;
  const steps = docs.steps.map((s) => `<li>${s}</li>`).join('');
  const cards = [
    ['Best Case', 'best', docs.complexity.best],
    ['Average Case', 'random', docs.complexity.average],
    ['Worst Case', 'worst', docs.complexity.worst],
  ]
    .map(
      ([label, caseType, value]) => `
        <button class="complexity-card case-card tooltip" ${caseButtonAttrs(algo, caseType)}>
          <h5>${label}</h5>
          <div class="value">${value}</div>
        </button>`
    )
    .join('') +
    `
      <div class="complexity-card">
        <h5>Space</h5>
        <div class="value">${docs.complexity.space}</div>
      </div>`;

  return `
    <section class="algorithm-section" id="section-${algo.key}">
      <h3 class="section-title">${algo.name}</h3>
      <div class="run-buttons">
        <button class="run-button random tooltip" ${caseButtonAttrs(algo, 'random')}>
          <i class="fas fa-random"></i> Run Random</button>
        <button class="run-button best-case tooltip" ${caseButtonAttrs(algo, 'best')}>
          <i class="fas fa-check"></i> Run Best Case</button>
        <button class="run-button worst-case tooltip" ${caseButtonAttrs(algo, 'worst')}>
          <i class="fas fa-times"></i> Run Worst Case</button>
      </div>
      <div class="algorithm-description">
        <h4>Description</h4>
        <p>${docs.description}</p>
      </div>
      <div class="algorithm-description">
        <h4>How It Works</h4>
        <ol class="steps">${steps}</ol>
      </div>
      <div class="complexity-info">${cards}</div>
      <div class="code-block">
        <div class="code-header"><span>Python Implementation</span></div>
        <div class="code-content"><pre>${highlightPython(docs.code)}</pre></div>
      </div>
    </section>`;
}

export function buildModal({ sidebar, content }, onRunPreset) {
  setupFloatingTooltips();
  const groups = groupByCategory(algorithms);
  const orderedAlgorithms = flattenGroups(groups);

  sidebar.innerHTML =
    '<h3>Algorithms</h3>' +
    '<button class="sidebar-item sidebar-summary active" data-summary="true">Summary</button>' +
    groups
      .map(
        ([category, items]) =>
          `<p class="sidebar-group">${category}</p>` +
          items
            .map(
              (a) =>
                `<button class="sidebar-item" data-algorithm="${a.key}">${a.name}</button>`
            )
            .join('')
      )
      .join('');

  content.innerHTML = overviewHtml(groups) + orderedAlgorithms.map(sectionHtml).join('');

  content.querySelectorAll('.run-button, .complexity-run, .case-card').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (btn.dataset.disabledCase) return;
      onRunPreset(btn.dataset.algorithm, btn.dataset.case);
    });
  });

  const scrollToAlgorithm = (key) => {
    const section = content.querySelector(`#section-${key}`);
    section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const scrollToSummary = () => {
    content.querySelector('.algorithm-overview')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  content.querySelectorAll('.overview-name').forEach((item) => {
    item.addEventListener('click', () => scrollToAlgorithm(item.dataset.algorithm));
  });

  const scrollTopBtn = content
    .closest('.modal-content-wrap')
    ?.querySelector('.modal-scroll-top');

  const updateScrollTopBtn = () => {
    const show = content.scrollTop > 200;
    scrollTopBtn?.classList.toggle('visible', show);
    if (scrollTopBtn) scrollTopBtn.hidden = !show;
  };

  scrollTopBtn?.addEventListener('click', scrollToSummary);
  sidebar.querySelector('.sidebar-summary')?.addEventListener('click', scrollToSummary);

  // Sidebar click -> smooth scroll to section.
  sidebar.querySelectorAll('.sidebar-item').forEach((item) => {
    item.addEventListener('click', () => scrollToAlgorithm(item.dataset.algorithm));
  });

  // Scroll spy -> highlight the active sidebar item and toggle back-to-top.
  content.addEventListener('scroll', () => {
    updateScrollTopBtn();

    const pos = content.scrollTop + 160;
    let active = null;
    content.querySelectorAll('.algorithm-section').forEach((s) => {
      if (s.offsetTop <= pos) active = s.id.replace('section-', '');
    });
    sidebar.querySelector('.sidebar-summary')?.classList.toggle('active', active === null);
    sidebar.querySelectorAll('.sidebar-item').forEach((item) => {
      if (!item.dataset.summary) item.classList.toggle('active', item.dataset.algorithm === active);
    });
  });
}

export function buildDistributionOptions(select, labels) {
  select.innerHTML = Object.entries(labels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}
