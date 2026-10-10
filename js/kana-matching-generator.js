// Kana matching worksheet: two vertical columns of kana (or romaji) per set, the
// right column shuffled, and the student draws a line from each item on the left
// to its partner on the right. Separate from japanese-generator.js (the
// hiragana<->katakana *conversion* quiz, where the student writes the answer).
//
// Each entry is [hiragana, katakana, romaji]. Romaji must be unique within a
// set, so the rarely-used ぢ / づ get "di" / "du" instead of sharing じ / ず's
// "ji" / "zu" (otherwise two different kana would have the same correct match).

const MATCH_ROWS = [
  { id: 'A', group: 'basic', label: 'ア行', items: [['あ', 'ア', 'a'], ['い', 'イ', 'i'], ['う', 'ウ', 'u'], ['え', 'エ', 'e'], ['お', 'オ', 'o']] },
  { id: 'K', group: 'basic', label: 'カ行', items: [['か', 'カ', 'ka'], ['き', 'キ', 'ki'], ['く', 'ク', 'ku'], ['け', 'ケ', 'ke'], ['こ', 'コ', 'ko']] },
  { id: 'S', group: 'basic', label: 'サ行', items: [['さ', 'サ', 'sa'], ['し', 'シ', 'shi'], ['す', 'ス', 'su'], ['せ', 'セ', 'se'], ['そ', 'ソ', 'so']] },
  { id: 'T', group: 'basic', label: 'タ行', items: [['た', 'タ', 'ta'], ['ち', 'チ', 'chi'], ['つ', 'ツ', 'tsu'], ['て', 'テ', 'te'], ['と', 'ト', 'to']] },
  { id: 'N', group: 'basic', label: 'ナ行', items: [['な', 'ナ', 'na'], ['に', 'ニ', 'ni'], ['ぬ', 'ヌ', 'nu'], ['ね', 'ネ', 'ne'], ['の', 'ノ', 'no']] },
  { id: 'H', group: 'basic', label: 'ハ行', items: [['は', 'ハ', 'ha'], ['ひ', 'ヒ', 'hi'], ['ふ', 'フ', 'fu'], ['へ', 'ヘ', 'he'], ['ほ', 'ホ', 'ho']] },
  { id: 'M', group: 'basic', label: 'マ行', items: [['ま', 'マ', 'ma'], ['み', 'ミ', 'mi'], ['む', 'ム', 'mu'], ['め', 'メ', 'me'], ['も', 'モ', 'mo']] },
  { id: 'Y', group: 'basic', label: 'ヤ行', items: [['や', 'ヤ', 'ya'], ['ゆ', 'ユ', 'yu'], ['よ', 'ヨ', 'yo']] },
  { id: 'R', group: 'basic', label: 'ラ行', items: [['ら', 'ラ', 'ra'], ['り', 'リ', 'ri'], ['る', 'ル', 'ru'], ['れ', 'レ', 're'], ['ろ', 'ロ', 'ro']] },
  { id: 'W', group: 'basic', label: 'ワ行', items: [['わ', 'ワ', 'wa'], ['を', 'ヲ', 'wo'], ['ん', 'ン', 'n']] },
  { id: 'G', group: 'voiced', label: 'ガ行', items: [['が', 'ガ', 'ga'], ['ぎ', 'ギ', 'gi'], ['ぐ', 'グ', 'gu'], ['げ', 'ゲ', 'ge'], ['ご', 'ゴ', 'go']] },
  { id: 'Z', group: 'voiced', label: 'ザ行', items: [['ざ', 'ザ', 'za'], ['じ', 'ジ', 'ji'], ['ず', 'ズ', 'zu'], ['ぜ', 'ゼ', 'ze'], ['ぞ', 'ゾ', 'zo']] },
  { id: 'D', group: 'voiced', label: 'ダ行', items: [['だ', 'ダ', 'da'], ['ぢ', 'ヂ', 'di'], ['づ', 'ヅ', 'du'], ['で', 'デ', 'de'], ['ど', 'ド', 'do']] },
  { id: 'B', group: 'voiced', label: 'バ行', items: [['ば', 'バ', 'ba'], ['び', 'ビ', 'bi'], ['ぶ', 'ブ', 'bu'], ['べ', 'ベ', 'be'], ['ぼ', 'ボ', 'bo']] },
  { id: 'P', group: 'voiced', label: 'パ行', items: [['ぱ', 'パ', 'pa'], ['ぴ', 'ピ', 'pi'], ['ぷ', 'プ', 'pu'], ['ぺ', 'ペ', 'pe'], ['ぽ', 'ポ', 'po']] },
];

// Which script is shown on the left / right for each match type.
const MATCH_TYPES = {
  'h-k': { left: 0, right: 1, leftName: 'Hiragana', rightName: 'Katakana' },
  'h-r': { left: 0, right: 2, leftName: 'Hiragana', rightName: 'Romaji' },
  'k-r': { left: 1, right: 2, leftName: 'Katakana', rightName: 'Romaji' },
};

const MATCH_MAX_CHOICES = 20;
const MATCH_MAX_DECOYS = 3;

function matchShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function matchAllItems() {
  return MATCH_ROWS.flatMap((r) => r.items);
}

class KanaMatchingGenerator {
  // config: {
  //   rowIds: string[]        rows whose kana are always included (may be empty)
  //   matchType: 'h-k'|'h-r'|'k-r'
  //   count: number           choices in EACH column, 2-20 (trick choices included)
  //   regularPct: number      % basic kana among the randomly added kana (rest: dakuten/handakuten)
  //   shuffleLeft: boolean    shuffle the left column instead of following the kana table order
  //   trick: boolean, decoyCount: number   per column; the same number is added to both
  // }
  constructor(config) {
    this.config = config;
  }

  get count() {
    return Math.max(2, Math.min(MATCH_MAX_CHOICES, this.config.count || 5));
  }

  // Trick choices per column. They count toward the total, and at least 2 real
  // pairs always remain.
  get decoyCount() {
    if (!this.config.trick) return 0;
    return Math.max(0, Math.min(MATCH_MAX_DECOYS, this.config.decoyCount || 1, this.count - 2));
  }

  selectedItems() {
    return MATCH_ROWS.filter((r) => this.config.rowIds.includes(r.id)).flatMap((r) => r.items);
  }

  // `n` distinct kana from outside `exclude`, about regularPct% basic and the
  // rest dakuten/handakuten (clamped, then topped up, if a pool runs short).
  _randomFill(n, exclude) {
    const skip = new Set(exclude.map((i) => i[0]));
    const pct = Math.max(0, Math.min(100, Number.isFinite(this.config.regularPct) ? this.config.regularPct : 70));
    const pool = (group) => matchShuffle(MATCH_ROWS.filter((r) => r.group === group).flatMap((r) => r.items).filter((i) => !skip.has(i[0])));
    const regular = pool('basic');
    const voiced = pool('voiced');
    const voicedCount = Math.min(voiced.length, Math.round(n * (100 - pct) / 100));
    const regularCount = Math.min(regular.length, n - voicedCount);
    const picked = [...regular.slice(0, regularCount), ...voiced.slice(0, voicedCount)];
    const rest = [...regular.slice(regularCount), ...voiced.slice(voicedCount)];
    while (picked.length < n && rest.length) picked.push(rest.shift());
    return picked;
  }

  // The kana that actually get matched: all of the chosen rows' kana, topped up
  // with random ones if there aren't enough, or sampled down if there are too many.
  _matchedItems(pairs) {
    const selected = this.selectedItems();
    if (selected.length >= pairs) return matchShuffle(selected).slice(0, pairs);
    return [...selected, ...this._randomFill(pairs - selected.length, selected)];
  }

  // Returns { left: [{ item, pair }], right: [{ item, pair }] } with equal
  // lengths. `pair` is a shared id for a matched kana and null for a trick
  // choice, so a left entry's partner is the right entry with the same pair id.
  // Trick choices appear on both sides, in random positions, using different
  // kana on each side (so a left trick choice can never match a right one).
  buildSet() {
    // Neither column may spell something inappropriate when read top to bottom
    // (see js/kana-safety.js); the sets are random, so just draw again.
    let set;
    for (let attempt = 0; attempt < 300; attempt++) {
      set = this._buildSetOnce();
      const column = (side) => side.map((e) => e.item[0]).join('');
      if (!kanaFindBlocked(column(set.left)) && !kanaFindBlocked(column(set.right))) break;
    }
    return set;
  }

  _buildSetOnce() {
    const d = this.decoyCount;
    const matched = this._matchedItems(this.count - d);
    const order = new Map(matchAllItems().map((item, i) => [item[0], i]));

    const ordered = this.config.shuffleLeft
      ? matchShuffle(matched.map((item, pair) => ({ item, pair })))
      : matched.map((item, pair) => ({ item, pair })).sort((a, b) => order.get(a.item[0]) - order.get(b.item[0]));

    const used = new Set(matched.map((i) => i[0]));
    const decoyKana = matchShuffle(matchAllItems().filter((i) => !used.has(i[0]))).slice(0, d * 2);
    const left = ordered.slice();
    for (const item of decoyKana.slice(0, d)) {
      left.splice(Math.floor(Math.random() * (left.length + 1)), 0, { item, pair: null });
    }

    const rightPool = [...matched.map((item, pair) => ({ item, pair })), ...decoyKana.slice(d).map((item) => ({ item, pair: null }))];
    let right = matchShuffle(rightPool);
    // No partner straight across from its own item.
    for (let attempt = 0; attempt < 500 && right.some((e, j) => e.pair !== null && e.pair === left[j].pair); attempt++) {
      right = matchShuffle(rightPool);
    }
    // Mixed scripts (hiragana <-> katakana only): every box picks hiragana or
    // katakana at random, and its partner shows the other form, so a column can
    // hold both (left あ, カ ... right ア, か ...). Trick boxes pick independently.
    if (this.config.mixScripts && this.config.matchType === 'h-k') {
      const flip = new Map();
      for (const e of left) {
        const s = Math.random() < 0.5 ? 0 : 1;
        e.script = s;
        if (e.pair !== null) flip.set(e.pair, 1 - s);
      }
      for (const e of right) e.script = e.pair !== null ? flip.get(e.pair) : (Math.random() < 0.5 ? 0 : 1);
    }
    return { left, right };
  }
}

// ---------- PDF renderer ----------
class KanaMatchingRenderer {
  constructor(config, set) {
    this.config = config;
    this.set = set;
    this.fonts = null;
    this.type = MATCH_TYPES[config.matchType] || MATCH_TYPES['h-k'];
  }

  async render() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getFonts(pdfDoc);
    this.code = `${getWorksheetBatchCode()}-A-1`; // same print-code format as the other tools
    this.qr = this._buildAnswerQr();

    const sheet = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
    this._drawHeader(sheet, false);
    this._drawBlock(sheet, false);
    if (this.config.includeAnswerKey) {
      const key = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
      this._drawHeader(key, true);
      this._drawBlock(key, true);
    }
    return pdfDoc.save();
  }

  // The title as printed, minus the "- Answer Key" suffix.
  get baseTitle() {
    return pdfTitle(this.config.pdfLang, this.config.title, 'match.default');
  }

  // Answers for the QR / answers.html viewer, as "label:answer" entries: each left
  // box (in column order) and its partner. A trick box reads "none (X)" where X is
  // the converted kana to write beside it; trick boxes on the right follow.
  _answerString() {
    const { left, right } = this.set;
    const show = (e, side) => e.item[this._scriptOf(e, side)];
    const other = (e, side) => e.item[this._otherScript(e, side)];
    const entries = left.map((entry) => {
      if (entry.pair === null) return `${show(entry, 'left')}:none (${other(entry, 'left')})`;
      return `${show(entry, 'left')}:${show(right.find((e) => e.pair === entry.pair), 'right')}`;
    });
    for (const e of right) if (e.pair === null) entries.push(`${show(e, 'right')}:none (${other(e, 'right')})`);
    return entries.join(',');
  }

  // Worksheet-page QR (null if turned off, or too dense to stay scannable at the
  // size the header has room for - a code a phone can't focus on is worse than none).
  _buildAnswerQr() {
    if (this.config.includeAnswerQr === false) return null;
    try {
      const answers = this._answerString();
      // The title is the most variable part of the link (a Japanese title costs 9
      // characters per kana once URL-encoded), so if the code would be too dense
      // with it, retry without it: the answers page then shows a generic heading.
      for (const title of [this.baseTitle, undefined]) {
        const url = buildAnswerQrUrl({ c: this.code, t: title, a: answers });
        const fit = sizeQrForData(url, 'L', { maxSize: 64 });
        if (fit) return { url, size: fit.size };
      }
      return null;
    } catch (e) {
      console.warn('Answer QR code unavailable:', e);
      return null;
    }
  }

  get geo() {
    return {
      BOX_W: 80,
      LABEL_H: 20,
      TOP: PDF_PAGE.HEIGHT - 130, // room above for the header and the instruction lines
      BOTTOM: 64,
      WRITE_W: 44, // blank writing space outside each column
      LEFT_X: PDF_PAGE.MARGIN + 60,
      RIGHT_X: PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 60 - 80,
    };
  }

  // Row geometry: roomy boxes for short lists, shrinking so 20 rows fit the page.
  _rowGeo(rows) {
    const g = this.geo;
    const pitch = Math.max(20, Math.min(76, Math.floor((g.TOP - g.BOTTOM - g.LABEL_H) / rows)));
    const gap = Math.round(pitch * 0.24);
    return { pitch, gap, boxH: pitch - gap };
  }

  // Which script (0 hiragana, 1 katakana, 2 romaji) a box shows. Mixed sheets
  // store it on the entry; otherwise it follows the column.
  _scriptOf(entry, side) {
    return entry.script !== undefined ? entry.script : this.type[side];
  }

  // The script a trick box's real answer is written in: the other column's form
  // (for a mixed sheet, the other kana script).
  _otherScript(entry, side) {
    return entry.script !== undefined ? 1 - entry.script : this.type[side === 'left' ? 'right' : 'left'];
  }

  // The kana in the other form that a student should write beside a trick choice.
  _converted(side, entry) {
    const script = this._otherScript(entry, side);
    return { text: entry.item[script], script };
  }

  _drawBlock(page, isKey) {
    const { helvetica } = this.fonts;
    const g = this.geo;
    const { left, right } = this.set;
    const { pitch, boxH } = this._rowGeo(left.length);
    const grey = PDFLib.rgb(0.4, 0.4, 0.4);
    const black = PDFLib.rgb(0, 0, 0);
    const dotSize = Math.min(3.5, Math.max(2.2, boxH * 0.1));

    const leftMid = g.LEFT_X + g.BOX_W / 2;
    const rightMid = g.RIGHT_X + g.BOX_W / 2;
    const drawHeading = (name, mid) => {
      const text = pdfText(this.config.pdfLang, 'match.' + { Hiragana: 'hira', Katakana: 'kata', Romaji: 'romaji' }[name]);
      const font = pdfFontFor(this.fonts, text);
      page.drawText(text, { x: mid - font.widthOfTextAtSize(text, 9) / 2, y: g.TOP - 12, size: 9, font, color: grey });
    };
    const mixed = this.set.left.some((e) => e.script !== undefined);
    const drawMixedHeading = (mid) => {
      const text = pdfText(this.config.pdfLang, 'match.hira') + ' / ' + pdfText(this.config.pdfLang, 'match.kata');
      const font = pdfFontFor(this.fonts, text);
      page.drawText(text, { x: mid - font.widthOfTextAtSize(text, 9) / 2, y: g.TOP - 12, size: 9, font, color: grey });
    };
    if (mixed) { drawMixedHeading(leftMid); drawMixedHeading(rightMid); }
    else { drawHeading(this.type.leftName, leftMid); drawHeading(this.type.rightName, rightMid); }

    const rowY = (i) => g.TOP - g.LABEL_H - i * pitch - boxH; // bottom edge of row i's boxes
    const leftDot = g.LEFT_X + g.BOX_W + 14;
    const rightDot = g.RIGHT_X - 14;
    const leftSlot = { x1: g.LEFT_X - 8 - g.WRITE_W, x2: g.LEFT_X - 8 };
    const rightSlot = { x1: g.RIGHT_X + g.BOX_W + 8, x2: g.RIGHT_X + g.BOX_W + 8 + g.WRITE_W };

    const drawSide = (entries, boxX, dotX, slot, side, scriptIndex, mid) => {
      entries.forEach((entry, i) => {
        const y = rowY(i);
        drawBoxOutline(page, boxX, y, g.BOX_W, boxH, { width: 1.0 });
        const sc = this._scriptOf(entry, side);
        this._drawCentered(page, entry.item[sc], sc, mid, y + boxH / 2, boxH);
        page.drawCircle({ x: dotX, y: y + boxH / 2, size: dotSize, color: black });
        // A faint writing line beside every box (not just trick ones), so the
        // sheet never reveals which boxes have no match.
        drawLineSeg(page, slot.x1, y + 4, slot.x2, y + 4, 1.25, undefined, PDFLib.rgb(0.35, 0.35, 0.35));
        if (isKey && entry.pair === null) {
          const conv = this._converted(side, entry);
          this._drawCentered(page, conv.text, conv.script, (slot.x1 + slot.x2) / 2, y + 4 + Math.min(10, boxH * 0.4), boxH * 0.55);
          const r = 6;
          const cy = y + boxH / 2;
          drawLineSeg(page, dotX - r, cy - r, dotX + r, cy + r, 1.5, undefined, black);
          drawLineSeg(page, dotX - r, cy + r, dotX + r, cy - r, 1.5, undefined, black);
        }
      });
    };
    drawSide(left, g.LEFT_X, leftDot, leftSlot, 'left', this.type.left, leftMid);
    drawSide(right, g.RIGHT_X, rightDot, rightSlot, 'right', this.type.right, rightMid);

    if (!isKey) return;
    left.forEach((entry, i) => {
      if (entry.pair === null) return;
      const j = right.findIndex((e) => e.pair === entry.pair);
      drawLineSeg(page, leftDot, rowY(i) + boxH / 2, rightDot, rowY(j) + boxH / 2, 1.5, undefined, PDFLib.rgb(0.15, 0.15, 0.15));
    });
  }

  // Kana go in Noto Sans JP, romaji in Helvetica; both centered on (cx, cy)
  // and scaled to the box height.
  _drawCentered(page, text, scriptIndex, cx, cy, boxH) {
    const { notoSansJP, helvetica } = this.fonts;
    if (scriptIndex === 2) {
      const size = Math.min(26, boxH * 0.48);
      page.drawText(text, { x: cx - helvetica.widthOfTextAtSize(text, size) / 2, y: cy - size * 0.28, size, font: helvetica });
    } else {
      const size = Math.min(34, boxH * 0.62);
      page.drawText(text, { x: cx - notoSansJP.widthOfTextAtSize(text, size) / 2, y: cy - size * 0.36, size, font: notoSansJP });
    }
  }

  // Word-wraps `text` to the page's content width and draws it from `y` downward.
  _drawWrapped(page, text, y, maxWidth = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2) {
    const font = pdfFontFor(this.fonts, text);
    const size = 9;
    for (const line of pdfWrap(text, font, size, maxWidth)) {
      page.drawText(line, { x: PDF_PAGE.MARGIN, y, size, font, color: PDFLib.rgb(0.3, 0.3, 0.3) });
      y -= 11;
    }
  }

  // Header text follows the PDF language (English or Japanese); a title the user
  // typed is printed as typed.
  _drawHeader(page, isKey) {
    const lang = this.config.pdfLang;
    const t = (key, vars) => pdfText(lang, key, vars);
    const draw = (text, x, y, size, color) => page.drawText(text, { x, y, size, font: pdfFontFor(this.fonts, text), color });
    const title = this.baseTitle + (isKey ? t('match.keySuffix') : '');
    draw(title, PDF_PAGE.MARGIN, PDF_PAGE.HEIGHT - 40, 14);

    draw(t('hdr.name'), PDF_PAGE.MARGIN, PDF_PAGE.HEIGHT - 62, 12);
    draw(t('hdr.date'), 320, PDF_PAGE.HEIGHT - 62, 12);
    const teacher = (this.config.teacher || '').trim();
    draw(t('hdr.teacher', { name: teacher || '_________________________' }), PDF_PAGE.MARGIN, PDF_PAGE.HEIGHT - 82, 12);
    draw(t('hdr.class'), 320, PDF_PAGE.HEIGHT - 82, 12);

    // Answer QR, top right, worksheet pages only (the key page already shows the
    // answers). Its print code sits just below it, or at the same spot when there
    // is no QR, so key pages can be matched to their worksheets.
    const qrTop = PDF_PAGE.HEIGHT - 34;
    let qrBottom = qrTop;
    if (!isKey && this.qr) {
      qrBottom = qrTop - this.qr.size;
      try {
        drawQrCode(page, this.qr.url, PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - this.qr.size, qrBottom, this.qr.size, 'L');
      } catch (e) {
        console.warn('Answer QR code unavailable:', e);
        qrBottom = qrTop;
      }
    }
    const codeStr = t('quiz.code', { code: this.code });
    const codeFont = pdfFontFor(this.fonts, codeStr);
    page.drawText(codeStr, {
      x: PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - codeFont.widthOfTextAtSize(codeStr, 8), y: qrBottom - 12, size: 8, font: codeFont, color: PDFLib.rgb(0.3, 0.3, 0.3),
    });

    // Printed on every worksheet whether or not it has trick choices, so the
    // sheet itself gives nothing away. Wrapped narrower when the QR sits beside it.
    const fullWidth = PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2;
    if (isKey) {
      if (this.set.left.some((e) => e.pair === null)) this._drawWrapped(page, t('match.keyNote'), PDF_PAGE.HEIGHT - 100, fullWidth - 80);
    } else {
      const width = this.qr ? fullWidth - this.qr.size - 14 : fullWidth;
      this._drawWrapped(page, t('match.intro', { form: t('match.form.' + this.config.matchType) }), PDF_PAGE.HEIGHT - 100, width);
    }

    const footerText = t('match.footer');
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
