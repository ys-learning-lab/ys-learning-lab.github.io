// Port of "math test advanced.py" (MathGenerator + MathPDFRenderer).
// All algorithms below mirror the Python 1:1 including RNG call order where
// it matters for behavioral parity (exact sequences will differ since this
// uses JS Math.random, but the shape/logic/distributions match).

// ---------- small RNG helpers mirroring Python's random module ----------
function randInt(a, b) { // inclusive both ends, like Python random.randint
  return Math.floor(Math.random() * (b - a + 1)) + a;
}
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randShuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// ---------- safe tokenized arithmetic evaluator (NO eval/Function) ----------
// Operates on an already-tokenized array like [2, '+', 3, '(', 4, '-', 1, ')'].
// Standard precedence: () > * / > + -. Returns a number or null on failure.
function evalTokens(tokens) {
  let pos = 0;
  function peek() { return tokens[pos]; }
  function next() { return tokens[pos++]; }

  function parseExpr() {
    let val = parseTerm();
    while (peek() === '+' || peek() === '-') {
      const op = next();
      const rhs = parseTerm();
      val = op === '+' ? val + rhs : val - rhs;
    }
    return val;
  }
  function parseTerm() {
    let val = parseFactor();
    while (peek() === '×' || peek() === '÷' || peek() === '*' || peek() === '/') {
      const op = next();
      const rhs = parseFactor();
      if (op === '×' || op === '*') val = val * rhs;
      else {
        if (rhs === 0) throw new Error('div by zero');
        val = val / rhs;
      }
    }
    return val;
  }
  function parseFactor() {
    const t = next();
    if (t === '(') {
      const val = parseExpr();
      if (next() !== ')') throw new Error('expected )');
      return val;
    }
    if (typeof t === 'number') return t;
    throw new Error('unexpected token ' + t);
  }

  try {
    const result = parseExpr();
    if (pos !== tokens.length) return null;
    return result;
  } catch (e) {
    return null;
  }
}

// ---------- data model defaults (mirrors OpConfig / MathConfig dataclasses) ----------
function makeOpConfig(overrides = {}) {
  return Object.assign({
    enabled: true, weight: 25, digits_left: 2, digits_right: 1, max_number: 0,
    is_vertical: false, allow_regrouping: false, pct_regrouping: 30,
    allow_remainder: false, allow_negatives: false, force_negatives: false, decimal_places: 0,
    allow_crypto: false, pct_crypto: 10, num_terms: 2, allow_zero: false,
    random_decimal_places: false,
    division_answer_digits: null,
  }, overrides);
}

function calculateMathProblemFontSize({ rows, columns, mode, has_vertical = false }) {
  const safeRows = Math.max(1, Number(rows) || 1);
  const safeColumns = Math.max(1, Number(columns) || 1);
  const cellWidth = (PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2) / safeColumns;
  const cellHeight = (PDF_PAGE.HEIGHT - PDF_PAGE.MARGIN - PDF_PAGE.HEADER_HEIGHT - 30) / safeRows;
  let minimum = 8;
  let maximum = 17;
  let widthDivisor = 10.5;
  let heightDivisor = 3;

  if (mode === 'simultaneous') {
    maximum = 24;
    widthDivisor = 11.5;
    heightDivisor = 4.45;
  } else if (mode === 'mixed_ops') {
    widthDivisor = 15.5;
  } else if (has_vertical) {
    maximum = 26;
    widthDivisor = 8;
    heightDivisor = 3.2;
  }

  const fitted = Math.min(cellWidth / widthDivisor, cellHeight / heightDivisor);
  return Math.floor(Math.max(minimum, Math.min(maximum, fitted)));
}

class MathGenerator {
  constructor(config) {
    this.config = config; // { rows, columns, num_pages, randomize_order, mode, ops, mixed_config, simultaneous_config }
  }

  _formatVal(val, decimals) {
    if (decimals === 0) return Math.round(val);
    const f = Math.pow(10, decimals);
    return Math.round(val * f) / f;
  }

  _getTermBounds(opCfg, digits) {
    const digitCount = Math.max(1, Math.min(3, parseInt(digits, 10) || 1));
    const minimum = digitCount === 1 ? 1 : Math.pow(10, digitCount - 1);
    const digitMaximum = Math.pow(10, digitCount) - 1;
    const maximum = opCfg.max_number > 0 ? Math.min(digitMaximum, opCfg.max_number) : digitMaximum;
    return { minimum, maximum };
  }

  _generateSingleTerm(opCfg, allowZero, avoidOne = false, digits = opCfg.digits_left) {
    const bounds = this._getTermBounds(opCfg, digits);
    const randomDecimalPlaces = opCfg.random_decimal_places && opCfg.decimal_places > 0;
    const minVal = randomDecimalPlaces
      ? (allowZero ? 0 : 1)
      : (allowZero && bounds.minimum === 1 ? 0 : bounds.minimum);
    let raw = randInt(minVal, Math.max(minVal, bounds.maximum));
    let places = randomDecimalPlaces ? randInt(0, Math.min(3, opCfg.decimal_places)) : (opCfg.decimal_places || 0);
    let attempts = 0;
    while (avoidOne && raw / Math.pow(10, places) === 1 && attempts < 50) {
      raw = randInt(minVal, Math.max(minVal, bounds.maximum));
      places = randomDecimalPlaces ? randInt(0, Math.min(3, opCfg.decimal_places)) : (opCfg.decimal_places || 0);
      attempts++;
    }
    let val;
    if (opCfg.decimal_places > 0) {
      const f = Math.pow(10, places);
      val = Math.round((raw / f) * f) / f;
    } else {
      val = raw;
    }
    if (opCfg.allow_negatives && !opCfg.force_negatives && Math.random() < 0.5) val = -val;
    return val;
  }

  _generateStandardProblem(operator, opCfg) {
    const numTerms = opCfg.num_terms;

    for (let attempts = 0; attempts < 100; attempts++) {
      const terms = [];
      for (let i = 0; i < numTerms; i++) {
        // Multiplication/division by 1 is intentionally omitted from generated
        // practice; it produces identity facts that are too easy for these presets.
        const avoid1 = operator === '×' || operator === '÷';
        const digits = i === 0 ? opCfg.digits_left : opCfg.digits_right;
        terms.push(this._generateSingleTerm(opCfg, opCfg.allow_zero, avoid1, digits));
      }

      if (opCfg.force_negatives && !terms.some((term) => term < 0)) {
        const nonzeroIndexes = terms.map((term, index) => term !== 0 ? index : -1).filter((index) => index >= 0);
        if (!nonzeroIndexes.length) continue;
        const negativeIndex = randChoice(nonzeroIndexes);
        terms[negativeIndex] = -Math.abs(terms[negativeIndex]);
      }

      if (operator === '+') {
        let ans = terms.reduce((a, b) => a + b, 0);
        ans = this._formatVal(ans, opCfg.decimal_places);
        const expr = [];
        terms.forEach((t, i) => { if (i > 0) expr.push('+'); expr.push(t); });
        return [expr, ans];
      }

      if (operator === '-') {
        if (!opCfg.allow_negatives) terms.sort((a, b) => b - a);
        let ans = terms[0];
        for (let i = 1; i < terms.length; i++) ans -= terms[i];
        ans = this._formatVal(ans, opCfg.decimal_places);
        const expr = [];
        terms.forEach((t, i) => { if (i > 0) expr.push('-'); expr.push(t); });
        return [expr, ans];
      }

      if (operator === '×') {
        let ans = terms[0];
        for (let i = 1; i < terms.length; i++) ans *= terms[i];
        ans = this._formatVal(ans, opCfg.decimal_places * numTerms);
        const expr = [];
        terms.forEach((t, i) => { if (i > 0) expr.push('×'); expr.push(t); });
        return [expr, ans];
      }

      if (operator === '÷') {
        const dividendBounds = this._getTermBounds(opCfg, opCfg.digits_left);
        const divisorBounds = this._getTermBounds(opCfg, opCfg.digits_right);
        const divisorMin = Math.max(2, divisorBounds.minimum);
        const divisorMax = divisorBounds.maximum;
        if (divisorMin > divisorMax) continue;

        let divisor = randInt(divisorMin, divisorMax);
        if (opCfg.allow_remainder && opCfg.decimal_places === 0 && !opCfg.force_negatives) {
          const quotientMin = Math.max(1, Math.ceil((dividendBounds.minimum - (divisor - 1)) / divisor));
          const quotientMax = Math.floor((dividendBounds.maximum - 1) / divisor);
          if (quotientMin > quotientMax) continue;
          const quotient = randInt(quotientMin, quotientMax);
          const remainder = randInt(1, divisor - 1);
          const dividend = quotient * divisor + remainder;
          if (dividend < dividendBounds.minimum || dividend > dividendBounds.maximum) continue;
          return [[dividend, '÷', divisor], `${quotient} R ${remainder}`];
        }

        // Do not emit same-number facts such as 7 ÷ 7. A quotient of at least
        // two keeps division practice meaningfully different from identity.
        let quotientMin = Math.max(2, Math.ceil(dividendBounds.minimum / divisor));
        let quotientMax = Math.floor(dividendBounds.maximum / divisor);
        const quotientMode = opCfg.division_answer_digits;
        if (quotientMode === 'one' || quotientMode === 'mostly_two') {
          const preferTwoDigit = quotientMode === 'mostly_two' && Math.random() < 0.9;
          if (preferTwoDigit) {
            quotientMin = Math.max(quotientMin, 10);
          } else {
            quotientMax = Math.min(quotientMax, 9);
          }
        }
        if (quotientMin > quotientMax) continue;
        let quotient = randInt(quotientMin, quotientMax);
        let dividend = quotient * divisor;
        if (opCfg.force_negatives) {
          if (Math.random() < 0.5) dividend = -dividend;
          else divisor = -divisor;
          quotient = -quotient;
        } else if (opCfg.allow_negatives) {
          const negativeDividend = Math.random() < 0.5;
          const negativeDivisor = Math.random() < 0.5;
          if (negativeDividend) dividend = -dividend;
          if (negativeDivisor) divisor = -divisor;
          if (negativeDividend !== negativeDivisor) quotient = -quotient;
        }
        return [[dividend, '÷', divisor], this._formatVal(quotient, opCfg.decimal_places)];
      }
    }
    return operator === '÷' ? [[4, '÷', 2], 2] : [[2, operator, 2], 1];
  }

  _generateCleanMixedProblem() {
    const mc = this.config.mixed_config;
    let activeOps = Object.entries(mc.enabled_ops).filter(([, v]) => v).map(([k]) => k);
    if (activeOps.length === 0) activeOps = ['+'];

    const numOps = mc.num_operations;
    const numTerms = numOps + 1;
    const ml = Math.pow(10, mc.max_digits) - 1;
    const minVal = mc.allow_zero ? 0 : 1;

    for (let attempts = 0; attempts < 400; attempts++) {
      const terms = [];
      for (let i = 0; i < numTerms; i++) {
        const t = ml >= 2 ? randInt(Math.max(minVal, 2), ml) : randInt(minVal, ml);
        terms.push(t);
      }

      const ops = [];
      for (let i = 0; i < numOps; i++) ops.push(randChoice(activeOps));
      const multiplicativeOps = activeOps.filter((op) => op === '×' || op === '÷');
      const requireMulDiv = mc.require_mul_div && multiplicativeOps.length > 0;
      if (requireMulDiv && !ops.some((op) => op === '×' || op === '÷')) {
        ops[randInt(0, ops.length - 1)] = randChoice(multiplicativeOps);
      }

      ops.forEach((op, i) => {
        if (op === '÷') {
          const divisor = randInt(2, Math.min(9, Math.abs(Math.trunc(terms[i]))));
          const quotient = randInt(2, 9);
          terms[i] = quotient * divisor;
          terms[i + 1] = divisor;
        }
      });

      let tokens = [];
      terms.forEach((t, i) => {
        tokens.push(t);
        if (i < ops.length) tokens.push(ops[i]);
      });

      const useParen = mc.use_parentheses && tokens.length >= 5 && Math.random() < 0.7;
      if (useParen) {
        if (tokens.length === 5) {
          if (Math.random() < 0.5) tokens = ['(', ...tokens.slice(0, 3), ')', ...tokens.slice(3)];
          else tokens = [...tokens.slice(0, 2), '(', ...tokens.slice(2), ')'];
        } else if (tokens.length === 7) {
          if (Math.random() < 0.5) tokens = ['(', ...tokens.slice(0, 3), ')', ...tokens.slice(3)];
          else tokens = [...tokens.slice(0, 2), '(', ...tokens.slice(2, 5), ')', ...tokens.slice(5)];
        }
      }

      try {
        if (tokens.includes('(')) {
          const pStart = tokens.indexOf('(');
          const pEnd = tokens.indexOf(')');
          const subTokens = tokens.slice(pStart + 1, pEnd);
          const subVal = evalTokens(subTokens);
          if (subVal === null || subVal < 0) continue;
        }

        let ans = evalTokens(tokens);
        if (ans === null) continue;
        if (!mc.allow_negatives && ans < 0) continue;
        if (Math.abs(ans) > 9999 || (!Number.isInteger(ans) && mc.decimal_places === 0)) continue;

        ans = this._formatVal(ans, mc.decimal_places);
        if (Math.abs(ans) > Math.pow(10, mc.max_digits + 1) - 1) continue;

        return [tokens, ans];
      } catch (e) {
        continue;
      }
    }
    if (mc.require_mul_div && (activeOps.includes('×') || activeOps.includes('÷'))) return [[2, '×', 3], 6];
    return [[2, '+', 3], 5];
  }

  _generateSimultaneousProblem() {
    const sc = this.config.simultaneous_config;
    const maxC = sc.max_coef;
    const allowNeg = sc.allow_negatives;
    const stype = sc.type;

    const formatEq = (a, b, c) => {
      let partA = a !== 1 ? `${a}x` : 'x';
      if (a === 0) partA = '';
      let partB;
      if (b > 0) {
        const raw = b !== 1 ? `+ ${b}y` : `+ y`;
        partB = partA ? raw : (b !== 1 ? `${b}y` : 'y');
      } else if (b < 0) {
        const absB = Math.abs(b);
        partB = absB !== 1 ? `- ${absB}y` : `- y`;
      } else {
        partB = '';
      }
      let lhs = `${partA} ${partB}`.trim();
      lhs = lhs.replace('+ -', '- ');
      return `${lhs} = ${c}`;
    };

    for (let attempts = 0; attempts < 300; attempts++) {
      let xVal = randInt(allowNeg ? -5 : 1, 9);
      let yVal = randInt(allowNeg ? -5 : 1, 9);
      if (xVal === 0 && yVal === 0) xVal = 1;

      const a1 = randInt(1, maxC);
      let b1 = randInt(allowNeg ? -maxC : 1, maxC);
      if (b1 === 0) b1 = 1;
      const c1 = a1 * xVal + b1 * yVal;

      if (stype === 'substitution_blank') {
        const coefficient = randInt(1, maxC);
        let constant = randInt(1, maxC);
        xVal = randInt(2, 9);
        const subtractConstant = Math.random() < 0.5;
        if (subtractConstant) constant = Math.min(constant, coefficient * xVal - 1);
        const simpleC = coefficient * xVal + (subtractConstant ? -constant : constant);
        const coefficientText = coefficient === 1 ? 'x' : `${coefficient}x`;
        const line1 = `${coefficientText} ${subtractConstant ? '-' : '+'} ${constant} = ${simpleC}`;
        const line2 = '';
        return [[line1, line2], `x = ${xVal}`, xVal, 0, 'substitution_blank'];
      } else if (stype === 'substitution_simple') {
        const line1 = formatEq(a1, b1, c1);
        const varName = randChoice(['x', 'y']);
        const valTarget = varName === 'x' ? xVal : yVal;
        const line2 = `${varName} = ${valTarget}`;
        const ansStr = `x = ${xVal}, y = ${yVal}`;
        return [[line1, line2], ansStr, xVal, yVal, 'substitution_simple'];
      } else {
        const a2 = randInt(1, maxC);
        let b2 = randInt(allowNeg ? -maxC : 1, maxC);
        if (b2 === 0) b2 = 1;
        const c2 = a2 * xVal + b2 * yVal;

        const det = a1 * b2 - a2 * b1;
        if (det === 0) continue;

        const l1 = formatEq(a1, b1, c1);
        const l2 = formatEq(a2, b2, c2);
        const ansStr = `x = ${xVal}, y = ${yVal}`;
        return [[l1, l2], ansStr, xVal, yVal, 'standard'];
      }
    }
    return [['2x + y = 5', 'x - y = 1'], 'x = 2, y = 1', 2, 1, 'standard'];
  }

  generatePages() {
    const totalItems = this.config.rows * this.config.columns;
    const pages = [];

    if (this.config.mode === 'simultaneous') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        for (let i = 0; i < totalItems; i++) {
          const [lines, ans, xV, yV, stype] = this._generateSimultaneousProblem();
          pageProblems.push({
            expr_parts: [], operator: 'simultaneous', answer: ans, is_vertical: false,
            is_cryptarithm: false, missing_index: -1,
            sim_lines: lines, sim_type: stype, sim_ans_x: xV, sim_ans_y: yV,
          });
        }
        pages.push(pageProblems);
      }
      return pages;
    }

    if (this.config.mode === 'mixed_ops') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        for (let i = 0; i < totalItems; i++) {
          const [expr, ans] = this._generateCleanMixedProblem();
          pageProblems.push({
            expr_parts: expr, operator: 'mixed', answer: ans, is_vertical: false,
            is_cryptarithm: false, missing_index: -1,
          });
        }
        pages.push(pageProblems);
      }
      return pages;
    }

    const activeOps = {};
    for (const [op, cfg] of Object.entries(this.config.ops)) {
      if (cfg.enabled && cfg.weight > 0) activeOps[op] = cfg;
    }
    if (Object.keys(activeOps).length === 0) return [];

    const totalWeight = Object.values(activeOps).reduce((s, c) => s + c.weight, 0);

    for (let p = 0; p < this.config.num_pages; p++) {
      const pageProblems = [];
      let pool = [];

      for (const [op, cfg] of Object.entries(activeOps)) {
        const count = Math.trunc((cfg.weight / totalWeight) * totalItems);
        for (let i = 0; i < count; i++) pool.push(op);
      }
      const firstKey = Object.keys(activeOps)[0];
      while (pool.length < totalItems) pool.push(firstKey);
      if (pool.length > totalItems) pool = pool.slice(0, totalItems);

      const opCounts = {};
      for (const op of Object.keys(activeOps)) {
        opCounts[op] = pool.filter((x) => x === op).length;
      }

      const opCryptoFlags = {};
      for (const [op, count] of Object.entries(opCounts)) {
        const opCfg = this.config.ops[op];
        if (!opCfg.allow_crypto || count === 0) {
          opCryptoFlags[op] = new Array(count).fill(false);
        } else {
          const numCrypto = Math.round(count * (opCfg.pct_crypto / 100.0));
          const flags = [...new Array(numCrypto).fill(true), ...new Array(count - numCrypto).fill(false)];
          randShuffle(flags);
          opCryptoFlags[op] = flags;
        }
      }

      const opCryptoPointers = {};
      for (const op of Object.keys(activeOps)) opCryptoPointers[op] = 0;

      if (this.config.randomize_order) randShuffle(pool);

      for (const operator of pool) {
        const opCfg = this.config.ops[operator];

        let isCrypto = false;
        if (opCfg.allow_crypto && opCryptoFlags[operator].length) {
          isCrypto = opCryptoFlags[operator][opCryptoPointers[operator]];
          opCryptoPointers[operator]++;
        }

        const [expr, ans] = this._generateStandardProblem(operator, opCfg);

        let missingIndex = -1;
        if (isCrypto) missingIndex = randInt(0, expr.length - 1);

        pageProblems.push({
          expr_parts: expr, operator, answer: ans,
          is_vertical: opCfg.is_vertical && expr.length === 3,
          is_cryptarithm: isCrypto, missing_index: missingIndex,
        });
      }
      pages.push(pageProblems);
    }

    return pages;
  }
}

// ---------- PDF renderer (port of MathPDFRenderer using pdf-lib) ----------
class MathPDFRenderer {
  constructor(config, pages) {
    this.config = config;
    this.pages = pages;
    this.fonts = null; // set in renderCombined() once the owning PDFDocument exists

    this.cellWidth = (PDF_PAGE.WIDTH - PDF_PAGE.MARGIN * 2) / config.columns;
    this.cellHeight = (PDF_PAGE.HEIGHT - PDF_PAGE.MARGIN - PDF_PAGE.HEADER_HEIGHT - 30) / config.rows;

    const requestedFontSize = Number(config.problem_font_size);
    if (Number.isFinite(requestedFontSize) && requestedFontSize > 0) {
      this.fontSize = Math.max(8, Math.min(26, requestedFontSize));
    } else {
      const flat = pages.flat();
      const hasVertical = flat.some((p) => p.is_vertical);
      this.fontSize = calculateMathProblemFontSize({
        rows: config.rows,
        columns: config.columns,
        mode: config.mode,
        has_vertical: hasVertical,
      });
    }
  }

  _drawText(page, text, x, y, opts = {}) {
    const fs = opts.fontOverride || this.fontSize;
    const color = opts.isRed ? PDFLib.rgb(0.9, 0.2, 0.2) : PDFLib.rgb(0, 0, 0);
    const font = opts.fontKey === 'F3' ? this.fonts.timesBold : this.fonts.helvetica;
    page.drawText(String(text), { x, y, size: fs, font, color });
  }

  _drawProblemNumber(page, probNum, x, y, fontSize = this.fontSize * 0.9) {
    const text = String(probNum);
    if (!this.config.circle_question_numbers) {
      this._drawText(page, `${text}.`, x, y, { fontOverride: fontSize, fontKey: 'F3' });
      return (text.length + 1) * this.fontSize * 0.5 * 0.9 + this.fontSize * 0.25;
    }

    const radius = Math.max(5.5, fontSize * 0.58);
    const labelSize = fontSize * (text.length >= 3 ? 0.55 : text.length === 2 ? 0.72 : 0.82);
    const centerX = x + radius;
    const centerY = y + fontSize * 0.3;
    const font = this.fonts.timesBold;
    const textWidth = font.widthOfTextAtSize(text, labelSize);
    page.drawCircle({
      x: centerX,
      y: centerY,
      size: radius,
      borderColor: PDFLib.rgb(0, 0, 0),
      borderWidth: 1,
    });
    page.drawText(text, {
      x: centerX - textWidth / 2,
      y: centerY - labelSize * 0.32,
      size: labelSize,
      font,
      color: PDFLib.rgb(0, 0, 0),
    });
    return radius * 2 + this.fontSize * 0.25;
  }

  _drawBox(page, x, y, charsWide = 2) {
    const boxWidth = this.fontSize * (charsWide * 0.5) + this.fontSize * 0.3;
    const boxHeight = this.fontSize * 1.15;
    const boxY = y - this.fontSize * 0.15;
    drawBoxOutline(page, x, boxY, boxWidth, boxHeight);
    return boxWidth;
  }

  _drawSimultaneous(page, prob, x, y, isAnswerKey, probNum) {
    const fs = this.fontSize;
    const showAnswerBoxes = isAnswerKey || this.config.show_answer_boxes !== false;
    this._drawProblemNumber(page, probNum, x + 5, y, fs);

    const eqX = x + Math.max(35, this.cellWidth * 0.12);
    const lineSpacing = Math.max(fs * 1.05, Math.min(fs * 1.55, (this.cellHeight - fs * 0.8) / 3.45));

    this._drawText(page, prob.sim_lines[0], eqX, y, { fontOverride: fs });
    if (prob.sim_type !== 'substitution_blank') {
      this._drawText(page, prob.sim_lines[1], eqX, y - lineSpacing, { fontOverride: fs });
    }

    const yAns1 = y - lineSpacing * (prob.sim_type === 'substitution_blank' ? 1.35 : 2.35);
    const yAns2 = y - lineSpacing * 3.45;

    if (prob.sim_type === 'substitution_blank') {
      this._drawText(page, 'x =', eqX, yAns1, { fontOverride: fs });
      const boxW = fs * 3.0, boxH = fs * 1.15;
      const boxX = eqX + fs * 2.0;
      const boxY = yAns1 - fs * 0.15;
      if (showAnswerBoxes) drawBoxOutline(page, boxX, boxY, boxW, boxH);
      if (isAnswerKey) this._drawText(page, String(prob.sim_ans_x), boxX + 6, yAns1, { isRed: true, fontOverride: fs });
    } else if (prob.sim_type === 'substitution_simple') {
      const targetVar = (prob.sim_lines[1].includes('x =') || prob.sim_lines[1].includes('x=')) ? 'x' : 'y';
      const missingVar = targetVar === 'x' ? 'y' : 'x';
      const ansVal = missingVar === 'x' ? prob.sim_ans_x : prob.sim_ans_y;

      this._drawText(page, `${missingVar} =`, eqX, yAns1, { fontOverride: fs });
      const boxW = fs * 3.0, boxH = fs * 1.15;
      const boxX = eqX + fs * 2.2;
      const boxY = yAns1 - fs * 0.15;
      if (showAnswerBoxes) drawBoxOutline(page, boxX, boxY, boxW, boxH);
      if (isAnswerKey) this._drawText(page, String(ansVal), boxX + 6, yAns1, { isRed: true, fontOverride: fs });
    } else {
      this._drawText(page, 'x =', eqX, yAns1, { fontOverride: fs });
      const boxW = fs * 3.0, boxH = fs * 1.15;
      const boxX = eqX + fs * 2.0;
      const boxY = yAns1 - fs * 0.15;
      if (showAnswerBoxes) drawBoxOutline(page, boxX, boxY, boxW, boxH);
      if (isAnswerKey) this._drawText(page, String(prob.sim_ans_x), boxX + 6, yAns1, { isRed: true, fontOverride: fs });

      this._drawText(page, 'y =', eqX, yAns2, { fontOverride: fs });
      const boxY2 = yAns2 - fs * 0.15;
      if (showAnswerBoxes) drawBoxOutline(page, boxX, boxY2, boxW, boxH);
      if (isAnswerKey) this._drawText(page, String(prob.sim_ans_y), boxX + 6, yAns2, { isRed: true, fontOverride: fs });
    }
  }

  _drawHorizontal(page, prob, x, y, isAnswerKey, probNum) {
    let cx = x + 4;
    const spacing = this.fontSize * 0.25;
    const charW = this.fontSize * 0.5;

    if (probNum !== undefined) {
      cx += this._drawProblemNumber(page, probNum, cx, y, this.fontSize * 0.9);
    }

    const advanceBox = (valStr) => {
      const bw = this._drawBox(page, cx, y, Math.max(valStr.length, 2));
      if (isAnswerKey) {
        const ansWidth = valStr.length * charW;
        this._drawText(page, valStr, cx + bw / 2 - ansWidth / 2, y + this.fontSize * 0.12, { isRed: true });
      }
      return bw + spacing;
    };
    const advanceText = (valStr) => {
      this._drawText(page, valStr, cx, y);
      const w = (valStr === '×' || valStr === '÷') ? 0.7 : 0.5;
      return valStr.length * this.fontSize * w + spacing;
    };

    for (let idx = 0; idx < prob.expr_parts.length; idx++) {
      const part = prob.expr_parts[idx];
      const partStr = (typeof part === 'number' && part < 0) ? `(${part})` : String(part);
      const isMissing = prob.is_cryptarithm && idx === prob.missing_index;
      cx += isMissing ? advanceBox(partStr) : advanceText(partStr);
    }

    cx += advanceText('=');

    const ansStr = String(prob.answer);
    const showAnswerBox = isAnswerKey || this.config.show_answer_boxes !== false;
    if (prob.is_cryptarithm) cx += advanceText(ansStr);
    else if (showAnswerBox) cx += advanceBox(ansStr);
  }

  _drawVerticalStandard(page, prob, x, y, isAnswerKey, probNum) {
    const xRight = x + this.cellWidth * 0.65;
    const lineSpacing = Math.max(this.fontSize * 0.82, Math.min(this.fontSize * 1.05, (this.cellHeight - this.fontSize * 0.55) / 3.2));
    const charW = this.fontSize * 0.5;

    const [op1, op, op2] = prob.expr_parts;
    const yOp1 = y - lineSpacing;
    const yOp2 = y - lineSpacing * 2;
    const yAns = y - lineSpacing * 3.2;
    const yLine = y - lineSpacing * 2.1;

    if (probNum !== undefined) {
      this._drawProblemNumber(page, probNum, x + 5, y, this.fontSize * 0.9);
    }

    const op1Text = (typeof op1 === 'number' && op1 < 0) ? `(${op1})` : String(op1);
    const op2Text = (typeof op2 === 'number' && op2 < 0) ? `(${op2})` : String(op2);
    const font = this.fonts.helvetica;
    const textWidth = (value) => font.widthOfTextAtSize(value, this.fontSize);
    const alignDecimals = !op1Text.startsWith('(') && !op2Text.startsWith('(')
      && (op1Text.includes('.') || op2Text.includes('.'));
    const fractions = [op1Text, op2Text].map((text) => text.includes('.') ? text.split('.')[1] : '');
    const maxFractionWidth = Math.max(...fractions.map(textWidth));
    const dotWidth = textWidth('.');
    const decimalX = xRight - maxFractionWidth - dotWidth;
    let operandLeft = xRight;
    const drawOperand = (value, cy) => {
      if (!alignDecimals) {
        const textX = xRight - textWidth(value);
        this._drawText(page, value, textX, cy);
        operandLeft = Math.min(operandLeft, textX);
        return;
      }
      const [integer, fraction] = value.split('.');
      const integerX = decimalX - textWidth(integer);
      this._drawText(page, integer, integerX, cy);
      if (fraction !== undefined) {
        this._drawText(page, '.', decimalX, cy);
        this._drawText(page, fraction, decimalX + dotWidth, cy);
      }
      operandLeft = Math.min(operandLeft, integerX);
    };
    const rightBox = (valStr, cy) => {
      const bw = this.fontSize * (Math.max(valStr.length, 2) * 0.5) + this.fontSize * 0.3;
      this._drawBox(page, xRight - bw, cy, Math.max(valStr.length, 2));
      if (isAnswerKey) {
        const ansW = valStr.length * charW;
        this._drawText(page, valStr, xRight - bw + bw / 2 - ansW / 2, cy + this.fontSize * 0.12, { isRed: true });
      }
    };

    drawOperand(op1Text, yOp1);
    drawOperand(op2Text, yOp2);
    const operatorX = operandLeft - textWidth(op) - this.fontSize * 0.28;
    this._drawText(page, op, operatorX, yOp2);

    drawLineSeg(page, operatorX - this.fontSize * 0.08, yLine, xRight + this.fontSize * 0.2, yLine, 1);

    if (isAnswerKey || this.config.show_answer_boxes !== false) rightBox(String(prob.answer), yAns);
  }

  _drawVerticalDivision(page, prob, x, y, isAnswerKey, probNum) {
    const showAnswerBox = isAnswerKey || this.config.show_answer_boxes !== false;
    // Keep the question number at the top of the cell. Without an answer box,
    // the old 0.05 offset lifted the division roof above that baseline and made
    // mixed vertical rows look crooked. Reserve one text line for the roof even
    // when the quotient area is intentionally omitted.
    const cy = y - this.fontSize * (showAnswerBox ? 1.95 : 1.05);

    const divisor = prob.expr_parts[2], dividend = prob.expr_parts[0];

    let cx = x + 5;
    if (probNum !== undefined) {
      cx += this._drawProblemNumber(page, probNum, cx, y, this.fontSize * 0.9) + this.fontSize * 0.12;
    }

    const divisorText = String(divisor);
    this._drawText(page, divisorText, cx, cy);
    const cxDivEnd = cx + this.fonts.helvetica.widthOfTextAtSize(divisorText, this.fontSize);

    const bracketX = cxDivEnd + this.fontSize * 0.14;
    const roofY = cy + this.fontSize * 0.9;
    const roofStartX = bracketX + this.fontSize * 0.12;
    drawLineSeg(page, bracketX, cy - this.fontSize * 0.12, roofStartX, roofY, 1.1);

    const dividendX = roofStartX + this.fontSize * 0.18;
    const dividendText = String(dividend);
    this._drawText(page, dividendText, dividendX, cy);
    const dividendEnd = dividendX + this.fonts.helvetica.widthOfTextAtSize(dividendText, this.fontSize);

    const lineEnd = dividendEnd + this.fontSize * 0.2;
    drawLineSeg(page, roofStartX, roofY, lineEnd, roofY, 1.1);

    const ansY = roofY + this.fontSize * 0.2;
    const ansStr = String(prob.answer);
    const bwAns = showAnswerBox
      ? this._drawBox(page, dividendX, ansY, Math.max(ansStr.length, 2))
      : this.fontSize * (Math.max(ansStr.length, 2) * 0.5) + this.fontSize * 0.3;
    if (isAnswerKey) {
      const answerWidth = this.fonts.helvetica.widthOfTextAtSize(ansStr, this.fontSize);
      this._drawText(page, ansStr, dividendX + bwAns / 2 - answerWidth / 2, ansY + this.fontSize * 0.12, { isRed: true });
    }
  }

  _settingsSummary() {
    const cfg = this.config;
    let opsStr = cfg.mode === 'simultaneous' ? 'linear equations' : cfg.mode;
    if (cfg.mode === 'standard' && cfg.ops) {
      const enabled = Object.entries(cfg.ops)
        .filter(([, op]) => op.enabled)
        .map(([sym, op]) => `${sym}${op.weight}%`);
      if (enabled.length) opsStr = `standard (${enabled.join(' ')})`;
    }
    const numberStyle = cfg.circle_question_numbers ? ' | Numbers: circled' : '';
    return `Layout: ${cfg.rows}x${cfg.columns} | Pages: ${cfg.num_pages} | Font: ${this.fontSize}pt | Mode: ${opsStr}${numberStyle} | Randomized: ${cfg.randomize_order}`;
  }

  // Short answer text for one problem - used by the parent-facing answer QR,
  // not drawn on the page itself. Deliberately terse (just the solved value,
  // not the full worked equation) to keep the QR's data small enough to stay
  // reliably scannable at print size.
  _answerSummary(prob) {
    if (prob.operator === 'simultaneous') {
      if (prob.sim_type === 'substitution_blank') {
        return `x=${prob.sim_ans_x}`;
      }
      if (prob.sim_type === 'substitution_simple') {
        const targetVar = (prob.sim_lines[1].includes('x =') || prob.sim_lines[1].includes('x=')) ? 'x' : 'y';
        const missingVar = targetVar === 'x' ? 'y' : 'x';
        const ansVal = missingVar === 'x' ? prob.sim_ans_x : prob.sim_ans_y;
        return `${missingVar}=${ansVal}`;
      }
      return `x=${prob.sim_ans_x},y=${prob.sim_ans_y}`;
    }
    if (prob.is_cryptarithm) return String(prob.expr_parts[prob.missing_index]);
    return String(prob.answer);
  }

  _renderPageContent(page, problems, isAnswerKey, baseCode, pageNum) {
    const { helvetica } = this.fonts;
    const baseTitle = (this.config.title || 'Math Practice Test').trim() || 'Math Practice Test';
    const title = isAnswerKey ? `${baseTitle} - Answer Key` : baseTitle;
    page.drawText(title, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 40, size: 14, font: helvetica });

    // Worksheet-matching code, e.g. "XRGD0831-A-1" - same code on the
    // worksheet page and its matching answer-key page (same pageNum), so a
    // teacher can pair up printed sheets for a whole class by eye. Drawn
    // small, below the answer QR (not above it) so the QR - which needs the
    // room far more, to stay scannable - gets first claim on the vertical
    // space available at the top of the header.
    const code = `${baseCode}-A-${pageNum}`;

    // Answer-key QR, worksheet pages only, anchored at the very top of the
    // header (right of the title) - scanning it opens a plain-text answer
    // list (js/answers-viewer.js) instead of needing the separate
    // answer-key PDF/page. Kept up here (not the bottom margin) so it can't
    // get smudged by a student writing near the bottom of the page, and
    // given first claim on the header's vertical space (title row down to
    // the grid) rather than being squeezed under the code text, which
    // previously left it touching the grid on denser worksheets. Sized to
    // its actual module count (see sizeQrForData() in pdf-common.js), not
    // just guessed from string length. If even the maximum size cannot keep
    // its modules legible, the PDF prints an explanation in the QR area
    // instead of silently omitting it or drawing an unreadable code.
    const qrTop = PDF_PAGE.HEIGHT - 34;
    let qrBottom = qrTop;
    const drawQrOmissionNotice = (tooManyQuestions) => {
      const lines = tooManyQuestions
        ? ['Answer QR code', 'was not added because', 'there are too many', 'questions.']
        : ['Answer QR code', 'could not be added.'];
      const noticeSize = 6.5;
      lines.forEach((line, index) => {
        const width = helvetica.widthOfTextAtSize(line, noticeSize);
        page.drawText(line, {
          x: PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - width,
          y: qrTop - 10 - index * 9,
          size: noticeSize,
          font: helvetica,
          color: PDFLib.rgb(0.45, 0.2, 0.12),
        });
      });
      qrBottom = qrTop - 10 - lines.length * 9;
    };
    if (!isAnswerKey && this.config.include_answer_qr !== false) {
      const answers = problems.map((prob) => this._answerSummary(prob));
      const url = buildCompactMathAnswerQrUrl({ c: code, answers });
      try {
        const fit = sizeQrForData(url, 'L', { maxSize: 74 });
        if (fit) {
          qrBottom = qrTop - fit.size;
          drawQrCode(page, url, PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - fit.size, qrBottom, fit.size, 'L');
        } else {
          drawQrOmissionNotice(true);
          console.warn('Answer QR payload is too large to print legibly on this worksheet page.');
        }
      } catch (e) {
        const tooManyQuestions = /overflow|too large|code length/i.test(String(e?.message || e));
        drawQrOmissionNotice(tooManyQuestions);
        console.warn('Answer QR code unavailable:', e);
      }
    }

    const codeStr = `Code: ${code}`;
    const codeWidth = helvetica.widthOfTextAtSize(codeStr, 8);
    page.drawText(codeStr, {
      x: PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - codeWidth, y: qrBottom - 12, size: 8, font: helvetica, color: PDFLib.rgb(0.3, 0.3, 0.3),
    });

    const teacherName = (this.config.teacher || '').trim();
    if (isAnswerKey) {
      page.drawText(`Teacher: ${teacherName || '_________________________'}`, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
    } else {
      page.drawText('Name: _________________________', { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
      page.drawText('Date: _______________', { x: 320, y: PDF_PAGE.HEIGHT - 62, size: 12, font: helvetica });
      page.drawText(`Teacher: ${teacherName || '_________________________'}`, { x: PDF_PAGE.MARGIN, y: PDF_PAGE.HEIGHT - 82, size: 12, font: helvetica });
      page.drawText('Class: _______________', { x: 320, y: PDF_PAGE.HEIGHT - 82, size: 12, font: helvetica });
    }

    const startY = PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT;
    problems.forEach((prob, i) => {
      const row = Math.floor(i / this.config.columns);
      const col = i % this.config.columns;
      const x = PDF_PAGE.MARGIN + col * this.cellWidth;
      const y = startY - row * this.cellHeight;

      if (prob.operator === 'simultaneous') {
        this._drawSimultaneous(page, prob, x, y, isAnswerKey, i + 1);
      } else if (prob.is_vertical) {
        if (prob.operator === '÷') this._drawVerticalDivision(page, prob, x, y, isAnswerKey, i + 1);
        else this._drawVerticalStandard(page, prob, x, y, isAnswerKey, i + 1);
      } else {
        this._drawHorizontal(page, prob, x, y, isAnswerKey, i + 1);
      }
    });

    const docType = isAnswerKey ? 'ANSWER KEY' : 'PRACTICE SHEET';
    const footerText = `Powered by Ys Learning Lab - ${docType}`;
    const footerWidth = this.fonts.helvetica.widthOfTextAtSize(footerText, 10);
    page.drawText(footerText, {
      x: PDF_PAGE.WIDTH / 2 - footerWidth / 2, y: 28, size: 10, font: this.fonts.helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5),
    });

    if (this.config.show_settings_footer) {
      page.drawText(this._settingsSummary(), {
        x: PDF_PAGE.MARGIN, y: 14, size: 6, font: this.fonts.helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5),
      });
    }

    try {
      drawQrCode(page, 'https://ys-learning-lab.github.io/', PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 32, 20, 32);
      const printMoreText = 'Print more!';
      const printMoreWidth = helvetica.widthOfTextAtSize(printMoreText, 7);
      page.drawText(printMoreText, {
        x: PDF_PAGE.WIDTH - PDF_PAGE.MARGIN - 16 - printMoreWidth / 2, y: 56, size: 7, font: helvetica, color: PDFLib.rgb(0.5, 0.5, 0.5),
      });
    } catch (e) {
      console.warn('QR code unavailable (qrcode-generator failed to load?):', e);
    }
  }

  async renderCombined() {
    const pdfDoc = await PDFLib.PDFDocument.create();
    this.fonts = await getBaseFonts(pdfDoc);
    const baseCode = getWorksheetBatchCode();
    this.pages.forEach((problems, idx) => {
      const page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
      this._renderPageContent(page, problems, false, baseCode, idx + 1);
    });
    if (this.config.include_answer_key !== false) {
      this.pages.forEach((problems, idx) => {
        const page = pdfDoc.addPage([PDF_PAGE.WIDTH, PDF_PAGE.HEIGHT]);
        this._renderPageContent(page, problems, true, baseCode, idx + 1);
      });
    }
    return pdfDoc.save();
  }
}
