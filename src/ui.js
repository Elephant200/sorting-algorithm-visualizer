// Builds the algorithm toolbar and the docs modal from the algorithms registry,
// so adding an algorithm is a single registry entry. Also provides a small
// Python syntax highlighter for the code blocks.

import { algorithms } from './algorithms.js';

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

// --- toolbar -----------------------------------------------------------------

// Preserve registry order while collecting each category's algorithms.
function groupByCategory(list) {
  const groups = new Map();
  for (const algo of list) {
    if (!groups.has(algo.category)) groups.set(algo.category, []);
    groups.get(algo.category).push(algo);
  }
  return groups;
}

export function buildAlgorithmButtons(container, onSelect) {
  container.innerHTML = '';
  for (const [category, items] of groupByCategory(algorithms)) {
    const group = document.createElement('div');
    group.className = 'algo-group';

    const label = document.createElement('span');
    label.className = 'algo-group-label';
    label.textContent = category;
    group.appendChild(label);

    const chips = document.createElement('div');
    chips.className = 'algo-chips';
    for (const algo of items) {
      const button = document.createElement('button');
      button.className = 'algo-button tooltip';
      button.textContent = algo.name.replace(/ Sort$/, '');
      button.dataset.tooltip = algo.tooltip;
      button.dataset.algorithm = algo.key;
      button.addEventListener('click', () => onSelect(algo.key));
      chips.appendChild(button);
    }
    group.appendChild(chips);
    container.appendChild(group);
  }
}

// --- docs modal --------------------------------------------------------------

function sectionHtml(algo) {
  const { docs } = algo;
  const steps = docs.steps.map((s) => `<li>${s}</li>`).join('');
  const cards = [
    ['Best Case', docs.complexity.best],
    ['Worst Case', docs.complexity.worst],
    ['Average Case', docs.complexity.average],
    ['Space', docs.complexity.space],
  ]
    .map(
      ([label, value]) => `
        <div class="complexity-card">
          <h5>${label}</h5>
          <div class="value">${value}</div>
        </div>`
    )
    .join('');

  return `
    <section class="algorithm-section" id="section-${algo.key}">
      <h3 class="section-title">${algo.name}</h3>
      <div class="run-buttons">
        <button class="run-button random" data-algorithm="${algo.key}" data-case="random">
          <i class="fas fa-random"></i> Run Random</button>
        <button class="run-button best-case" data-algorithm="${algo.key}" data-case="best">
          <i class="fas fa-check"></i> Run Best Case</button>
        <button class="run-button worst-case" data-algorithm="${algo.key}" data-case="worst">
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
  sidebar.innerHTML =
    '<h3>Algorithms</h3>' +
    [...groupByCategory(algorithms)]
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

  content.innerHTML = algorithms.map(sectionHtml).join('');

  content.querySelectorAll('.run-button').forEach((btn) => {
    btn.addEventListener('click', () =>
      onRunPreset(btn.dataset.algorithm, btn.dataset.case)
    );
  });

  // Sidebar click -> smooth scroll to section.
  sidebar.querySelectorAll('.sidebar-item').forEach((item) => {
    item.addEventListener('click', () => {
      const section = content.querySelector(`#section-${item.dataset.algorithm}`);
      section?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });

  // Scroll spy -> highlight the active sidebar item.
  content.addEventListener('scroll', () => {
    const pos = content.scrollTop + 160;
    let active = null;
    content.querySelectorAll('.algorithm-section').forEach((s) => {
      if (s.offsetTop <= pos) active = s.id.replace('section-', '');
    });
    sidebar.querySelectorAll('.sidebar-item').forEach((item) => {
      item.classList.toggle('active', item.dataset.algorithm === active);
    });
  });
}

export function buildDistributionOptions(select, labels) {
  select.innerHTML = Object.entries(labels)
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join('');
}
