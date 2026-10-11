// Kana Word Search (kana-word-search.html): hides words from the site's word list in a grid of kana.
// Words run in a straight line (across, down, and optionally diagonal or backwards, see WS_MODES).
// The rest of the grid is filled with random kana, then repaired so that no run of kana spells
// something on the safety list, and so that no other list word hides in the filler by accident.
// A list word that sits entirely inside the planted words (はし inside つるはし) is a bonus word:
// it is accepted when found, but is not one of the words the student has to find.
// The hidden words are the simple example words of the teaching list (wpLibrary, up to four kana, plus one or two longer ones), but any reading in KANA_SEARCH_DICT
// (kana-word-dictionary.js, a much larger common-noun list) is accepted when found, so everyday words
// like うた are not marked wrong. Needs japanese-practice-generator.js (HIRAGANA_WORDS),
// kana-word-puzzle-generator.js (wpLibrary), kana-word-dictionary.js and kana-safety.js.

const WS_SIDE_MIN = 4;
const WS_SIDE_MAX = 12;
const WS_SIDE_DEFAULT = 7;
const WS_WORDS_MIN = 3;
const WS_WORDS_MAX = 15;
const WS_PLANT_MAX_LEN = 4; // longest hidden word, in kana
const WS_WORDS_DEFAULT = 10;

// Direction sets as [row step, column step]. A word is read from its first letter in one of these.
const WS_MODES = {
  easy: [[0, 1], [1, 0]],
  normal: [[0, 1], [1, 0], [1, 1], [-1, 1]],
  hard: [[0, 1], [1, 0], [1, 1], [-1, 1], [0, -1], [-1, 0], [-1, -1], [1, -1]],
};

const WS_SMALL_KANA = 'ぁぃぅぇぉっゃゅょゎー';

class KanaWordSearchGenerator {
  // config: { side (4-10), words (3-15), mode ('easy' | 'normal' | 'hard') }
  constructor(config) {
    const num = (v, lo, hi, d) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : d));
    this.side = num(config.side, WS_SIDE_MIN, WS_SIDE_MAX, WS_SIDE_DEFAULT);
    this.want = num(config.words, WS_WORDS_MIN, WS_WORDS_MAX, WS_WORDS_DEFAULT);
    this.mode = WS_MODES[config.mode] ? config.mode : 'easy';
    this.dirs = WS_MODES[this.mode];
    this.lib = wpLibrary().filter((w) => w.letters.length <= this.side);
    // The hidden words are mostly the simple ones: the example words of Writing Practice, up to four kana.
    // Everything else in the lists is still accepted when found.
    this.plantable = this.lib.filter((w) => w.letters.length <= WS_PLANT_MAX_LEN && !WP_FIVE_KANA_WORDS.includes(w.word));
    // One or two longer words (five kana or more) are always hidden when they fit, so a long word
    // is there to be found; left to chance they would almost never be picked.
    this.longWords = this.lib.filter((w) => w.letters.length > WS_PLANT_MAX_LEN);
    const pool = [];
    for (const w of wpLibrary()) for (const ch of w.letters) if (!WS_SMALL_KANA.includes(ch)) pool.push(ch);
    this.pool = pool;
    const index = (words) => {
      const map = new Map();
      for (const w of words) {
        if (!map.has(w.letters[0])) map.set(w.letters[0], []);
        map.get(w.letters[0]).push(w);
      }
      return map;
    };
    this.byFirst = index(this.lib);
    // Every word that counts when found: the teaching list plus the larger dictionary, minus anything
    // the safety list blocks.
    const accepted = new Map(this.lib.map((w) => [w.word, w]));
    for (const word of KANA_SEARCH_DICT) {
      const letters = Array.from(word);
      if (letters.length <= this.side && !accepted.has(word) && !kanaWordBlocked(word)) accepted.set(word, { word, letters });
    }
    this.dictByFirst = index([...accepted.values()]);
  }

  // { side, mode, requested, grid (rows of kana), planted [{ word, cells: [[r, c], ...] }], valid (Set of words) }
  build() {
    for (let count = this.want; count >= 1; count--) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const made = this._try(count);
        if (made) return { ...made, side: this.side, mode: this.mode, requested: this.want };
      }
    }
    throw new Error('Word search: could not build a grid');
  }

  _try(count) {
    const n = this.side;
    const grid = Array.from({ length: n }, () => Array(n).fill(''));
    const planted = [];
    const longWanted = this.side >= 5 && count >= 3 ? (count >= 6 ? 2 : 1) : 0;
    let longPlaced = 0;
    for (const w of [...wpShuffled(this.longWords).slice(0, longWanted + 4), ...this._order()]) {
      if (planted.length === count) break;
      const isLong = w.letters.length > WS_PLANT_MAX_LEN;
      if (isLong && longPlaced >= longWanted) continue;
      const spot = this._place(grid, w.letters);
      if (!spot) continue;
      if (isLong) longPlaced++;
      spot.forEach(([r, c], i) => { grid[r][c] = w.letters[i]; });
      planted.push({ word: w.word, cells: spot });
    }
    if (planted.length < count) return null;

    const fixed = new Set();
    for (const p of planted) for (const [r, c] of p.cells) fixed.add(`${r},${c}`);
    const free = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (!fixed.has(`${r},${c}`)) { free.push([r, c]); grid[r][c] = wpPick(this.pool); }

    const plantedWords = new Set(planted.map((p) => p.word));
    // Repair: re-roll a filler square in each blocked run and each accidental word, until none is left.
    for (let round = 0; round < 400; round++) {
      const todo = this._blocked(grid).map((cells) => ({ cells, blocked: true }));
      for (const f of this._found(grid)) {
        if (!plantedWords.has(f.word)) todo.push({ cells: f.cells, blocked: false });
      }
      let stuck = false;
      let changed = false;
      for (const p of todo) {
        const spots = p.cells.filter(([r, c]) => !fixed.has(`${r},${c}`));
        if (!spots.length) { if (p.blocked) stuck = true; continue; } // a bonus word made only of planted letters is fine
        const [r, c] = wpPick(spots);
        grid[r][c] = wpPick(this.pool);
        changed = true;
      }
      if (stuck) return null;
      if (!changed) break;
    }
    if (this._blocked(grid).length) return null;
    const valid = new Set(this._found(grid, this.dictByFirst).map((f) => f.word));
    for (const p of planted) valid.add(p.word);
    return { grid, planted, valid };
  }

  // The library in random order, but with every word length equally likely to come next, so the
  // hidden words are a mix of short and long ones rather than mostly the longest (most words are long).
  _order() {
    const byLen = new Map();
    for (const w of wpShuffled(this.plantable)) {
      if (!byLen.has(w.letters.length)) byLen.set(w.letters.length, []);
      byLen.get(w.letters.length).push(w);
    }
    const lens = [...byLen.keys()];
    const out = [];
    while (lens.length) {
      const i = Math.floor(Math.random() * lens.length);
      const bucket = byLen.get(lens[i]);
      out.push(bucket.pop());
      if (!bucket.length) lens.splice(i, 1);
    }
    return out;
  }

  // A random free straight line for the letters, or null. Squares already holding the same letter may be shared.
  _place(grid, letters) {
    const n = this.side;
    const spots = [];
    for (const [dr, dc] of this.dirs) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const er = r + dr * (letters.length - 1);
          const ec = c + dc * (letters.length - 1);
          if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
          let ok = true;
          for (let i = 0; i < letters.length; i++) {
            const have = grid[r + dr * i][c + dc * i];
            if (have && have !== letters[i]) { ok = false; break; }
          }
          if (ok) spots.push([r, c, dr, dc]);
        }
      }
    }
    if (!spots.length) return null;
    const [r, c, dr, dc] = wpPick(spots);
    return letters.map((_, i) => [r + dr * i, c + dc * i]);
  }

  // Every list word in the grid, along the allowed directions: [{ word, cells }].
  _found(grid, byFirst = this.byFirst) {
    const n = this.side;
    const out = [];
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const words = byFirst.get(grid[r][c]);
        if (!words) continue;
        for (const [dr, dc] of this.dirs) {
          for (const w of words) {
            const len = w.letters.length;
            const er = r + dr * (len - 1);
            const ec = c + dc * (len - 1);
            if (er < 0 || er >= n || ec < 0 || ec >= n) continue;
            let ok = true;
            for (let i = 1; i < len; i++) if (grid[r + dr * i][c + dc * i] !== w.letters[i]) { ok = false; break; }
            if (ok) out.push({ word: w.word, cells: w.letters.map((_, i) => [r + dr * i, c + dc * i]) });
          }
        }
      }
    }
    return out;
  }

  // Every run of the grid (rows, columns, both diagonals), read both ways whatever the mode, that
  // contains a safety-list word: the squares of each such occurrence.
  _blocked(grid) {
    const n = this.side;
    const hits = [];
    const lines = [];
    for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1]]) {
      for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
          const pr = r - dr;
          const pc = c - dc;
          if (pr >= 0 && pr < n && pc >= 0 && pc < n) continue; // not the start of a line
          const cells = [];
          for (let rr = r, cc = c; rr >= 0 && rr < n && cc >= 0 && cc < n; rr += dr, cc += dc) cells.push([rr, cc]);
          if (cells.length >= 2) lines.push(cells);
        }
      }
    }
    for (const cells of lines) {
      for (const order of [cells, cells.slice().reverse()]) {
        const text = order.map(([r, c]) => grid[r][c]).join('');
        for (const b of KANA_BLOCKED_WORDS) {
          let at = text.indexOf(b);
          while (at !== -1) { hits.push(order.slice(at, at + b.length)); at = text.indexOf(b, at + 1); }
        }
      }
    }
    return hits;
  }
}
