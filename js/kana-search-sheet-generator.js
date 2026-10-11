// Printable Kana Word Search (kana-search-sheet.html): the same grids as the online Kana Word Search, on
// paper. The student circles words they find, writes each one on a line, and scores one point per letter,
// so longer words are worth more. The answer key rings every hidden word with a rounded outline along its direction and lists them.
// Needs kana-word-search-generator.js (KanaWordSearchGenerator), kana-word-dictionary.js,
// kana-puzzle-sheet-generator.js (KanaPuzzleSheetRenderer, whose header it reuses), kana-safety.js,
// pdf-common.js, pdf-lang.js and pdf-lang-searchsheet.js on the page.

const SS_PUZZLES_MAX = 3;
const SS_BOX_MAX = 56;     // pt
const SS_GRID_MAX_H = 380; // pt; leaves room under the grid for the answer lines

// Freshly drawn grids for the given settings.
function ssBuildPuzzles({ side, words, mode, puzzles }) {
  const out = [];
  for (let i = 0; i < puzzles; i++) out.push(new KanaWordSearchGenerator({ side, words, mode }).build());
  return out;
}

class KanaSearchSheetRenderer extends KanaPuzzleSheetRenderer {
  // config: { pdfLang, title, teacher, includeAnswerKey, goal }
  constructor(config, puzzles) {
    super(config, puzzles);
    this.keys = { default: 'ssheet.default', keySuffix: 'ssheet.keySuffix', intro: 'ssheet.intro', keyNote: 'ssheet.keyNote', footer: 'ssheet.footer' };
  }

  get goal() { return this.config.goal; }

  _goalFor(puzzle) { return Math.min(this.goal, puzzle.planted.length); }

  async render() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc, this.config.pdfLang);
    const batch = getWorksheetBatchCode();
    this.puzzles.forEach((puzzle, i) => this._drawPage(pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]), puzzle, i, false, `${batch}-S-${i + 1}`));
    if (this.config.includeAnswerKey) {
      this.puzzles.forEach((puzzle, i) => this._drawPage(pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]), puzzle, i, true, `${batch}-S-${i + 1}`));
    }
    return pdfDoc.save();
  }

  _drawPage(page, puzzle, index, isKey, code) {
    const margin = PDF_PAGE.MARGIN;
    let top = this._drawHeader(page, isKey, code) - 8;
    if (this.puzzles.length > 1) {
      this._draw(page, this._t('psheet.puzzle', { n: index + 1 }), margin, top - 10, 12);
      top -= 18;
    }
    if (!isKey) {
      this._draw(page, this._t('ssheet.goal', { n: this._goalFor(puzzle) }), margin, top - 10, 11);
      top -= 20;
    }
    const gridBottom = this._drawGrid(page, puzzle, top, isKey);
    if (isKey) this._drawKeyWords(page, puzzle, gridBottom - 16);
    else this._drawAnswerLines(page, puzzle, gridBottom - 16);
  }

  // The grid, as large as the page allows. Returns the y of its bottom edge.
  _drawGrid(page, puzzle, top, isKey) {
    const n = puzzle.side;
    const availW = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2;
    const box = Math.min(SS_BOX_MAX, availW / n, SS_GRID_MAX_H / n);
    const x0 = (PDF_PAGE.WIDTH - box * n) / 2;
    const { notoSansJP } = this.fonts;
    const fs = box * 0.56;
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        const x = x0 + c * box;
        const y = top - (r + 1) * box;
        drawBoxOutline(page, x, y, box, box, { width: 1 });
        const ch = puzzle.grid[r][c];
        page.drawText(ch, { x: x + (box - notoSansJP.widthOfTextAtSize(ch, fs)) / 2, y: y + box * 0.24, size: fs, font: notoSansJP });
      }
    }
    // Key: each hidden word is ringed with a rounded outline that runs the way the word does.
    if (isKey) for (const p of puzzle.planted) this._drawRing(page, p.cells, x0, top, box);
    return top - box * n;
  }

  // A capsule from the centre of a word's first square to the centre of its last, with a faint fill, so
  // the outline shows which way the word reads (across, down or slanting).
  _drawRing(page, cells, x0, top, box) {
    const centre = ([r, c]) => [x0 + (c + 0.5) * box, top - (r + 0.5) * box];
    const [ax, ay] = centre(cells[0]);
    const [bx, by] = centre(cells[cells.length - 1]);
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const ux = (bx - ax) / len;
    const uy = (by - ay) / len;
    const rad = box * 0.4;
    const nx = -uy * rad;
    const ny = ux * rad;
    // drawSvgPath's y axis points down, so points are given as (x, -y) from the page origin.
    const pt = (x, y) => `${x.toFixed(2)} ${(-y).toFixed(2)}`;
    const path = `M ${pt(ax + nx, ay + ny)} L ${pt(bx + nx, by + ny)} A ${rad} ${rad} 0 0 1 ${pt(bx - nx, by - ny)} L ${pt(ax - nx, ay - ny)} A ${rad} ${rad} 0 0 1 ${pt(ax + nx, ay + ny)} Z`;
    page.drawSvgPath(path, {
      x: 0, y: 0, color: PDFLib.rgb(0.55, 0.75, 0.5), opacity: 0.3,
      borderColor: PDFLib.rgb(0.2, 0.45, 0.2), borderWidth: 1.6, borderOpacity: 0.95,
    });
  }

  // "Words I found": numbered lines in two columns, each with a small box for the points, and a total.
  _drawAnswerLines(page, puzzle, top) {
    const margin = PDF_PAGE.MARGIN;
    const bottom = 66;
    const rowH = 26;
    this._draw(page, this._t('ssheet.found'), margin, top - 10, 10);
    const total = this._t('ssheet.total');
    const tw = this._width(total, 10);
    this._draw(page, total, PDF_PAGE.WIDTH - margin - tw - 56, top - 10, 10);
    drawBoxOutline(page, PDF_PAGE.WIDTH - margin - 50, top - 18, 50, 20, { width: 1 });
    const start = top - 26;
    const perCol = Math.max(1, Math.floor((start - bottom) / rowH));
    const slots = Math.min(this._goalFor(puzzle), perCol * 2); // one line for each word the sheet asks for
    const colW = (PDF_PAGE.WIDTH - margin * 2 - 20) / 2;
    for (let i = 0; i < slots; i++) {
      const col = i < Math.ceil(slots / 2) ? 0 : 1;
      const row = col === 0 ? i : i - Math.ceil(slots / 2);
      const x = margin + col * (colW + 20);
      const y = start - row * rowH - 18;
      this._draw(page, `${i + 1}.`, x, y + 3, 10, PDFLib.rgb(0.4, 0.4, 0.4));
      drawLineSeg(page, x + 18, y, x + colW - 40, y, 0.8);
      drawBoxOutline(page, x + colW - 34, y - 4, 34, 20, { width: 0.8 });
    }
  }

  // Answer key: every hidden word, with its letter count, under the grid.
  _drawKeyWords(page, puzzle, top) {
    const margin = PDF_PAGE.MARGIN;
    this._draw(page, this._t('ssheet.hidden'), margin, top - 10, 10, PDFLib.rgb(0.35, 0.35, 0.35));
    const words = puzzle.planted.map((p) => p.word).sort((a, b) => Array.from(b).length - Array.from(a).length);
    let x = margin;
    let y = top - 32;
    for (const w of words) {
      const label = `${w} (${Array.from(w).length})`;
      const width = this._width(label, 16) + 18;
      if (x + width > PDF_PAGE.WIDTH - margin) { x = margin; y -= 24; }
      this._draw(page, label, x, y, 16);
      x += width;
    }
  }
}
