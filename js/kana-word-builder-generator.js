// Kana Word Builder (kana-word-builder.html): a printable kana-and-word sheet. The page holds two
// puzzles side by side as vertical panels. Each puzzle is a set of ten different kana; the student
// writes words made from them (each kana once per word) in columns of square boxes, top to bottom like
// the Writing Practice sheets, writes each word's points under it (one point per letter, so はし is 2
// and はしら is 3) and adds up a total. Every puzzle asks for four words in five boxes each. The answer
// key lists the words from the site's word list that the set can make.
// Needs kana-word-puzzle-generator.js (wpLibrary, wpWordPoints, wpShuffled, wpPick), kana-safety.js,
// pdf-common.js and pdf-lang.js on the page.

const WB_RACK = 10;        // kana in every set
const WB_PUZZLES = 2;      // puzzles on the sheet
const WB_BOXES = 5;        // boxes in every column: one per letter, enough for the longest list words
const WB_COLUMNS = 4;      // words asked for in every puzzle
const WB_MIN_WORDS = 7;    // list words a set must be able to make (best effort); fair play needs plenty
const WB_MAX_WORDS = 16;   // more than this and a set is thrown back as too easy to fill
const WB_CANDIDATES = 14;  // sets drawn so the two on a sheet can be matched for fairness

// Free letters: the small kana and the long-vowel mark can be used in any word without a kana from the
// set. Katakana is accepted too: a word written in katakana counts like the same word in hiragana.
// Folded to hiragana (see kanaFold), the free small kana are these.
const WB_SMALL = 'ぁぃぅぇぉゃゅょゎっ';

// Extra words the Word Builder accepts and lists in its answer key, on top of the shared list: ones
// that use free letters, and katakana words. All of five letters or fewer, written as shown.
const WB_EXTRA_WORDS = [
  // hiragana with small kana or ー
  'がっこう', 'ざっし', 'きって', 'ひっこし', 'しゅくだい', 'じゅうしょ', 'ちゃわん', 'おちゃ', 'おもちゃ', 'きょう',
  'きゅうり', 'かぼちゃ', 'じてんしゃ', 'でんしゃ', 'びょういん', 'はっぱ', 'らっぱ', 'ねっこ', 'ざっそう', 'がっき',
  'きっぷ', 'いっぽん', 'ちきゅう', 'おっと', 'まっか', 'まっすぐ', 'らーめん', 'けーき', 'かれー', 'ぼーる', 'めーる',
  // katakana
  'パン', 'ペン', 'ノート', 'ケーキ', 'ピアノ', 'ミルク', 'カメラ', 'テレビ', 'タオル', 'カレー', 'ボール', 'バス',
  'ドア', 'メロン', 'ジュース', 'コップ', 'ランプ', 'ホテル', 'ギター', 'ピザ', 'ラジオ', 'サラダ', 'レモン', 'ミキサー',
  'コアラ', 'ゴリラ', 'バナナ', 'ライオン', 'ロケット', 'ケチャップ',
];

// A kana without its dots: が -> か, ぱ -> は. The sets hold only plain kana; the dots are free.
function wbBase(ch) {
  return ch.normalize('NFD').replace(/[\u3099\u309A]/g, '').normalize('NFC');
}

// The kana of a word that must come from the set: folded to hiragana, free small kana and ー dropped,
// dots (dakuten, handakuten) taken off.
function wbCore(word) {
  return Array.from(kanaFold(word)).filter((ch) => !WB_SMALL.includes(ch)).map(wbBase);
}

// Every word a set can be checked against: the shared list plus WB_EXTRA_WORDS, five boxes or fewer,
// accepted by the safety list, each word (in either script) once.
function wbDictionary() {
  const seen = new Set();
  const out = [];
  const add = (word) => {
    const letters = Array.from(word);
    const folded = kanaFold(word);
    if (letters.length < 2 || letters.length > WB_BOXES || seen.has(folded) || kanaWordBlocked(word)) return;
    const core = wbCore(word);
    if (!core.length) return;
    seen.add(folded);
    out.push({ word, letters, core });
  };
  wpLibrary().forEach((e) => add(e.word));
  WB_EXTRA_WORDS.forEach(add);
  return out;
}

function wbLetterCounts(letters) {
  const counts = new Map();
  for (const ch of letters) counts.set(ch, (counts.get(ch) || 0) + 1);
  return counts;
}

function wbCanBuild(letters, counts) {
  for (const [ch, n] of wbLetterCounts(letters)) if ((counts.get(ch) || 0) < n) return false;
  return true;
}

class KanaWordBuilderGenerator {
  constructor() {
    this.library = wpLibrary().map((e) => ({ word: e.word, base: Array.from(e.word).map(wbBase) }));
    this.dictionary = wbDictionary();
    // Plain kana of every list word together, so common kana are drawn more often. Never a small kana.
    this.pool = this.library.flatMap((e) => e.base).filter((ch) => !WB_SMALL.includes(ch));
    // The safety list with the dots and free letters taken off, to refuse a set that could spell any of it.
    this.blocked = KANA_BLOCKED_WORDS.map((w) => wbCore(w));
  }

  // Two sets that are fair to each other: each can make plenty of list words, about as many as the
  // other, and the four best words are worth about the same.
  buildPuzzles() {
    const cands = [];
    for (let i = 0; i < WB_CANDIDATES; i++) cands.push(this._buildSet(new Set(cands.map((c) => c.seed))));
    const top = (c) => c.words.slice(0, WB_COLUMNS).reduce((sum, w) => sum + w.points, 0);
    let best = null;
    for (let i = 0; i < cands.length; i++) {
      for (let j = i + 1; j < cands.length; j++) {
        const a = cands[i];
        const b = cands[j];
        const lack = Math.max(0, WB_MIN_WORDS - Math.min(a.words.length, b.words.length));
        const cost = lack * 10 + Math.abs(a.words.length - b.words.length) * 3 + Math.abs(top(a) - top(b));
        if (!best || cost < best.cost) best = { cost, pair: [a, b] };
      }
    }
    return wpShuffled(best.pair).slice(0, WB_PUZZLES).map(({ rack, words }) => ({ rack, words }));
  }

  _buildSet(usedSeeds) {
    // Every set is built around a five-kana word with five different plain kana, so there is always a
    // long word to find. The kana in a set are all different.
    const seeds = this.library.filter((e) => e.base.length === 5 && new Set(e.base).size === 5);
    let best = null;
    for (let attempt = 0; attempt < 400; attempt++) {
      const fresh = seeds.filter((e) => !usedSeeds.has(e.word));
      const seed = wpPick(fresh.length ? fresh : seeds);
      const rack = seed.base.slice();
      const counts = wbLetterCounts(rack);
      // Fill the rest with whole list words where one fits (so the set holds more real words to
      // find), otherwise single kana from the list's letters. Never a kana the set already has.
      let guard = 0;
      while (rack.length < WB_RACK && guard++ < 200) {
        const room = WB_RACK - rack.length;
        const fits = room >= 2 && Math.random() < 0.6
          ? this.library.filter((e) => e.base.length <= room && new Set(e.base).size === e.base.length && e.base.every((ch) => !counts.has(ch)))
          : [];
        const add = fits.length ? wpPick(fits).base : [wpPick(this.pool)];
        if (add.some((ch) => counts.has(ch))) continue;
        rack.push(...add);
        for (const ch of add) counts.set(ch, 1);
      }
      if (rack.length < WB_RACK || this._spellsBlocked(counts)) continue;
      const words = this.dictionary.filter((e) => wbCanBuild(e.core, counts)).map((e) => e.word);
      if (!best || (best.words.length < WB_MIN_WORDS && words.length > best.words.length)) best = { seed: seed.word, rack, words };
      if (words.length >= WB_MIN_WORDS && words.length <= WB_MAX_WORDS) { best = { seed: seed.word, rack, words }; break; }
    }
    return {
      seed: best.seed,
      rack: this._orderRack(best.rack, best.seed),
      // Longer words first: they are worth more. Hiragana before katakana when equal.
      words: best.words
        .map((word) => ({ word, points: wpWordPoints(word) }))
        .sort((a, b) => b.points - a.points || a.word.localeCompare(b.word, 'ja')),
    };
  }

  // True if any word on the safety list can be made from these kana (dots and free letters added).
  _spellsBlocked(counts) {
    return this.blocked.some((letters) => wbCanBuild(letters, counts));
  }

  // Shuffles the kana so they don't sit in the seed word's order, nor run together as anything on
  // the safety list.
  _orderRack(rack, seed) {
    for (let i = 0; i < 30; i++) {
      const order = wpShuffled(rack);
      if (order.join('') !== seed && !kanaFindBlocked(order.join(''))) return order;
    }
    return wpShuffled(rack);
  }
}

// ---------- PDF renderer ----------
class KanaWordBuilderRenderer {
  constructor(config, puzzles) {
    this.config = config; // { pdfLang, title, teacher, includeAnswerKey }
    this.puzzles = puzzles;
    this.boxes = WB_BOXES;
    this.fonts = null;
  }

  async render() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc, this.config.pdfLang);
    this.code = `${getWorksheetBatchCode()}-A-1`;
    const sheet = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
    this._drawHeader(sheet, false);
    this._drawPanels(sheet, false);
    if (this.config.includeAnswerKey) {
      const key = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
      this._drawHeader(key, true);
      this._drawPanels(key, true);
    }
    return pdfDoc.save();
  }

  get baseTitle() { return pdfTitle(this.config.pdfLang, this.config.title, 'words.default'); }

  // The page is cut into one vertical panel per puzzle.
  get geo() {
    const margin = 30;
    const gap = 14;
    const n = this.puzzles.length;
    const usable = PDF_PAGE.WIDTH - margin * 2;
    const top = Math.min(PDF_PAGE.HEIGHT - 146, (this.headerBottom || PDF_PAGE.HEIGHT - 130) - 18);
    return { TOP: top, BOTTOM: 64, gap, panelW: (usable - (n - 1) * gap) / n, margin };
  }

  _t(key, vars) { return pdfText(this.config.pdfLang, key, vars); }

  _draw(page, text, x, y, size, color) {
    page.drawText(text, { x, y, size, font: pdfFontFor(this.fonts, text), color: color || PDFLib.rgb(0, 0, 0) });
  }

  // Like pdfWrap, but English text that holds a few Japanese characters still breaks at spaces.
  _wrap(text, font, size, maxWidth) {
    if (!/[A-Za-z]/.test(text)) return pdfWrap(text, font, size, maxWidth);
    const lines = [];
    let line = '';
    for (const word of text.split(' ')) {
      const next = line ? `${line} ${word}` : word;
      if (line && font.widthOfTextAtSize(next, size) > maxWidth) { lines.push(line); line = word; } else line = next;
    }
    if (line) lines.push(line);
    return lines;
  }

  _width(text, size) { return pdfFontFor(this.fonts, text).widthOfTextAtSize(text, size); }

  _drawPanels(page, isKey) {
    const g = this.geo;
    this.puzzles.forEach((puzzle, i) => {
      this._drawPanel(page, puzzle, i, isKey);
      if (i < this.puzzles.length - 1) {
        const x = g.margin + (i + 1) * g.panelW + i * g.gap + g.gap / 2;
        drawLineSeg(page, x, g.TOP + 4, x, g.BOTTOM, 0.5, [2, 3], PDFLib.rgb(0.6, 0.6, 0.6));
      }
    });
  }

  _drawPanel(page, puzzle, index, isKey) {
    const g = this.geo;
    const { notoSansJP } = this.fonts;
    const x0 = g.margin + index * (g.panelW + g.gap);

    this._draw(page, this._t('words.puzzle', { n: index + 1 }), x0, g.TOP - 8, 11);

    // The kana: small, in as many rows as the panel needs, so the writing boxes get the room.
    const gap = 4;
    const n = puzzle.rack.length;
    const perRow = Math.max(1, Math.floor((g.panelW + gap) / (26 + gap)));
    const rows = Math.ceil(n / perRow);
    const inRow = Math.ceil(n / rows);
    const tile = Math.min(34, (g.panelW - (inRow - 1) * gap) / inRow);
    const tilesTop = g.TOP - 16;
    puzzle.rack.forEach((ch, i) => {
      const r = Math.floor(i / inRow);
      const x = x0 + (i % inRow) * (tile + gap);
      const y = tilesTop - (r + 1) * tile - r * gap;
      drawBoxOutline(page, x, y, tile, tile, { width: 1.2 });
      const size = tile * 0.62;
      page.drawText(ch, { x: x + (tile - notoSansJP.widthOfTextAtSize(ch, size)) / 2, y: y + tile * 0.26, size, font: notoSansJP });
    });
    const tilesBottom = tilesTop - rows * tile - (rows - 1) * gap;

    if (isKey) this._drawKeyWords(page, puzzle, x0, g.panelW, tilesBottom - 18, g.BOTTOM);
    else this._drawWriteArea(page, puzzle, x0, g.panelW, tilesBottom - 14);
  }

  // Columns of square boxes, filled from the panel's right edge like Japanese is read: each word is
  // written top to bottom, one letter per box, with a small box under it for its points. The total
  // goes under them.
  _drawWriteArea(page, puzzle, x0, panelW, top) {
    const g = this.geo;
    const grey = PDFLib.rgb(0.35, 0.35, 0.35);
    const faint = PDFLib.rgb(0.75, 0.75, 0.75);
    const cols = WB_COLUMNS;
    const ptsH = 22;
    const totalH = 30;
    const colGap = 5;
    const room = top - (g.BOTTOM + 8) - ptsH - 8 - totalH - 10;
    const box = Math.max(16, Math.min(80, (panelW - (cols - 1) * colGap) / cols, room / this.boxes));
    for (let c = 0; c < cols; c++) {
      const x = x0 + panelW - box - c * (box + colGap);
      for (let j = 0; j < this.boxes; j++) {
        const y = top - (j + 1) * box;
        drawBoxOutline(page, x, y, box, box, { width: 1.1, color: grey });
        drawLineSeg(page, x + box / 2, y + 2, x + box / 2, y + box - 2, 0.4, [2, 2], faint);
        drawLineSeg(page, x + 2, y + box / 2, x + box - 2, y + box / 2, 0.4, [2, 2], faint);
      }
      drawBoxOutline(page, x, top - this.boxes * box - 6 - ptsH, box, ptsH, { width: 1.1, color: grey });
    }
    const rowY = top - this.boxes * box - 6 - ptsH;
    const total = this._t('words.total');
    const totalY = rowY - 14 - totalH;
    this._draw(page, total, x0, totalY + 10, 11);
    drawBoxOutline(page, x0 + this._width(total, 11) + 8, totalY, 56, totalH, { width: 1.2 });
  }

  // The list words this rack can make, wrapped across the panel.
  _drawKeyWords(page, puzzle, x0, panelW, top, bottom) {
    const { helvetica, notoSansJP } = this.fonts;
    const size = 14;
    const lineH = 22;
    this._draw(page, this._t('words.keyList'), x0, top, 8, PDFLib.rgb(0.4, 0.4, 0.4));
    let x = x0;
    let y = top - lineH + 4;
    for (const { word, points } of puzzle.words) {
      const pts = ` (${points})`;
      const w = notoSansJP.widthOfTextAtSize(word, size) + helvetica.widthOfTextAtSize(pts, 9) + 14;
      if (x > x0 && x + w > x0 + panelW) { x = x0; y -= lineH; }
      if (y < bottom) return;
      page.drawText(word, { x, y, size, font: notoSansJP });
      page.drawText(pts, { x: x + notoSansJP.widthOfTextAtSize(word, size), y, size: 9, font: helvetica, color: PDFLib.rgb(0.4, 0.4, 0.4) });
      x += w;
    }
  }

  _drawHeader(page, isKey) {
    const t = (key, vars) => this._t(key, vars);
    const margin = PDF_PAGE.MARGIN;
    this._draw(page, this.baseTitle + (isKey ? t('words.keySuffix') : ''), margin, PDF_PAGE.HEIGHT - 40, 14);
    this._draw(page, t('hdr.name'), margin, PDF_PAGE.HEIGHT - 62, 12);
    this._draw(page, t('hdr.date'), 320, PDF_PAGE.HEIGHT - 62, 12);
    const teacher = (this.config.teacher || '').trim();
    this._draw(page, t('hdr.teacher', { name: teacher || '_________________________' }), margin, PDF_PAGE.HEIGHT - 82, 12);
    this._draw(page, t('hdr.class'), 320, PDF_PAGE.HEIGHT - 82, 12);

    // Print code, top right: the key page carries the same code as its worksheet page.
    const code = t('quiz.code', { code: this.code });
    this._draw(page, code, PDF_PAGE.WIDTH - margin - this._width(code, 8), PDF_PAGE.HEIGHT - 44, 8, PDFLib.rgb(0.3, 0.3, 0.3));

    const intro = isKey ? t('words.keyNote') : t('words.intro');
    const font = pdfFontFor(this.fonts, intro);
    let y = PDF_PAGE.HEIGHT - 100;
    for (const line of pdfWrap(intro, font, 9, PDF_PAGE.WIDTH - margin * 2)) {
      page.drawText(line, { x: margin, y, size: 9, font, color: PDFLib.rgb(0.3, 0.3, 0.3) });
      y -= 11;
    }

    if (!isKey) {
      const free = t('words.free');
      const freeFont = pdfFontFor(this.fonts, free);
      y -= 2;
      for (const line of this._wrap(free, freeFont, 9, PDF_PAGE.WIDTH - margin * 2)) {
        page.drawText(line, { x: margin, y, size: 9, font: freeFont, color: PDFLib.rgb(0.3, 0.3, 0.3) });
        y -= 11;
      }
    }

    this.headerBottom = y;

    const footer = t('words.footer');
    page.drawText(footer, {
      x: PDF_PAGE.WIDTH / 2 - this._width(footer, 10) / 2, y: 28, size: 10, font: pdfFontFor(this.fonts, footer), color: PDFLib.rgb(0.5, 0.5, 0.5),
    });
    try {
      drawQrCode(page, 'https://ys-learning-lab.github.io/', PDF_PAGE.WIDTH - margin - 32, 20, 32);
    } catch (e) {
      console.warn('QR code unavailable (qrcode-generator failed to load?):', e);
    }
  }
}
