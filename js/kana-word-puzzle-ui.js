// Kana Word Puzzle (kana-word-puzzle.html): the on-screen crossword. A puzzle comes from
// KanaWordPuzzleGenerator; the student drags tiles into the empty squares (touch or mouse), or taps
// a square and then a tile. All state lives in `wp`, and the whole game is rendered from it, so a
// language switch just re-renders. A word counts when its squares are full and spell a word from the
// list; the puzzle is solved when every word in the grid does.

const wp = {
  puzzle: null,
  cellByKey: new Map(),
  placed: new Map(),   // cell key -> tile id, for the squares the student has filled
  sel: null,           // key of the chosen square (used by tap-to-place)
  done: new Set(),     // ids of words that are full and spell a list word
  hinted: new Set(),   // cell keys filled by a hint
  hints: 0,
  score: 0,
  startedAt: 0,
  finished: false,
};

const wpEl = (id) => document.getElementById(id);

// ---------- sound ----------
// Recorded clips live in audio/kana/<romaji>.wav (the 46 basic kana). For anything without a
// clip (the dakuten/handakuten kana), or if a clip can't play, fall back to the browser's
// Japanese voice.
const wpClips = {};
let wpCurrentClip = null;
let wpRomaji = null;

function wpSoundOn() { return wpEl('cfg-sound').checked; }

function wpSpeak(text) {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

function wpSayKana(ch) {
  if (!wpSoundOn()) return;
  if (!wpRomaji) {
    wpRomaji = new Map();
    for (const row of MATCH_ROWS) if (row.group === 'basic') for (const item of row.items) wpRomaji.set(item[0], item[2]);
  }
  const r = wpRomaji.get(ch);
  if (!r) return wpSpeak(ch);
  if (wpCurrentClip) { wpCurrentClip.pause(); wpCurrentClip = null; }
  const a = wpClips[r] || (wpClips[r] = new Audio(`audio/kana/${r}.wav`));
  a.currentTime = 0;
  wpCurrentClip = a;
  a.play().catch(() => wpSpeak(ch));
}

// ---------- puzzle state ----------

function wpConfig() {
  return { words: parseInt(wpEl('cfg-words').value, 10), level: wpEl('cfg-level').value };
}

function wpNewPuzzle() {
  const puzzle = new KanaWordPuzzleGenerator(wpConfig()).build();
  wp.puzzle = puzzle;
  wp.cellByKey = new Map(puzzle.cells.map((c) => [c.key, c]));
  wp.placed = new Map();
  wp.done = new Set();
  wp.hinted = new Set();
  wp.hints = 0;
  wp.score = 0;
  wp.finished = false;
  wp.startedAt = Date.now();
  wp.sel = null;
  wpAdvance();
}

function wpTile(id) { return wp.puzzle.tiles.find((t) => t.id === id); }

function wpCellChar(cell) {
  if (cell.given) return cell.ch;
  const id = wp.placed.get(cell.key);
  return id === undefined ? '' : wpTile(id).ch;
}

// A square is locked if it started filled in or a hint filled it.
function wpLocked(cell) { return cell.given || wp.hinted.has(cell.key); }

// Chooses the next square, in reading order, that is empty and can be filled.
function wpAdvance() {
  const cells = wp.puzzle.cells.slice().sort((a, b) => a.r - b.r || a.c - b.c);
  const from = wp.sel ? cells.findIndex((c) => c.key === wp.sel) : -1;
  const order = [...cells.slice(from + 1), ...cells.slice(0, from + 1)];
  const next = order.find((c) => !wpLocked(c) && !wp.placed.has(c.key));
  wp.sel = next ? next.key : wp.sel;
}

// Works out which words are right and the score. A full word that is not on the list is not marked
// at all, so the student gets no hint that it is wrong. Words are not locked once right: a different
// arrangement can solve the puzzle just as well.
function wpRecompute() {
  wp.done = new Set();
  wp.score = 0;
  for (const w of wp.puzzle.words) {
    const letters = w.keys.map((k) => wpCellChar(wp.cellByKey.get(k)));
    if (letters.some((ch) => ch === '')) continue;
    const word = letters.join('');
    if (wp.puzzle.dict.has(word)) { wp.done.add(w.id); wp.score += wpWordPoints(word); }
  }
  // Each hint used costs one point, and the score never goes below zero.
  wp.score = Math.max(0, wp.score - wp.hints);
  wp.finished = wp.done.size === wp.puzzle.words.length;
}

// ---------- actions ----------

// True when `placed` would leave something on the safety list in a run that touches one of the
// changed squares. Every unbroken stretch of filled squares is checked, so a blocked word can't be
// built up one tile at a time. A stretch shorter than its word is only checked against the longer
// (3+ kana) entries, since a two-kana entry is a whole-word match only.
function wpBlockedAfter(changedKeys, placed) {
  const charAt = (cell) => {
    if (cell.given) return cell.ch;
    const id = placed.get(cell.key);
    return id === undefined ? '' : wpTile(id).ch;
  };
  const touched = new Set();
  for (const k of changedKeys) {
    const c = wp.cellByKey.get(k);
    for (const id of [c.across, c.down]) if (id !== null && id !== undefined) touched.add(id);
  }
  for (const w of wp.puzzle.words) {
    if (!touched.has(w.id)) continue;
    const letters = w.keys.map((k) => charAt(wp.cellByKey.get(k)));
    let run = '';
    for (const ch of [...letters, '']) {
      if (ch) { run += ch; continue; }
      if (run) {
        const folded = kanaFold(run);
        const whole = [...run].length === letters.length;
        if (whole ? kanaWordBlocked(run) : KANA_BLOCKED_WORDS.some((b) => b.length >= 3 && folded.includes(b))) return true;
      }
      run = '';
    }
  }
  return false;
}

function wpPlaceInCell(key, tileId, fromKey) {
  const cell = wp.cellByKey.get(key);
  if (wpLocked(cell)) return;
  const displaced = wp.placed.get(key);
  // Anywhere goes, except a move that would spell something on the safety list: that one simply
  // doesn't happen (the tile stays where it was).
  const after = new Map(wp.placed);
  after.set(key, tileId);
  if (fromKey !== null && fromKey !== undefined) {
    if (displaced === undefined) after.delete(fromKey); else after.set(fromKey, displaced);
  }
  if (wpBlockedAfter([key, fromKey].filter((k) => k !== null && k !== undefined), after)) { wpRender(); return; }
  wp.placed.set(key, tileId);
  if (fromKey !== null && fromKey !== undefined) {
    if (displaced === undefined) wp.placed.delete(fromKey); else wp.placed.set(fromKey, displaced);
  }
  wp.sel = key;
  wpRecompute();
  if (!wp.finished) wpAdvance();
  wpRender();
}

function wpReturnToBank(fromKey) {
  wp.placed.delete(fromKey);
  wp.sel = fromKey;
  wpRecompute();
  wpRender();
}

// Tap fallback: put this tile in the chosen square.
function wpTapTile(tileId) {
  if (wp.finished || !wp.sel) return;
  wpPlaceInCell(wp.sel, tileId, null);
}

function wpTapCell(key) {
  if (wp.finished) return;
  wp.sel = key;
  wpRender();
}

function wpTakeBack() {
  if (wp.finished) return;
  let key = wp.sel;
  if (!key || !wp.placed.has(key) || wpLocked(wp.cellByKey.get(key))) {
    // Nothing to take back in the chosen square: take back the last tile in reading order.
    const filled = wp.puzzle.cells.filter((c) => wp.placed.has(c.key) && !wpLocked(c)).sort((a, b) => b.r - a.r || b.c - a.c);
    if (!filled.length) return;
    key = filled[0].key;
  }
  wpReturnToBank(key);
}

function wpHint() {
  if (wp.finished) return;
  let cell = wp.sel && wp.cellByKey.get(wp.sel);
  if (!cell || wpLocked(cell)) cell = wp.puzzle.cells.find((c) => !wpLocked(c) && !wp.placed.has(c.key)) || wp.puzzle.cells.find((c) => !wpLocked(c));
  if (!cell) return;
  // The right tile is either unused, or sits in some other (wrong) square.
  wp.placed.delete(cell.key);
  const used = new Set(wp.placed.values());
  let tile = wp.puzzle.tiles.find((t) => t.ch === cell.ch && !used.has(t.id));
  if (!tile) {
    for (const [k, id] of wp.placed) {
      if (wpTile(id).ch === cell.ch && !wpLocked(wp.cellByKey.get(k))) { tile = wpTile(id); wp.placed.delete(k); break; }
    }
  }
  if (!tile) return;
  wp.placed.set(cell.key, tile.id);
  wp.hinted.add(cell.key);
  wp.hints++;
  wp.sel = cell.key;
  wpRecompute();
  if (!wp.finished) wpAdvance();
  wpRender();
}

// ---------- rendering ----------

function wpRender() {
  const tr = I18N.t;
  const p = wp.puzzle;
  const grid = wpEl('wp-grid');
  grid.style.setProperty('--cols', p.cols);
  const wordsAt = (cell) => [cell.across, cell.down].filter((id) => id !== null);
  const cells = [];
  for (let r = 0; r < p.rows; r++) {
    for (let c = 0; c < p.cols; c++) {
      const key = `${r},${c}`;
      const cell = wp.cellByKey.get(key);
      if (!cell) { cells.push('<div class="wp-cell wp-empty"></div>'); continue; }
      const cls = ['wp-cell'];
      if (wp.sel === key) cls.push('wp-sel');
      if (cell.given) cls.push('wp-given');
      else if (wp.hinted.has(key)) cls.push('wp-hinted');
      if (wordsAt(cell).some((id) => wp.done.has(id))) cls.push('wp-done');
      const ch = wpCellChar(cell);
      const label = tr('wp.cell.aria', 'Square, row {r}, column {c}', { r: r + 1, c: c + 1 });
      cells.push(`<button type="button" class="${cls.join(' ')}" data-cell="${key}" aria-label="${label}">${ch}</button>`);
    }
  }
  grid.innerHTML = cells.join('');

  const used = new Set(wp.placed.values());
  wpEl('wp-tiles').innerHTML = p.tiles.map((t) => `
    <button type="button" class="wp-tile" data-tile="${t.id}" ${used.has(t.id) ? 'disabled' : ''} aria-label="${t.ch}">${t.ch}</button>`).join('');

  wpEl('wp-stats').textContent = tr('wp.stats', 'Score {score} · Hints {hints}', { score: wp.score, hints: wp.hints });

  const win = wpEl('wp-win');
  win.classList.toggle('hidden', !wp.finished);
  if (wp.finished) {
    const secs = Math.round((Date.now() - wp.startedAt) / 1000);
    const time = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
    wpEl('wp-win-text').textContent = tr('wp.win.text', 'Score {score}, {hints} hint(s), time {time}.', { score: wp.score, hints: wp.hints, time });
  }
}

// ---------- drag and drop (pointer events: mouse, touch and pen) ----------
// Press a tile, or a tile already in the grid, and move: a copy of the tile follows the pointer,
// and letting go over a square drops it there (a tile already there goes to the other spot).
// Letting go over the tile tray puts a grid tile back. Press and release without moving is a tap.

const WP_DRAG_THRESHOLD = 6;
let wpDrag = null;

function wpSquareAt(x, y) {
  const el = document.elementFromPoint(x, y);
  const btn = el && el.closest('[data-cell]');
  return btn ? btn.dataset.cell : null;
}

function wpDragStart(e) {
  if (wp.finished || (e.pointerType === 'mouse' && e.button !== 0)) return;
  const tileBtn = e.target.closest('[data-tile]');
  const cellBtn = e.target.closest('[data-cell]');
  if (tileBtn) {
    if (tileBtn.disabled) return;
    wpDrag = { kind: 'tile', tileId: parseInt(tileBtn.dataset.tile, 10), fromKey: null, source: tileBtn };
    wpSayKana(wpTile(wpDrag.tileId).ch); // plays as the kana is picked up
  } else if (cellBtn) {
    const key = cellBtn.dataset.cell;
    const id = wp.placed.get(key);
    const movable = id !== undefined && !wpLocked(wp.cellByKey.get(key));
    wpDrag = { kind: movable ? 'cell' : 'tap', tileId: movable ? id : null, fromKey: key, source: cellBtn };
    if (movable) wpSayKana(wpTile(id).ch);
  } else {
    return;
  }
  Object.assign(wpDrag, { x0: e.clientX, y0: e.clientY, active: false, ghost: null, over: null });
  window.addEventListener('pointermove', wpDragMove);
  window.addEventListener('pointerup', wpDragEnd);
  window.addEventListener('pointercancel', wpDragCancel);
}

function wpDragMove(e) {
  const d = wpDrag;
  if (!d) return;
  if (!d.active) {
    if (d.kind === 'tap' || Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < WP_DRAG_THRESHOLD) return;
    d.active = true;
    const tile = wpTile(d.tileId);
    const ghost = document.createElement('div');
    ghost.className = 'wp-tile wp-ghost jp-font';
    ghost.textContent = tile.ch;
    document.body.appendChild(ghost);
    d.ghost = ghost;
    d.source.classList.add('wp-lifted');
  }
  e.preventDefault();
  d.ghost.style.left = `${e.clientX}px`;
  d.ghost.style.top = `${e.clientY}px`;
  const key = wpSquareAt(e.clientX, e.clientY);
  const ok = key && !wpLocked(wp.cellByKey.get(key)) ? key : null;
  if (ok !== d.over) {
    document.querySelectorAll('.wp-over').forEach((el) => el.classList.remove('wp-over'));
    if (ok) document.querySelector(`[data-cell="${ok}"]`).classList.add('wp-over');
    d.over = ok;
  }
}

function wpDragCleanup() {
  window.removeEventListener('pointermove', wpDragMove);
  window.removeEventListener('pointerup', wpDragEnd);
  window.removeEventListener('pointercancel', wpDragCancel);
  document.querySelectorAll('.wp-over').forEach((el) => el.classList.remove('wp-over'));
  if (wpDrag && wpDrag.ghost) wpDrag.ghost.remove();
  if (wpDrag && wpDrag.source) wpDrag.source.classList.remove('wp-lifted');
}

function wpDragCancel() {
  wpDragCleanup();
  wpDrag = null;
}

function wpDragEnd(e) {
  const d = wpDrag;
  wpDragCleanup();
  wpDrag = null;
  if (!d) return;
  if (!d.active) {
    // A tap: a tile goes into the chosen square, a square becomes the chosen one.
    if (d.kind === 'tile') wpTapTile(d.tileId);
    else wpTapCell(d.fromKey);
    return;
  }
  const key = wpSquareAt(e.clientX, e.clientY);
  if (key) {
    if (key === d.fromKey || wpLocked(wp.cellByKey.get(key))) { wpRender(); return; }
    wpPlaceInCell(key, d.tileId, d.fromKey);
    return;
  }
  const overTray = document.elementFromPoint(e.clientX, e.clientY);
  if (d.kind === 'cell' && overTray && overTray.closest('#wp-tray')) wpReturnToBank(d.fromKey);
  else wpRender();
}

document.addEventListener('DOMContentLoaded', () => {
  const game = wpEl('wp-game');
  game.addEventListener('pointerdown', wpDragStart);
  // Keyboard users: Enter or Space on a button arrives as a click with no pointer (detail 0).
  game.addEventListener('click', (e) => {
    if (e.detail !== 0) return;
    const tileBtn = e.target.closest('[data-tile]');
    const cellBtn = e.target.closest('[data-cell]');
    if (tileBtn && !tileBtn.disabled) { wpSayKana(wpTile(parseInt(tileBtn.dataset.tile, 10)).ch); wpTapTile(parseInt(tileBtn.dataset.tile, 10)); }
    else if (cellBtn) wpTapCell(cellBtn.dataset.cell);
  });
  wpEl('back-btn').addEventListener('click', wpTakeBack);
  wpEl('hint-btn').addEventListener('click', wpHint);
  wpEl('new-btn').addEventListener('click', () => { wpNewPuzzle(); wpRender(); });
  wpEl('again-btn').addEventListener('click', () => { wpNewPuzzle(); wpRender(); window.scrollTo(0, 0); });
  // Changing the number of words or letters shown starts a new puzzle.
  for (const id of ['cfg-words', 'cfg-level']) {
    wpEl(id).addEventListener('change', () => { wpNewPuzzle(); wpRender(); });
  }
  document.addEventListener('i18n:change', wpRender);

  wpNewPuzzle();
  wpRender();
  I18N.init();
});
