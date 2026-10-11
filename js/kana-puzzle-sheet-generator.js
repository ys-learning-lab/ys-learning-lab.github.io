// Printable Kana Word Puzzle (kana-puzzle-sheet.html): the same crossword as the online Kana Word
// Puzzle, on paper. The student writes one kana in each empty box so every across and down run is a
// real word, using each kana from the list once. Boxes are as large as the page allows, so the
// grid uses the whole sheet. The answer key shows the grid filled in.
// Needs kana-word-puzzle-generator.js (KanaWordPuzzleGenerator), kana-safety.js, pdf-common.js,
// pdf-lang.js and pdf-lang-puzzlesheet.js on the page.

const PS_WORDS_MIN = 7;
const PS_WORDS_MAX = 15;
const PS_WORDS_DEFAULT = 10;
const PS_MAX_SIDE = 10;   // up to 13 words fit in 10 x 10 squares, so the boxes can stay large
const PS_MAX_SIDE_BIG = 12; // 14 or 15 words need up to 12 x 12 (still no one-square gaps)
const PS_PUZZLES_MAX = 3;
const PS_BOX_MAX = 72;    // pt; also keeps a small grid from looking oversized

// `count` freshly drawn puzzles for the given settings.
function psBuildPuzzles({ words, level, puzzles }) {
  const out = [];
  for (let i = 0; i < puzzles; i++) {
    out.push(new KanaWordPuzzleGenerator({ words, level, wordsMin: PS_WORDS_MIN, wordsMax: PS_WORDS_MAX, maxSide: words > 13 ? PS_MAX_SIDE_BIG : PS_MAX_SIDE }).build());
  }
  return out;
}

class KanaPuzzleSheetRenderer {
  constructor(config, puzzles) {
    this.config = config; // { pdfLang, title, teacher, includeAnswerKey }
    this.puzzles = puzzles;
    this.fonts = null;
    // PDF_TEXT keys for the header; the word search sheet reuses this class's header with its own.
    this.keys = { default: 'psheet.default', keySuffix: 'psheet.keySuffix', intro: 'psheet.intro', keyNote: 'psheet.keyNote', footer: 'psheet.footer' };
  }

  async render() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc, this.config.pdfLang);
    const batch = getWorksheetBatchCode();
    this.puzzles.forEach((puzzle, i) => this._drawPage(pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]), puzzle, i, false, `${batch}-A-${i + 1}`));
    if (this.config.includeAnswerKey) {
      this.puzzles.forEach((puzzle, i) => this._drawPage(pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]), puzzle, i, true, `${batch}-A-${i + 1}`));
    }
    return pdfDoc.save();
  }

  get baseTitle() { return pdfTitle(this.config.pdfLang, this.config.title, this.keys.default); }

  _t(key, vars) { return pdfText(this.config.pdfLang, key, vars); }

  _width(text, size) { return pdfFontFor(this.fonts, text).widthOfTextAtSize(text, size); }

  _draw(page, text, x, y, size, color) {
    page.drawText(text, { x, y, size, font: pdfFontFor(this.fonts, text), color: color || PDFLib.rgb(0, 0, 0) });
  }

  // One sheet: header, the list of kana to use, then the grid as large as the rest of the page allows.
  _drawPage(page, puzzle, index, isKey, code) {
    const margin = PDF_PAGE.MARGIN;
    let top = this._drawHeader(page, isKey, code) - 10;
    if (this.puzzles.length > 1) {
      this._draw(page, this._t('psheet.puzzle', { n: index + 1 }), margin, top - 10, 12);
      top -= 20;
    }
    if (!isKey) top = this._drawKanaList(page, puzzle, top);
    this._drawGrid(page, puzzle, top - 6, isKey);
  }

  // The kana the student has to place, in boxes to cross out. Returns the y under them.
  _drawKanaList(page, puzzle, top) {
    const margin = PDF_PAGE.MARGIN;
    const { notoSansJP } = this.fonts;
    this._draw(page, this._t('psheet.kana'), margin, top - 9, 9, PDFLib.rgb(0.35, 0.35, 0.35));
    const gap = 6;
    const size = 32;
    const perRow = Math.max(1, Math.floor((PDF_PAGE.WIDTH - margin * 2 + gap) / (size + gap)));
    let y = top - 16;
    puzzle.tiles.forEach((tile, i) => {
      const col = i % perRow;
      if (i > 0 && col === 0) y -= size + gap;
      const x = margin + col * (size + gap);
      drawBoxOutline(page, x, y - size, size, size, { width: 1.2 });
      const fs = size * 0.62;
      page.drawText(tile.ch, { x: x + (size - notoSansJP.widthOfTextAtSize(tile.ch, fs)) / 2, y: y - size + size * 0.24, size: fs, font: notoSansJP });
    });
    return y - size - 12;
  }

  _drawGrid(page, puzzle, top, isKey) {
    const bottom = 62; // clear of the footer line and the QR code
    const availW = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2;
    const fit = (cols, rows) => Math.min(PS_BOX_MAX, availW / cols, (top - bottom) / rows);
    // A crossword reads the same turned on its side (across words run down and the other way round),
    // so a grid wider than the page allows is drawn sideways when that makes the boxes bigger.
    const turned = fit(puzzle.rows, puzzle.cols) > fit(puzzle.cols, puzzle.rows) + 0.5;
    const dispCols = turned ? puzzle.rows : puzzle.cols;
    const box = fit(dispCols, turned ? puzzle.cols : puzzle.rows);
    const x0 = (PDF_PAGE.WIDTH - box * dispCols) / 2;
    const { notoSansJP } = this.fonts;
    const grey = PDFLib.rgb(0.35, 0.35, 0.35);
    const faint = PDFLib.rgb(0.78, 0.78, 0.78);
    const fs = box * 0.58;
    for (const cell of puzzle.cells) {
      const x = x0 + (turned ? cell.r : cell.c) * box;
      const y = top - ((turned ? cell.c : cell.r) + 1) * box;
      if (cell.given) page.drawRectangle({ x, y, width: box, height: box, color: PDFLib.rgb(0.88, 0.89, 0.9) });
      drawBoxOutline(page, x, y, box, box, { width: 1.4 });
      if (!cell.given && !isKey && box >= 28) {
        drawLineSeg(page, x + box / 2, y + 3, x + box / 2, y + box - 3, 0.4, [2, 2], faint);
        drawLineSeg(page, x + 3, y + box / 2, x + box - 3, y + box / 2, 0.4, [2, 2], faint);
      }
      if (cell.given || isKey) {
        page.drawText(cell.ch, {
          x: x + (box - notoSansJP.widthOfTextAtSize(cell.ch, fs)) / 2, y: y + box * 0.22, size: fs, font: notoSansJP,
          color: cell.given ? grey : PDFLib.rgb(0, 0, 0),
        });
      }
    }
  }

  // Title, name / date / teacher / class lines, print code, intro text and footer. Returns the y
  // just under the intro, where the puzzle starts.
  _drawHeader(page, isKey, codeText) {
    const t = (key, vars) => this._t(key, vars);
    const margin = PDF_PAGE.MARGIN;
    this._draw(page, this.baseTitle + (isKey ? t(this.keys.keySuffix) : ''), margin, PDF_PAGE.HEIGHT - 40, 14);
    this._draw(page, t('hdr.name'), margin, PDF_PAGE.HEIGHT - 62, 12);
    this._draw(page, t('hdr.date'), 320, PDF_PAGE.HEIGHT - 62, 12);
    const teacher = (this.config.teacher || '').trim();
    this._draw(page, t('hdr.teacher', { name: teacher || '_________________________' }), margin, PDF_PAGE.HEIGHT - 82, 12);
    this._draw(page, t('hdr.class'), 320, PDF_PAGE.HEIGHT - 82, 12);

    const code = t('quiz.code', { code: codeText });
    this._draw(page, code, PDF_PAGE.WIDTH - margin - this._width(code, 8), PDF_PAGE.HEIGHT - 44, 8, PDFLib.rgb(0.3, 0.3, 0.3));

    const intro = isKey ? t(this.keys.keyNote) : t(this.keys.intro);
    const font = pdfFontFor(this.fonts, intro);
    let y = PDF_PAGE.HEIGHT - 100;
    for (const line of pdfWrap(intro, font, 9, PDF_PAGE.WIDTH - margin * 2)) {
      page.drawText(line, { x: margin, y, size: 9, font, color: PDFLib.rgb(0.3, 0.3, 0.3) });
      y -= 11;
    }

    const footer = t(this.keys.footer);
    page.drawText(footer, {
      x: PDF_PAGE.WIDTH / 2 - this._width(footer, 10) / 2, y: 28, size: 10, font: pdfFontFor(this.fonts, footer), color: PDFLib.rgb(0.5, 0.5, 0.5),
    });
    try {
      drawQrCode(page, 'https://ys-learning-lab.github.io/', PDF_PAGE.WIDTH - margin - 32, 20, 32);
    } catch (e) {
      console.warn('QR code unavailable (qrcode-generator failed to load?):', e);
    }
    return y + 4;
  }
}
