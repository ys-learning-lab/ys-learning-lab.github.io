// Kana Word Puzzle (kana-word-puzzle.html): builds a small crossword from the site's word list.
// Some letters are shown; the student drags tiles into the empty squares so that every across and
// down run spells a word from the list. The tiles are exactly the letters the empty squares need
// (a letter shared by two words is one tile).
// Needs japanese-practice-generator.js (HIRAGANA_WORDS) and kana-safety.js.

const WP_WORDS_MIN = 5;
const WP_WORDS_MAX = 10;
const WP_WORDS_DEFAULT = 7;
const WP_MAX_SIDE = 10; // the grid never grows past this many rows or columns

// How many letters of each word start filled in.
const WP_LEVELS = {
  few: (len) => 1,
  some: (len) => Math.max(1, Math.floor(len / 2)),
  many: (len) => Math.max(1, len - 2),
};

// Everyday words of exactly five kana (no small kana), added to the shared word list for the two word
// tools so a Word Builder set can always hold at least one five-kana word.
const WP_FIVE_KANA_WORDS = [
  'さつまいも', 'おべんとう', 'かたつむり', 'さくらんぼ', 'せんぷうき', 'おかあさん', 'おとうさん', 'おばあさん',
  'おじいさん', 'おにいさん', 'おねえさん', 'くだものや', 'かぶとむし', 'きりぎりす', 'ゆきだるま', 'にちようび',
  'げつようび', 'すいようび', 'もくようび', 'きんようび', 'ありがとう', 'こんにちは', 'こんばんは', 'さようなら',
  'たまごやき', 'かきごおり', 'こいのぼり', 'ひなまつり', 'ぼんおどり', 'かみしばい', 'すなあそび', 'かくれんぼ',
  'すべりだい', 'おめでとう',
];

// One point per letter, so a longer word scores more (はし 2, はしら 3).
function wpWordPoints(word) {
  return Array.from(word).length;
}

function wpShuffled(items) {
  const a = items.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function wpPick(items) { return items[Math.floor(Math.random() * items.length)]; }

// The word list: the example words of Writing Practice plus the five-kana words above, every one of
// two or more kana that the safety list accepts.
function wpLibrary() {
  const seen = new Set();
  const lib = [];
  for (const word of [...Object.values(HIRAGANA_WORDS).flat(), ...WP_FIVE_KANA_WORDS]) {
    const letters = Array.from(word);
    if (seen.has(word) || letters.length < 2 || kanaWordBlocked(word)) continue;
    seen.add(word);
    lib.push({ word, letters });
  }
  return lib;
}

class KanaWordPuzzleGenerator {
  // config: { words (5-10), level ('few' | 'some' | 'many': letters shown at the start) }
  constructor(config = {}) {
    const n = parseInt(config.words, 10);
    // The printed sheet asks for a different range and a bigger grid (config.wordsMin / wordsMax / maxSide).
    const lo = config.wordsMin || WP_WORDS_MIN;
    const hi = config.wordsMax || WP_WORDS_MAX;
    this.maxSide = config.maxSide || WP_MAX_SIDE;
    this.wordCount = Math.max(lo, Math.min(hi, Number.isNaN(n) ? WP_WORDS_DEFAULT : n));
    this.level = WP_LEVELS[config.level] ? config.level : 'some';
    this.lib = wpLibrary();
    this.dict = new Set(this.lib.map((e) => e.word));
    this.blocked = KANA_BLOCKED_WORDS.map((w) => Array.from(w));
  }

  // Returns { rows, cols, words, cells, tiles, dict }:
  //   words: { id, word, r, c, dir: 'across'|'down', keys: cell keys in order }
  //   cells: { key, r, c, ch, given, across, down } (across/down = id of the word through it, or null)
  //   tiles: { id, ch } in a shuffled order
  //   dict: Set of every accepted word. Any filling in which every run is in it solves the puzzle.
  build() {
    let puzzle = null;
    // A puzzle whose tiles could spell something on the safety list is thrown away and redrawn.
    for (let round = 0; round < 30 && (!puzzle || puzzle.tilesBlocked); round++) {
      let best = null;
      // If the words will not fit the grid size, let it grow a little rather than give up on words.
      const side = this.maxSide;
      for (let extra = 0; extra <= 4 && !best; extra++) {
        this.maxSide = side + extra;
        for (let attempt = 0; attempt < 300 && !best; attempt++) best = this._tryBuild();
      }
      this.maxSide = side;
      // A grid with fewer words is better than no puzzle (cannot happen with the current list).
      if (!best) best = this._tryBuild(1);
      puzzle = this._finish(best);
    }
    delete puzzle.tilesBlocked;
    return puzzle;
  }

  _tryBuild(count = this.wordCount) {
    const pool = wpShuffled(this.lib);
    const first = pool.find((e) => e.letters.length >= 4) || pool[0];
    const cells = new Map(); // "r,c" -> { ch, across, down }
    const placed = [];
    const place = (entry, r, c, dir) => {
      const id = placed.length;
      placed.push({ id, ...entry, r, c, dir });
      entry.letters.forEach((ch, k) => {
        const key = (dir === 'down' ? `${r + k},${c}` : `${r},${c + k}`);
        const cell = cells.get(key) || { ch, across: null, down: null };
        cell[dir] = id;
        cells.set(key, cell);
      });
    };
    place(first, 0, 0, 'across');
    const usedWords = new Set([first.word]);

    for (let guard = 0; placed.length < count && guard < 400; guard++) {
      const entry = wpPick(pool);
      if (usedWords.has(entry.word)) continue;
      const options = [];
      for (const p of placed) {
        p.letters.forEach((pch, i) => entry.letters.forEach((ch, j) => {
          if (pch !== ch) return;
          // The new word crosses p, at p's i-th letter and its own j-th letter.
          const dir = p.dir === 'across' ? 'down' : 'across';
          const r = p.dir === 'across' ? p.r - j : p.r + i;
          const c = p.dir === 'across' ? p.c + i : p.c - j;
          if (this._fits(cells, entry.letters, r, c, dir) && !this._makesGap(cells, entry.letters, r, c, dir)) options.push({ r, c, dir });
        }));
      }
      if (!options.length) continue;
      const o = wpPick(options);
      place(entry, o.r, o.c, o.dir);
      usedWords.add(entry.word);
    }
    if (placed.length < count) return null;
    // No one-square gaps: two squares with exactly one empty position between them in a line look like
    // a missing box, and would tempt the student to fill it in.
    for (const key of cells.keys()) {
      const [r, c] = key.split(',').map(Number);
      for (const [dr, dc] of [[0, 1], [1, 0]]) {
        if (!cells.has(`${r + dr},${c + dc}`) && cells.has(`${r + 2 * dr},${c + 2 * dc}`)) return null;
      }
    }

    const rs = Array.from(cells.keys()).map((k) => +k.split(',')[0]);
    const cs = Array.from(cells.keys()).map((k) => +k.split(',')[1]);
    if (Math.max(...rs) - Math.min(...rs) + 1 > this.maxSide || Math.max(...cs) - Math.min(...cs) + 1 > this.maxSide) return null;
    return { placed, cells };
  }

  // Would these letters leave a one-square gap: two squares in a line with exactly one empty position
  // between them? That looks like a missing box, so such a placement is never used.
  _makesGap(cells, letters, r, c, dir) {
    const [dr, dc] = dir === 'down' ? [1, 0] : [0, 1];
    const taken = new Set(cells.keys());
    const fresh = [];
    for (let k = 0; k < letters.length; k++) {
      const key = `${r + dr * k},${c + dc * k}`;
      taken.add(key);
      fresh.push([r + dr * k, c + dc * k]);
    }
    for (const [rr, cc] of fresh) {
      for (const [ar, ac] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) {
        if (!taken.has(`${rr + ar},${cc + ac}`) && taken.has(`${rr + 2 * ar},${cc + 2 * ac}`)) return true;
      }
    }
    return false;
  }

  // Can `letters` go down/across from (r, c)? It may only touch other words by crossing them
  // (sharing a letter), never run alongside or end-to-end with one, so no extra words appear.
  _fits(cells, letters, r, c, dir) {
    const [dr, dc] = dir === 'down' ? [1, 0] : [0, 1];
    const n = letters.length;
    const empty = (rr, cc) => !cells.has(`${rr},${cc}`);
    if (!empty(r - dr, c - dc) || !empty(r + dr * n, c + dc * n)) return false;
    let crossings = 0;
    for (let k = 0; k < n; k++) {
      const rr = r + dr * k;
      const cc = c + dc * k;
      const existing = cells.get(`${rr},${cc}`);
      if (existing) {
        if (existing.ch !== letters[k] || existing[dir] !== null) return false;
        crossings++;
      } else if (!empty(rr + dc, cc + dr) || !empty(rr - dc, cc - dr)) {
        return false;
      }
    }
    return crossings >= 1;
  }

  _finish({ placed, cells }) {
    const rs = Array.from(cells.keys()).map((k) => +k.split(',')[0]);
    const cs = Array.from(cells.keys()).map((k) => +k.split(',')[1]);
    const r0 = Math.min(...rs);
    const c0 = Math.min(...cs);
    const keyOf = (r, c) => `${r - r0},${c - c0}`;

    const cellList = Array.from(cells.entries()).map(([key, cell]) => {
      const [r, c] = key.split(',').map(Number);
      return { key: keyOf(r, c), r: r - r0, c: c - c0, ch: cell.ch, given: false, across: cell.across, down: cell.down };
    });
    const byKey = new Map(cellList.map((cell) => [cell.key, cell]));
    const words = placed.map((p) => ({
      id: p.id, word: p.word, r: p.r - r0, c: p.c - c0, dir: p.dir,
      keys: p.letters.map((ch, k) => (p.dir === 'down' ? keyOf(p.r + k, p.c) : keyOf(p.r, p.c + k))),
    }));

    // Show some letters of every word, leaving at least one square of each word to fill.
    for (const w of words) {
      const show = Math.min(w.keys.length - 1, WP_LEVELS[this.level](w.keys.length));
      for (const key of wpShuffled(w.keys).slice(0, show)) byKey.get(key).given = true;
    }
    for (const w of words) {
      if (w.keys.every((k) => byKey.get(k).given)) byKey.get(wpPick(w.keys)).given = false;
    }

    const need = cellList.filter((cell) => !cell.given).map((cell) => cell.ch);
    return {
      rows: Math.max(...cellList.map((cell) => cell.r)) + 1,
      cols: Math.max(...cellList.map((cell) => cell.c)) + 1,
      words,
      cells: cellList,
      tiles: this._tiles(need),
      tilesBlocked: this._tilesBlocked(need),
      dict: this.dict,
    };
  }

  // True if the safety list has a word that these tiles could spell.
  _tilesBlocked(need) {
    const counts = new Map();
    for (const ch of need) counts.set(kanaFold(ch), (counts.get(kanaFold(ch)) || 0) + 1);
    return this.blocked.some((w) => {
      const want = new Map();
      for (const ch of w) want.set(ch, (want.get(ch) || 0) + 1);
      return Array.from(want).every(([ch, n]) => (counts.get(ch) || 0) >= n);
    });
  }

  // The tiles: exactly the letters the empty squares need, in an order that is not the grid's and
  // that does not read as anything on the safety list.
  _tiles(need) {
    let order = wpShuffled(need);
    for (let i = 0; i < 30 && kanaFindBlocked(order.join('')); i++) order = wpShuffled(need);
    return order.map((ch, i) => ({ id: i, ch }));
  }
}
