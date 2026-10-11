// Hiragana writing/tracing practice sheet - a separate tool from
// japanese-generator.js's katakana<->hiragana conversion quiz. Scope is
// deliberately narrow: just the 46 basic hiragana (no dakuten/handakuten/
// youon), selectable as a single character, a whole gyou ("row" - e.g.
// あ行), or all of them, with N trace-copy boxes per character and an
// optional example-word writing line.

const HIRAGANA_ROWS = [
  { id: 'A', label: 'あ行', chars: ['あ', 'い', 'う', 'え', 'お'] },
  { id: 'K', label: 'か行', chars: ['か', 'き', 'く', 'け', 'こ'] },
  { id: 'S', label: 'さ行', chars: ['さ', 'し', 'す', 'せ', 'そ'] },
  { id: 'T', label: 'た行', chars: ['た', 'ち', 'つ', 'て', 'と'] },
  { id: 'N', label: 'な行', chars: ['な', 'に', 'ぬ', 'ね', 'の'] },
  { id: 'H', label: 'は行', chars: ['は', 'ひ', 'ふ', 'へ', 'ほ'] },
  { id: 'M', label: 'ま行', chars: ['ま', 'み', 'む', 'め', 'も'] },
  { id: 'Y', label: 'や行', chars: ['や', 'ゆ', 'よ'] },
  { id: 'R', label: 'ら行', chars: ['ら', 'り', 'る', 'れ', 'ろ'] },
  { id: 'W', label: 'わ行', chars: ['わ', 'を', 'ん'] },
];

// A couple of common, well-known example words per character - kept short
// and simple since this is for beginners. を and ん essentially never start
// a word in Japanese, so they're intentionally left without entries; the
// renderer skips the word-practice line for any character with no list.
const HIRAGANA_WORDS = {
  'あ': ['あめ', 'あさ'], 'い': ['いぬ', 'いえ'], 'う': ['うみ', 'うさぎ'], 'え': ['えき', 'えんぴつ'], 'お': ['おに', 'おかし'],
  'か': ['かさ', 'かに'], 'き': ['きつね', 'きいろ'], 'く': ['くも', 'くつ'], 'け': ['けしごむ', 'けむり'], 'こ': ['こども', 'こおり'],
  'さ': ['さかな', 'さくら'], 'し': ['しか', 'しろ'], 'す': ['すいか', 'すし'], 'せ': ['せみ', 'せかい'], 'そ': ['そら', 'そうじ'],
  'た': ['たまご', 'たいこ'], 'ち': ['ちず', 'ちから'], 'つ': ['つき', 'つくえ'], 'て': ['てがみ', 'てんき'], 'と': ['とり', 'とけい'],
  'な': ['なつ', 'なみだ'], 'に': ['にわ', 'にじ'], 'ぬ': ['ぬいぐるみ', 'ぬの'], 'ね': ['ねこ', 'ねつ'], 'の': ['のり', 'のはら'],
  'は': ['はな', 'はし'], 'ひ': ['ひこうき', 'ひまわり'], 'ふ': ['ふね', 'ふゆ'], 'へ': ['へや', 'へび'], 'ほ': ['ほし', 'ほん'],
  'ま': ['まど', 'まつり'], 'み': ['みず', 'みかん'], 'む': ['むし', 'むら'], 'め': ['めがね'], 'も': ['もり', 'もも'],
  'や': ['やま', 'やさい'], 'ゆ': ['ゆき', 'ゆび'], 'よ': ['よる', 'よこ'],
  'ら': ['らくだ', 'らいおん'], 'り': ['りんご', 'りす'], 'る': ['るすばん'], 'れ': ['れいぞうこ', 'れきし'], 'ろ': ['ろうそく', 'ろば'],
  'わ': ['わに', 'わたし'],
};

// Practice words the user types themselves (single-character mode): up to 2
// words of up to 5 letters, hiragana or katakana. Only kana that exist in the
// embedded font subset are accepted (anything else would print as a blank box);
// the long-vowel mark ー isn't in that subset, so the renderer draws it as a bar.
const PRACTICE_WORD_KANA = {
  hira: 'ぁあぃいぅうぇえぉおかがきぎくぐけげこごさざしじすずせぜそぞただちぢっつづてでとどなにぬねのはばぱひびぴふぶぷへべぺほぼぽまみむめもゃやゅゆょよらりるれろわをん',
  kata: 'ァアィイゥウェエォオカガキギクグケゲコゴサザシジスズセゼソゾタダチヂッツヅテデトドナニヌネノハバパヒビピフブプヘベペホボポマミムメモャヤュユョヨラリルレロワヲンヴ',
};
const PRACTICE_WORD_MAX_LETTERS = 5;
const PRACTICE_WORD_MAX_WORDS = 2;

// Hiragana <-> katakana twins (あ <-> ア): same position in the Unicode kana
// blocks, 0x60 apart. Anything else is returned unchanged.
function toKatakana(ch) {
  const code = ch.codePointAt(0);
  return code >= 0x3041 && code <= 0x3096 ? String.fromCodePoint(code + 0x60) : ch;
}

function toHiragana(ch) {
  const code = ch.codePointAt(0);
  return code >= 0x30A1 && code <= 0x30F6 ? String.fromCodePoint(code - 0x60) : ch;
}

// Hiragana and katakana are practiced separately, so a word's letter only counts
// as the selected character when it is that exact character.
function isPracticeTarget(selected, letter) {
  return letter === selected;
}

// Returns { words, valid, missing, blocked } (blocked: typed words the safety list refuses). Blank entries are dropped; if every entry is
// blank, words is [] and the renderer falls back to the built-in example words.
// `valid` is false for characters outside `script` ('hira' | 'kata', plus ー) or
// too many letters; `missing` is true when a word doesn't contain `selected`
// (when given) - such words are left out.
// ASCII/full-width hyphens are read as ー for convenience.
function parsePracticeWords(rawWords, selected, script = 'hira') {
  const allowed = PRACTICE_WORD_KANA[script === 'kata' ? 'kata' : 'hira'];
  const words = [];
  let valid = true;
  let missing = false;
  const blocked = [];
  for (const raw of rawWords.slice(0, PRACTICE_WORD_MAX_WORDS)) {
    const word = String(raw || '').normalize('NFC').replace(/[\s\u3000]/g, '').replace(/[-\uFF0D]/g, 'ー');
    if (!word) continue;
    const letters = Array.from(word);
    const ok = letters.length <= PRACTICE_WORD_MAX_LETTERS
      && letters.every((ch, i) => allowed.includes(ch) || (ch === 'ー' && i > 0));
    if (!ok) { valid = false; continue; }
    if (kanaWordBlocked(word)) { blocked.push(word); continue; }
    if (selected && !letters.some((c) => isPracticeTarget(selected, c))) { missing = true; continue; }
    words.push(word);
  }
  return { words, valid, missing, blocked };
}

// "Selected characters" mode: letters typed or pasted into a text box (or handed over
// from Kana Tap Practice). Hiragana and katakana are both accepted and kept exactly as
// typed, so one sheet can mix them. The 46 basic kana plus the dakuten/handakuten kana
// (が, ぱ ...) can be practiced; anything else is reported back as skipped.
// Needs js/japanese-generator.js (KanaDatabase) on the page.
// Returns { chars (in typed order, no repeats), skipped (distinct, in typed order) }.
const VOICED_KANA = 'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ';

// Typing works like the Kana Conversion Quiz's "Always include" box (KanaDatabase.parseKanaList in
// japanese-generator.js): kana, with or without separators, or romaji ("a, ka, ga" or "akaga"),
// which becomes `romajiScript` ('hira' or 'kata'). A kana pair like ぎゃ is one unit there, but it
// won't fit in a practice box, so it comes back as skipped along with anything unrecognized.
function parseCustomChars(text, romajiScript = 'hira') {
  const allowed = new Set([...HIRAGANA_ROWS.flatMap((r) => r.chars), ...VOICED_KANA]);
  const parsed = new KanaDatabase().parseKanaList(text, romajiScript);
  const chars = parsed.chars.filter((c) => Array.from(c).length === 1 && allowed.has(toHiragana(c)));
  const skipped = [...parsed.chars.filter((c) => !chars.includes(c)), ...parsed.unknown];
  return { chars, skipped };
}

// Practice boxes per character come in whole columns of 5, and at most 5 columns (25 boxes)
// so one character's whole set always fits on a single page. Rounds to the nearest step.
const PRACTICE_REPEAT_STEP = 5;
const PRACTICE_REPEAT_MAX = 25;

function normalizePracticeRepeats(value, fallback) {
  const n = parseInt(value, 10);
  const stepped = Math.round((Number.isNaN(n) ? fallback : n) / PRACTICE_REPEAT_STEP) * PRACTICE_REPEAT_STEP;
  return Math.max(PRACTICE_REPEAT_STEP, Math.min(PRACTICE_REPEAT_MAX, stepped));
}

class HiraganaPracticeGenerator {
  constructor(config) {
    this.config = config;
  }

  // Returns the flat, ordered list of characters to practice based on
  // config.mode ('single' | 'row' | 'custom' | 'all').
  selectedChars() {
    // Single mode already holds the chosen character in the right script (it comes
    // straight from the dropdown); row/all come from the hiragana table and are
    // converted for katakana.
    const inScript = (chars) => (this.config.script === 'kata' ? chars.map(toKatakana) : chars);
    if (this.config.mode === 'single') return this.config.singleChars;
    if (this.config.mode === 'custom') return this.config.customChars;
    if (this.config.mode === 'row') {
      return inScript(HIRAGANA_ROWS.filter((r) => this.config.selectedRows.includes(r.id)).flatMap((r) => r.chars));
    }
    return inScript(HIRAGANA_ROWS.flatMap((r) => r.chars));
  }
}

// ---------- PDF renderer ----------
class HiraganaPracticeRenderer {
  constructor(config, chars) {
    this.config = config;
    this.chars = chars;
    this.fonts = null;
  }

  async render() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc, this.config.pdfLang);

    const ROWS = 5;
    const GAP = 8;
    const usableWidth = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2;
    // Sized so 5 columns fill the page width - matches the common case (one
    // whole gyou/行 = 5 characters x 1 column each) exactly, and still gives
    // a single character (3 columns at the default 15 repetitions) large,
    // easy-to-see boxes rather than cramming them down further.
    // Floored (not just clamped) so 5 columns' cumulative width - which
    // otherwise lands within fractions of a point of usableWidth - never
    // trips the page-break check below on floating-point rounding alone.
    const boxSize = Math.floor(Math.max(40, Math.min(130, (usableWidth - 4 * GAP) / 5)));
    // The model reference character gets its own full box-sized row at the
    // top of each character's first column - sized and centered exactly
    // like the trace boxes below it, not a small aside label - so reserve
    // one more box height for it.
    const modelBoxY = (PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT) - boxSize;
    const gridTop = modelBoxY - GAP;

    let page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
    this._drawHeader(page);
    // Japanese is written/read in columns right-to-left, so the first
    // column starts at the *right* margin and each new column moves left.
    let colRightX = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN;

    let answerLayout = null;
    for (const ch of this.chars) {
      const colsNeeded = Math.max(1, Math.ceil(this.config.repeats / ROWS));
      // A character's columns stay together: if they don't all fit in what is left of this
      // page, the character starts on a new page (unless the page is still empty).
      const setWidth = colsNeeded * boxSize + (colsNeeded - 1) * GAP;
      if (colRightX - setWidth < PDF_PAGE.MARGIN && colRightX < PDF_PAGE.WIDTH - PDF_PAGE.MARGIN) {
        page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
        this._drawHeader(page);
        colRightX = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN;
      }
      for (let c = 0; c < colsNeeded; c++) {
        if (colRightX - boxSize < PDF_PAGE.MARGIN) {
          page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
          this._drawHeader(page);
          colRightX = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN;
        }
        const colX = colRightX - boxSize;
        if (c === 0) {
          drawBoxOutline(page, colX, modelBoxY, boxSize, boxSize, { width: 1.0 });
          this._drawCenteredJp(page, ch, colX + boxSize / 2, modelBoxY + boxSize / 2, boxSize * 0.8, PDFLib.rgb(0.1, 0.1, 0.1));
        }
        const startIdx = c * ROWS;
        const boxesInCol = Math.min(ROWS, this.config.repeats - startIdx);
        for (let r = 0; r < boxesInCol; r++) {
          const boxY = gridTop - (r + 1) * boxSize - r * GAP;
          this._drawTraceBox(page, ch, colX, boxY, boxSize, startIdx + r === 0);
        }
        colRightX -= boxSize + GAP;
      }

      // Example words only make sense with room to spare (single-character
      // mode, where at most 3 of the ~5 columns a page can hold are used) -
      // a whole gyou/行 already fills the page edge-to-edge with boxes.
      if (this.config.includeWords && this.config.mode === 'single' && this._wordsFor(ch).length) {
        this._drawWordColumns(page, ch, colRightX, gridTop, boxSize, GAP, this.config.hideOthers ? 'blanks' : 'trace');
        if (this.config.hideOthers) answerLayout = { ch, availRightX: colRightX, gridTop, boxSize, gap: GAP };
      }
    }

    // "Hide the other letters" leaves blanks on the worksheet, so the word(s)
    // go on a second page as the sample answer.
    if (answerLayout) {
      page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
      this._drawHeader(page, true);
      this._drawWordColumns(page, answerLayout.ch, answerLayout.availRightX, answerLayout.gridTop, answerLayout.boxSize, answerLayout.gap, 'answer');
    }

    return pdfDoc.save();
  }

  // The user's own words if they typed any, otherwise the built-in ones.
  _wordsFor(ch) {
    const custom = this.config.customWords || [];
    return custom.length ? custom : (HIRAGANA_WORDS[ch] || []);
  }

  // Centers CJK text both horizontally and vertically on (cx, cy) - full-
  // width glyphs in Noto Sans JP sit slightly above the geometric baseline
  // center, hence the small downward nudge past a naive size/2 offset.
  _drawCenteredJp(page, text, cx, cy, size, color) {
    const { notoSansJP } = this.fonts;
    const width = notoSansJP.widthOfTextAtSize(text, size);
    page.drawText(text, { x: cx - width / 2, y: cy - size * 0.36, size, font: notoSansJP, color });
  }

  // showHint: draw the letter. tone: 'hint' = faint gray to trace over, 'solid' =
  // dark, a letter that is simply given (or the sample answer).
  _drawTraceBox(page, ch, boxX, boxY, boxSize, showHint, tone = 'hint') {
    const letterColor = tone === 'solid' ? PDFLib.rgb(0.1, 0.1, 0.1) : PDFLib.rgb(0.8, 0.8, 0.8);
    drawBoxOutline(page, boxX, boxY, boxSize, boxSize, { width: 1.0 });
    const midX = boxX + boxSize / 2;
    const midY = boxY + boxSize / 2;
    const dashColor = PDFLib.rgb(0.65, 0.65, 0.65);
    drawLineSeg(page, boxX, midY, boxX + boxSize, midY, 0.5, [2, 2], dashColor);
    drawLineSeg(page, midX, boxY, midX, boxY + boxSize, 0.5, [2, 2], dashColor);
    if (showHint && ch === 'ー') {
      // The boxes read top-to-bottom like vertical writing, where the long-vowel
      // mark is a vertical stroke. (Drawn, not typeset: the font subset lacks it.)
      drawLineSeg(page, midX, midY - boxSize * 0.34, midX, midY + boxSize * 0.34, Math.max(2, boxSize * 0.06), undefined, letterColor);
    } else if (showHint) {
      this._drawCenteredJp(page, ch, midX, midY, boxSize * 0.82, letterColor);
    }
  }

  // Same box-and-crosshair rule as the main practice grid (not a single
  // wide box with the whole word squeezed into it as plain text) - each
  // character of the word gets its own box-sized cell, stacked top-to-
  // bottom in one column, just like every other trace column on the page.
  // Uses whatever horizontal room is left to the left of this character's
  // main column(s) - single-character mode only ever fills part of a
  // page's width, so there's real space here.
  // view: 'trace' = every letter faint to trace; 'blanks' = only the selected
  // character is shown (solid), the other boxes stay open; 'answer' = the whole
  // word, solid, for the sample-answer page.
  _drawWordColumns(page, ch, availRightX, gridTop, mainBoxSize, gap, view = 'trace') {
    const { helvetica } = this.fonts;
    const words = this._wordsFor(ch).slice(0, PRACTICE_WORD_MAX_WORDS);

    // Shrink the word boxes (never below a legible floor) rather than
    // silently dropping the second word - single-character mode's leftover
    // width is enough for two columns, just not always at the main grid's
    // full box size.
    const initialOffset = gap * 2;
    const availWidth = availRightX - PDF_PAGE.MARGIN - initialOffset;
    const neededForBoth = words.length * mainBoxSize + (words.length - 1) * gap;
    const boxSize = words.length > 1 && availWidth < neededForBoth
      ? Math.max(40, Math.floor((availWidth - gap) / 2))
      : mainBoxSize;

    let colRight = availRightX - initialOffset;

    for (const w of words) {
      const chars = Array.from(w);
      const colX = colRight - boxSize;
      if (colX < PDF_PAGE.MARGIN) break; // not enough room left - skip rather than overlap the main grid

      const labelStr = pdfText(this.config.pdfLang, { trace: 'practice.writeWord', blanks: 'practice.writeFit', answer: 'practice.answer' }[view]);
      const labelFont = pdfFontFor(this.fonts, labelStr);
      const labelWidth = labelFont.widthOfTextAtSize(labelStr, 9);
      page.drawText(labelStr, { x: colX + boxSize / 2 - labelWidth / 2, y: gridTop + 10, size: 9, font: labelFont, color: PDFLib.rgb(0.4, 0.4, 0.4) });

      for (let i = 0; i < chars.length; i++) {
        const boxY = gridTop - (i + 1) * boxSize - i * gap;
        if (view === 'trace') this._drawTraceBox(page, chars[i], colX, boxY, boxSize, true);
        else if (view === 'answer') this._drawTraceBox(page, chars[i], colX, boxY, boxSize, true, 'solid');
        else this._drawTraceBox(page, chars[i], colX, boxY, boxSize, isPracticeTarget(ch, chars[i]), 'solid');
      }
      colRight = colX - gap;
    }
  }

  // Header text follows the PDF language (English or Japanese); a title the user
  // typed is printed as typed. Helvetica for Latin-only text, the embedded Japanese
  // font for anything else (including a Japanese teacher name typed in English mode).
  _drawHeader(page, isSampleAnswer = false) {
    const lang = this.config.pdfLang;
    const t = (key, vars) => pdfText(lang, key, vars);
    const draw = (text, x, y, size, color) => page.drawText(text, { x, y, size, font: pdfFontFor(this.fonts, text), color });
    const custom = this.config.mode === 'custom';
    const defaultKey = custom ? 'practice.defaultKana' : this.config.script === 'kata' ? 'practice.defaultKata' : 'practice.defaultHira';
    const otherKeys = ['practice.defaultHira', 'practice.defaultKata', 'practice.defaultKana'].filter((k) => k !== defaultKey);
    const title = pdfTitle(lang, this.config.title, defaultKey, otherKeys) + (isSampleAnswer ? t('practice.sample') : '');
    draw(title, PDF_PAGE.MARGIN, PDF_PAGE.HEIGHT - 40, 14);

    draw(t('hdr.name'), PDF_PAGE.MARGIN, PDF_PAGE.HEIGHT - 62, 12);
    draw(t('hdr.date'), 320, PDF_PAGE.HEIGHT - 62, 12);
    const teacherName = (this.config.teacher || '').trim();
    draw(t('hdr.teacher', { name: teacherName || '_________________________' }), PDF_PAGE.MARGIN, PDF_PAGE.HEIGHT - 82, 12);
    draw(t('hdr.class'), 320, PDF_PAGE.HEIGHT - 82, 12);

    const footerText = t('practice.footer');
    const footerFont = pdfFontFor(this.fonts, footerText);
    page.drawText(footerText, {
      x: PDF_PAGE.WIDTH / 2 - footerFont.widthOfTextAtSize(footerText, 10) / 2, y: 28, size: 10, font: footerFont, color: PDFLib.rgb(0.5, 0.5, 0.5),
    });
    try {
      drawQrCode(page, 'https://ys-learning-lab.github.io/', PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 32, 20, 32);
    } catch (e) {
      console.warn('QR code unavailable (qrcode-generator failed to load?):', e);
    }
  }
}
