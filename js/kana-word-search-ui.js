// Kana Word Search (kana-word-search.html): the on-screen game. A grid comes from
// KanaWordSearchGenerator. The student taps letters one at a time; the letters must follow one
// straight line (each next tap is the square beside the last one, in the same direction), and
// Submit checks the word against the grid's list. All state lives in `ws`, and the whole game is
// rendered from it, so a language switch just re-renders.

const ws = {
  puzzle: null,
  sel: [],          // [[r, c], ...] squares tapped so far
  found: new Map(), // word -> { cells }, every word the student has scored
  used: new Map(),  // "r,c" -> how many found words use the square
  hintKey: null,    // "r,c" of the square a hint marked
  hints: 0,
  score: 0,
  startedAt: 0,
  finished: false,
  msg: null,        // { key, fallback, vars, bad }
};

const wsEl = (id) => document.getElementById(id);

// The goal can't be more than the words hidden on purpose: options above it are disabled, and a goal
// that is now too high drops to the hidden count.
function wsSyncGoal() {
  const words = parseInt(wsEl('cfg-words').value, 10);
  const goal = wsEl('cfg-goal');
  for (const opt of goal.options) opt.disabled = parseInt(opt.value, 10) > words;
  if (parseInt(goal.value, 10) > words) goal.value = String(words);
}

function wsConfig() {
  return { side: parseInt(wsEl('cfg-side').value, 10), words: parseInt(wsEl('cfg-words').value, 10), mode: wsEl('cfg-mode').value };
}

// How many words finish the game: the chosen goal, but never more than are hidden.
function wsGoal() { return Math.min(parseInt(wsEl('cfg-goal').value, 10), ws.puzzle.planted.length); }

function wsSay(key, fallback, vars, bad) { ws.msg = { key, fallback, vars, bad: !!bad }; }

function wsNewPuzzle() {
  ws.puzzle = new KanaWordSearchGenerator(wsConfig()).build();
  ws.sel = [];
  ws.found = new Map();
  ws.used = new Map();
  ws.hintKey = null;
  ws.hints = 0;
  ws.score = 0;
  ws.finished = false;
  ws.startedAt = Date.now();
  ws.msg = null;
  if (ws.puzzle.planted.length < ws.puzzle.requested) {
    wsSay('ws.msg.fewer', 'Only {n} words fit in a grid this small.', { n: ws.puzzle.planted.length });
  }
}

const wsChar = ([r, c]) => ws.puzzle.grid[r][c];
const wsWord = () => ws.sel.map(wsChar).join('');

function wsPlantedLeft() { return ws.puzzle.planted.filter((p) => !ws.found.has(p.word)); }

// ---------- actions ----------

function wsTap(r, c) {
  if (ws.finished) return;
  ws.msg = null;
  const n = ws.sel.length;
  const last = ws.sel[n - 1];
  // Tapping a letter that is already picked takes it back, and every letter after it.
  const at = ws.sel.findIndex(([sr, sc]) => sr === r && sc === c);
  if (at !== -1) { ws.sel = ws.sel.slice(0, at); return; }
  if (n === 0) { ws.sel.push([r, c]); return; }
  const dr = r - last[0];
  const dc = c - last[1];
  if (n === 1) {
    // The second letter sets the direction; it has to be one the chosen direction mode uses.
    if (!WS_MODES[ws.puzzle.mode].some(([a, b]) => a === dr && b === dc)) { wsSay('ws.msg.line', 'Pick the next letter in a straight line, right beside the last one.', null, true); return; }
  } else {
    const dir = [last[0] - ws.sel[n - 2][0], last[1] - ws.sel[n - 2][1]];
    if (dr !== dir[0] || dc !== dir[1]) { wsSay('ws.msg.line', 'Pick the next letter in a straight line, right beside the last one.', null, true); return; }
  }
  ws.sel.push([r, c]);
}

function wsSubmit() {
  if (ws.finished) return;
  if (ws.sel.length < 2) { wsSay('ws.msg.short', 'Pick at least two letters first.', null, true); return; }
  const word = wsWord();
  const cells = ws.sel;
  ws.sel = [];
  if (ws.found.has(word)) { wsSay('ws.msg.again', 'You already found {word}.', { word }, true); return; }
  if (!ws.puzzle.valid.has(word)) { wsSay('ws.msg.no', '{word} is not one of the hidden words.', { word }, true); return; }
  ws.found.set(word, { cells });
  for (const [r, c] of cells) { const k = `${r},${c}`; ws.used.set(k, (ws.used.get(k) || 0) + 1); }
  const pts = Array.from(word).length;
  ws.score += pts;
  if (ws.hintKey && !wsPlantedLeft().some((p) => `${p.cells[0][0]},${p.cells[0][1]}` === ws.hintKey)) ws.hintKey = null;
  ws.finished = ws.found.size >= wsGoal();
  wsSay('ws.msg.found', '{word}: +{pts} points!', { word, pts });
}

function wsHint() {
  if (ws.finished) return;
  const left = wsPlantedLeft();
  if (!left.length) return;
  const p = wpPick(left);
  ws.hintKey = `${p.cells[0][0]},${p.cells[0][1]}`;
  ws.hints++;
  wsSay('ws.msg.hint', 'The first letter of a hidden word is marked.');
}

// ---------- rendering ----------

function wsRender() {
  const tr = I18N.t;
  const p = ws.puzzle;
  const grid = wsEl('ws-grid');
  grid.style.setProperty('--cols', p.side);
  const sel = new Set(ws.sel.map(([r, c]) => `${r},${c}`));
  const cells = [];
  for (let r = 0; r < p.side; r++) {
    for (let c = 0; c < p.side; c++) {
      const key = `${r},${c}`;
      const cls = ['ws-cell'];
      const uses = ws.used.get(key) || 0;
      if (uses) cls.push('ws-used');
      if (uses > 1) cls.push('ws-used2');
      if (ws.hintKey === key) cls.push('ws-hint');
      if (sel.has(key)) cls.push('ws-sel');
      const label = tr('ws.cell.aria', 'Letter {ch}, row {r}, column {c}', { ch: p.grid[r][c], r: r + 1, c: c + 1 });
      cells.push(`<button type="button" class="${cls.join(' ')}" data-r="${r}" data-c="${c}" aria-label="${label}" aria-pressed="${sel.has(key)}">${p.grid[r][c]}</button>`);
    }
  }
  grid.innerHTML = cells.join('');

  wsEl('ws-picked').textContent = wsWord();
  wsEl('ws-list').innerHTML = [...ws.found.keys()].map((w) => `<li class="ws-slot ws-found">${w}</li>`).join('');

  const score = Math.max(0, ws.score - ws.hints);
  wsEl('ws-stats').textContent = tr('ws.stats', 'Found {found} of {goal} · Score {score}', { found: Math.min(ws.found.size, wsGoal()), goal: wsGoal(), score });

  const msg = wsEl('ws-message');
  if (ws.msg) {
    msg.textContent = tr(ws.msg.key, ws.msg.fallback, ws.msg.vars || undefined);
    msg.className = `text-sm font-bold min-h-[1.5rem] ${ws.msg.bad ? 'text-red-700' : 'text-green-800'}`;
  } else {
    msg.textContent = ws.sel.length ? '' : tr('ws.msg.start', 'Tap the first letter of a word.');
    msg.className = 'text-sm font-bold min-h-[1.5rem] text-stone-600';
  }

  const win = wsEl('ws-win');
  win.classList.toggle('hidden', !ws.finished);
  if (ws.finished) {
    const secs = Math.round((Date.now() - ws.startedAt) / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    wsEl('ws-win-text').textContent = tr('ws.win.text', 'Score {score}, {hints} hint(s), time {time}.', { score, hints: ws.hints, time });
  }
  for (const id of ['submit-btn', 'hint-btn']) wsEl(id).disabled = ws.finished;
}

document.addEventListener('DOMContentLoaded', () => {
  wsEl('ws-grid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-r]');
    if (!btn) return;
    wsTap(parseInt(btn.dataset.r, 10), parseInt(btn.dataset.c, 10));
    wsRender();
  });
  const act = (id, fn) => wsEl(id).addEventListener('click', () => { fn(); wsRender(); });
  act('submit-btn', wsSubmit);
  act('hint-btn', wsHint);
  act('new-btn', wsNewPuzzle);
  wsEl('again-btn').addEventListener('click', () => { wsNewPuzzle(); wsRender(); window.scrollTo(0, 0); });
  // Changing the grid size, number of words or directions starts a new puzzle.
  for (const id of ['cfg-side', 'cfg-goal', 'cfg-words', 'cfg-mode']) {
    wsEl(id).addEventListener('change', () => { if (id === 'cfg-words') wsSyncGoal(); wsNewPuzzle(); wsRender(); });
  }
  document.addEventListener('i18n:change', wsRender);

  wsSyncGoal();
  wsNewPuzzle();
  wsRender();
  I18N.init();
});
