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

function greatestCommonDivisor(a, b) {
  let x = Math.abs(Math.trunc(a));
  let y = Math.abs(Math.trunc(b));
  while (y) [x, y] = [y, x % y];
  return x || 1;
}

function simplifyFraction(numerator, denominator) {
  const sign = denominator < 0 ? -1 : 1;
  const divisor = greatestCommonDivisor(numerator, denominator);
  return { numerator: sign * numerator / divisor, denominator: Math.abs(denominator) / divisor };
}

function fractionText(fraction) {
  return `${fraction.numerator}/${fraction.denominator}`;
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
  } else if (mode === 'fractions') {
    maximum = 20;
    widthDivisor = 12.5;
    heightDivisor = 4.4;
  } else if (mode === 'digits' || mode === 'decimals') {
    maximum = 18;
    widthDivisor = 20;
    heightDivisor = 3.4;
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

  _fractionBounds() {
    const fc = this.config.fraction_config || {};
    const minimum = Math.max(2, Math.min(16, Number(fc.min_denominator) || 2));
    const maximum = Math.max(minimum, Math.min(16, Number(fc.max_denominator) || 10));
    return { minimum, maximum };
  }

  _properFraction(denominator = null, forceProper = false) {
    const bounds = this._fractionBounds();
    const den = denominator || randInt(bounds.minimum, bounds.maximum);
    const fc = this.config.fraction_config || {};
    const useLimit = !forceProper && fc.numerator_mode === 'limit';
    const maximumNumerator = useLimit
      ? Math.max(1, Math.min(100, Number(fc.max_numerator) || 20))
      : Math.max(1, den - 1);
    return { numerator: randInt(1, maximumNumerator), denominator: den };
  }

  _fractionModelShape(denominator) {
    const hasGrid = Array.from({ length: Math.floor(Math.sqrt(denominator)) - 1 }, (_, index) => index + 2)
      .some((factor) => denominator % factor === 0);
    return hasGrid && Math.random() < 0.5 ? 'grid' : 'pie';
  }

  _generateFractionComparison(forceProper = false) {
    const fc = this.config.fraction_config || {};
    const first = this._properFraction(null, forceProper);
    let second;
    if (fc.denominator_mode === 'same') {
      second = this._properFraction(first.denominator, forceProper);
    } else if (Math.random() < 0.2) {
      const multiplier = randInt(2, 4);
      second = { numerator: first.numerator * multiplier, denominator: first.denominator * multiplier };
      const bounds = this._fractionBounds();
      const maximumNumerator = !forceProper && fc.numerator_mode === 'limit'
        ? Math.max(1, Math.min(100, Number(fc.max_numerator) || 20))
        : second.denominator - 1;
      if (second.denominator > bounds.maximum || second.numerator > maximumNumerator) second = this._properFraction(null, forceProper);
    } else {
      second = this._properFraction(null, forceProper);
    }
    const leftValue = first.numerator * second.denominator;
    const rightValue = second.numerator * first.denominator;
    const answer = leftValue === rightValue ? '=' : leftValue < rightValue ? '<' : '>';
    return { operator: 'fraction', fraction_type: 'comparison', first, second, answer };
  }

  _generateFractionShapeComparison() {
    const problem = this._generateFractionComparison(true);
    const pieFirst = Math.random() < 0.5;
    return {
      ...problem,
      comparison_visual: true,
      first_shape: pieFirst ? 'pie' : 'grid',
      second_shape: pieFirst ? 'grid' : 'pie',
    };
  }

  _generateFractionIdentify(multipleChoice = false) {
    const fc = this.config.fraction_config || {};
    let model = this._properFraction(null, true);
    if (!fc.include_simplification) {
      const bounds = this._fractionBounds();
      const simplestModels = [];
      for (let denominator = bounds.minimum; denominator <= bounds.maximum; denominator++) {
        for (let numerator = 1; numerator < denominator; numerator++) {
          if (greatestCommonDivisor(numerator, denominator) === 1) simplestModels.push({ numerator, denominator });
        }
      }
      model = randChoice(simplestModels);
    }
    const modelShape = this._fractionModelShape(model.denominator);
    const reduced = simplifyFraction(model.numerator, model.denominator);
    const answer = fractionText(reduced);
    if (!multipleChoice) {
      return { operator: 'fraction', fraction_type: 'identify', model, model_shape: modelShape, answer };
    }

    const choiceCount = Math.max(3, Math.min(4, Number(fc.choice_count) || 4));
    const answers = new Set([answer]);
    const candidates = [
      { numerator: model.denominator - model.numerator, denominator: model.denominator },
      { numerator: model.numerator + 1, denominator: model.denominator },
      { numerator: Math.max(1, model.numerator - 1), denominator: model.denominator },
      { numerator: model.numerator, denominator: model.denominator + 1 },
      { numerator: model.numerator, denominator: model.denominator + 2 },
    ];
    randShuffle(candidates);
    for (const candidate of candidates) {
      if (candidate.numerator <= 0 || candidate.numerator >= candidate.denominator) continue;
      const displayed = fc.include_simplification ? simplifyFraction(candidate.numerator, candidate.denominator) : candidate;
      answers.add(fractionText(displayed));
      if (answers.size >= choiceCount) break;
    }
    for (let denominator = 3; answers.size < choiceCount && denominator <= 12; denominator++) {
      for (let numerator = 1; answers.size < choiceCount && numerator < denominator; numerator++) {
        const displayed = fc.include_simplification ? simplifyFraction(numerator, denominator) : { numerator, denominator };
        answers.add(fractionText(displayed));
      }
    }
    const choices = randShuffle([...answers]).slice(0, choiceCount);
    return { operator: 'fraction', fraction_type: 'visual_choice', model, model_shape: modelShape, choices, answer };
  }

  _generateFractionSimplify() {
    const fc = this.config.fraction_config || {};
    const bounds = this._fractionBounds();
    const configuredResult = fc.simplify_result || 'fraction';
    const resultType = configuredResult === 'mixed' ? randChoice(['fraction', 'whole']) : configuredResult;
    const numeratorLimit = Math.max(2, Math.min(100, Number(fc.max_numerator) || 20));
    const candidates = [];
    for (let denominator = bounds.minimum; denominator <= bounds.maximum; denominator++) {
      const maximumNumerator = fc.numerator_mode === 'limit' ? numeratorLimit : denominator - 1;
      for (let numerator = 2; numerator <= maximumNumerator; numerator++) {
        if (numerator === denominator) continue;
        const divisor = greatestCommonDivisor(numerator, denominator);
        if (divisor <= 1) continue;
        const simplified = simplifyFraction(numerator, denominator);
        if (resultType === 'whole' ? simplified.denominator === 1 : simplified.denominator > 1) {
          candidates.push({ numerator, denominator });
        }
      }
    }
    const fallback = resultType === 'whole'
      ? { numerator: 4, denominator: 2 }
      : { numerator: 2, denominator: 4 };
    const fraction = randChoice(candidates.length ? candidates : [fallback]);
    const result = simplifyFraction(fraction.numerator, fraction.denominator);
    return {
      operator: 'fraction', fraction_type: 'simplify', first: fraction, result,
      answer: result.denominator === 1 ? String(result.numerator) : fractionText(result),
    };
  }

  _generateFractionOperation(forcedOperation = null) {
    const fc = this.config.fraction_config || {};
    const enabled = Object.entries(fc.operations || {}).filter(([, value]) => value).map(([key]) => key);
    let operation = forcedOperation;
    if (!operation) {
      const available = enabled.length ? enabled : ['+'];
      const weights = fc.operation_weights || {};
      const totalWeight = available.reduce((sum, op) => sum + Math.max(0, Number(weights[op]) || 0), 0);
      if (totalWeight > 0) {
        let roll = Math.random() * totalWeight;
        operation = available.find((op) => {
          roll -= Math.max(0, Number(weights[op]) || 0);
          return roll <= 0;
        }) || available[available.length - 1];
      } else {
        operation = randChoice(available);
      }
    }
    let first = this._properFraction();
    let second = fc.denominator_mode === 'same' ? this._properFraction(first.denominator) : this._properFraction();

    if (operation === '-' && first.numerator * second.denominator < second.numerator * first.denominator) {
      [first, second] = [second, first];
    }

    let numerator;
    let denominator;
    if (operation === '+') {
      numerator = first.numerator * second.denominator + second.numerator * first.denominator;
      denominator = first.denominator * second.denominator;
    } else if (operation === '-') {
      numerator = first.numerator * second.denominator - second.numerator * first.denominator;
      denominator = first.denominator * second.denominator;
    } else if (operation === 'x') {
      numerator = first.numerator * second.numerator;
      denominator = first.denominator * second.denominator;
    } else {
      numerator = first.numerator * second.denominator;
      denominator = first.denominator * second.numerator;
    }
    const result = simplifyFraction(numerator, denominator);
    return { operator: 'fraction', fraction_type: 'operations', operation, first, second, result, answer: fractionText(result) };
  }

  _generateFractionDecimal() {
    const fc = this.config.fraction_config || {};
    const bounds = this._fractionBounds();
    const decimalPlaces = Math.max(1, Math.min(3, Number(fc.decimal_places) || 1));
    const decimalScale = Math.pow(10, decimalPlaces);
    const candidates = [];
    for (let denominator = bounds.minimum; denominator <= bounds.maximum; denominator++) {
      const maximumNumerator = fc.numerator_mode === 'limit'
        ? Math.max(1, Math.min(100, Number(fc.max_numerator) || 20))
        : denominator - 1;
      for (let numerator = 1; numerator <= maximumNumerator; numerator++) {
        const fraction = simplifyFraction(numerator, denominator);
        if (fraction.denominator === 1) continue;
        if (decimalScale % fraction.denominator !== 0) continue;
        candidates.push({ raw: { numerator, denominator }, fraction });
      }
    }
    const selected = randChoice(candidates.length ? candidates : [{
      raw: { numerator: 1, denominator: 2 },
      fraction: { numerator: 1, denominator: 2 },
    }]);
    const fraction = selected.fraction;
    const decimal = Number((selected.raw.numerator / selected.raw.denominator).toFixed(decimalPlaces));
    const direction = fc.decimal_direction === 'mixed'
      ? randChoice(['fraction_to_decimal', 'decimal_to_fraction'])
      : (fc.decimal_direction || 'fraction_to_decimal');
    return {
      operator: 'fraction', fraction_type: 'decimal', direction, fraction, decimal, decimal_places: decimalPlaces,
      answer: direction === 'fraction_to_decimal' ? String(decimal) : fractionText(fraction),
    };
  }

  _generateFractionProblem() {
    const configuredType = this.config.fraction_config?.type || 'identify';
    const type = configuredType === 'mixed'
      ? randChoice(['comparison', 'identify', 'visual_choice', 'operations', 'simplify', 'decimal'])
      : configuredType;
    if (type === 'comparison') {
      const format = this.config.fraction_config?.comparison_format || 'fractions';
      const useShapes = format === 'shapes' || (format === 'mixed' && Math.random() < 0.5);
      return useShapes ? this._generateFractionShapeComparison() : this._generateFractionComparison();
    }
    if (type === 'identify') return this._generateFractionIdentify(false);
    if (type === 'visual_choice') return this._generateFractionIdentify(true);
    if (type === 'operations') return this._generateFractionOperation();
    if (type === 'simplify') return this._generateFractionSimplify();
    return this._generateFractionDecimal();
  }

  _problemSignature(problem) {
    if (problem.operator === 'fraction') {
      if (problem.fraction_type === 'identify' || problem.fraction_type === 'visual_choice') {
        return `fraction:${problem.fraction_type}:${fractionText(problem.model)}`;
      }
      if (problem.fraction_type === 'comparison') {
        return `fraction:comparison:${fractionText(problem.first)}:${fractionText(problem.second)}`;
      }
      if (problem.fraction_type === 'operations') {
        return `fraction:operations:${fractionText(problem.first)}:${problem.operation}:${fractionText(problem.second)}`;
      }
      if (problem.fraction_type === 'simplify') return `fraction:simplify:${fractionText(problem.first)}`;
      if (problem.fraction_type === 'decimal') return `fraction:decimal:${problem.direction}:${fractionText(problem.fraction)}`;
    }
    if (problem.operator === 'simultaneous') return `simultaneous:${problem.sim_lines.join('|')}`;
    if (problem.operator === 'mixed') return `mixed:${problem.expr_parts.join('|')}`;
    if (problem.operator === 'digits_decimal') return `digits-decimal:${problem.expr_parts.join('|')}`;
    if (problem.operator === 'digits_percent') return `digits-percent:${problem.decimal}`;
    if (problem.operator === 'digits_bar') return `digits-bar:${problem.shaded}`;
    if (problem.operator === 'digits') return `digits:${problem.direction}:${problem.multiplication_form}:${problem.number}`;
    if (problem.expr_parts) return `standard:${problem.operator}:${problem.expr_parts.join('|')}:${problem.is_cryptarithm ? problem.missing_index : 'answer'}`;
    return JSON.stringify(problem);
  }

  _generateUniqueProblem(factory, seen, maxAttempts = 100) {
    let problem;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      problem = factory();
      const signature = this._problemSignature(problem);
      if (!seen.has(signature)) {
        seen.add(signature);
        return problem;
      }
    }
    return problem;
  }

  _generateDigitProblem() {
    const cfg = this.config.digits_config || {};
    const minDigits = Math.max(2, Math.min(6, Number(cfg.min_digits) || 4));
    const maxDigits = Math.max(minDigits, Math.min(6, Number(cfg.max_digits) || 5));
    const decimalPlaces = Math.max(0, Math.min(3, Number(cfg.decimal_places) || 0));
    const digitCount = randInt(minDigits, maxDigits);
    const digits = [randInt(1, 9)];
    while (digits.length < digitCount) digits.push(randInt(0, 9));
    const decimalDigits = Array.from({ length: decimalPlaces }, () => randInt(0, 9));
    if (decimalPlaces > 0 && decimalDigits.every((digit) => digit === 0)) {
      decimalDigits[randInt(0, decimalDigits.length - 1)] = randInt(1, 9);
    }
    const wholeNumber = Number(digits.join(''));
    const wholeTerms = digits.map((digit, index) => ({
      digit,
      place: 10 ** (digitCount - index - 1),
    })).filter((term) => term.digit !== 0);
    const decimalTerms = decimalDigits.map((digit, index) => ({
      digit,
      place_text: `0.${'0'.repeat(index)}1`,
      value_text: `0.${'0'.repeat(index)}${digit}`,
    })).filter((term) => term.digit !== 0);
    const multiplicationForm = cfg.direction === 'number_to_parts' && cfg.multiplication_form === true;
    const wholeExpanded = wholeTerms.map((term) => (
      multiplicationForm
        ? (term.place === 1 ? String(term.digit) : `${term.digit} × ${term.place.toLocaleString('en-US')}`)
        : (term.digit * term.place).toLocaleString('en-US')
    ));
    const decimalExpanded = decimalTerms.map((term) => (
      multiplicationForm ? `${term.digit} × ${term.place_text}` : term.value_text
    ));
    const expanded = [...wholeExpanded, ...decimalExpanded].join(' + ');
    const numberText = `${wholeNumber.toLocaleString('en-US')}${decimalPlaces ? `.${decimalDigits.join('')}` : ''}`;
    return {
      operator: 'digits',
      direction: cfg.direction === 'number_to_parts' ? 'number_to_parts' : 'parts_to_number',
      multiplication_form: multiplicationForm,
      number: numberText,
      number_text: numberText,
      expanded,
      answer: cfg.direction === 'number_to_parts' ? expanded : numberText,
      is_vertical: false,
    };
  }

  _formatDecimalShiftValue(coefficient, scale) {
    const digits = String(Math.abs(Math.trunc(coefficient)));
    if (scale <= 0) return Number(`${digits}${'0'.repeat(-scale)}`).toLocaleString('en-US');
    const padded = digits.padStart(scale + 1, '0');
    const integer = padded.slice(0, -scale);
    const fraction = padded.slice(-scale).replace(/0+$/, '');
    const integerText = Number(integer).toLocaleString('en-US');
    return fraction ? `${integerText}.${fraction}` : integerText;
  }

  _generateDecimalShiftProblem() {
    const cfg = this.config.decimal_config || {};
    const maxDigits = Math.max(2, Math.min(6, Number(cfg.left_max_digits) || 4));
    const digitCount = randInt(1, maxDigits);
    const minimum = digitCount === 1 ? 1 : 10 ** (digitCount - 1);
    const maximum = 10 ** digitCount - 1;
    let coefficient = randInt(minimum, maximum);
    const operandScale = cfg.whole_left === false ? randInt(0, 3) : 0;
    if (operandScale > 0 && coefficient % 10 === 0) coefficient += randInt(1, 9);

    const maxShift = Math.max(1, Math.min(3, Number(cfg.max_shift) || 2));
    const distance = randInt(1, maxShift);
    const direction = cfg.shift_direction || 'mixed';
    const exponent = direction === 'right' ? distance : direction === 'left' ? -distance : (Math.random() < 0.5 ? distance : -distance);
    const multiplier = exponent > 0
      ? (10 ** exponent).toLocaleString('en-US')
      : `0.${'0'.repeat(Math.abs(exponent) - 1)}1`;
    const operand = this._formatDecimalShiftValue(coefficient, operandScale);
    const answer = this._formatDecimalShiftValue(coefficient, operandScale - exponent);
    return {
      expr_parts: [operand, '×', multiplier],
      operator: 'digits_decimal',
      answer,
      is_vertical: false,
      is_cryptarithm: false,
      missing_index: -1,
    };
  }

  _generateDecimalWorksheetProblem(requestedType = null) {
    const configuredType = this.config.decimal_config?.type || 'multiplication';
    const type = requestedType || (configuredType === 'mixed' ? randChoice(['multiplication', 'percent', 'bar']) : configuredType);
    if (type === 'percent') return this._generateDecimalPercentProblem();
    if (type === 'bar') return this._generateDecimalBarProblem();
    return this._generateDecimalShiftProblem();
  }

  _generateDecimalPercentProblem() {
    const percent = randInt(1, 99);
    const decimal = (percent / 100).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return {
      expr_parts: [decimal],
      operator: 'digits_percent',
      decimal,
      answer: `${percent}%`,
      is_vertical: false,
      is_cryptarithm: false,
      missing_index: -1,
    };
  }

  _generateDecimalBarProblem() {
    const shaded = randInt(1, 9);
    return {
      operator: 'digits_bar',
      shaded,
      answer: (shaded / 10).toFixed(1),
      is_vertical: false,
    };
  }

  generatePages() {
    const totalItems = this.config.rows * this.config.columns;
    const pages = [];
    const seenProblems = new Set();

    if (this.config.mode === 'digits') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        for (let i = 0; i < totalItems; i++) {
          pageProblems.push(this._generateUniqueProblem(() => this._generateDigitProblem(), seenProblems));
        }
        if (this.config.randomize_order) randShuffle(pageProblems);
        pages.push(pageProblems);
      }
      return pages;
    }

    if (this.config.mode === 'decimals') {
      const configuredType = this.config.decimal_config?.type || 'multiplication';
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        const typePool = configuredType === 'mixed'
          ? Array.from({ length: totalItems }, (_, index) => ['multiplication', 'percent', 'bar'][index % 3])
          : Array(totalItems).fill(configuredType);
        if (this.config.randomize_order) randShuffle(typePool);
        for (let i = 0; i < totalItems; i++) {
          pageProblems.push(this._generateUniqueProblem(() => this._generateDecimalWorksheetProblem(typePool[i]), seenProblems));
        }
        if (this.config.randomize_order) randShuffle(pageProblems);
        pages.push(pageProblems);
      }
      return pages;
    }

    if (this.config.mode === 'fractions') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        if (this.config.fraction_config?.type === 'operations') {
          const fc = this.config.fraction_config;
          const selected = Object.entries(fc.operations || {}).filter(([, value]) => value).map(([op]) => op);
          const available = selected.length ? selected : ['+'];
          const totalWeight = available.reduce((sum, op) => sum + Math.max(0, Number(fc.operation_weights?.[op]) || 0), 0) || available.length;
          const pool = [];
          available.forEach((op) => {
            const weight = Math.max(0, Number(fc.operation_weights?.[op]) || (totalWeight === available.length ? 1 : 0));
            const count = Math.floor(weight / totalWeight * totalItems);
            for (let i = 0; i < count; i++) pool.push(op);
          });
          while (pool.length < totalItems) pool.push(available[pool.length % available.length]);
          if (this.config.randomize_order) randShuffle(pool);
          pool.slice(0, totalItems).forEach((op) => pageProblems.push(
            this._generateUniqueProblem(() => this._generateFractionOperation(op), seenProblems),
          ));
        } else {
          for (let i = 0; i < totalItems; i++) {
            pageProblems.push(this._generateUniqueProblem(() => this._generateFractionProblem(), seenProblems));
          }
        }
        if (this.config.randomize_order) randShuffle(pageProblems);
        pages.push(pageProblems);
      }
      return pages;
    }

    if (this.config.mode === 'simultaneous') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        for (let i = 0; i < totalItems; i++) {
          pageProblems.push(this._generateUniqueProblem(() => {
            const [lines, ans, xV, yV, stype] = this._generateSimultaneousProblem();
            return {
              expr_parts: [], operator: 'simultaneous', answer: ans, is_vertical: false,
              is_cryptarithm: false, missing_index: -1,
              sim_lines: lines, sim_type: stype, sim_ans_x: xV, sim_ans_y: yV,
            };
          }, seenProblems));
        }
        pages.push(pageProblems);
      }
      return pages;
    }

    if (this.config.mode === 'mixed_ops') {
      for (let p = 0; p < this.config.num_pages; p++) {
        const pageProblems = [];
        for (let i = 0; i < totalItems; i++) {
          pageProblems.push(this._generateUniqueProblem(() => {
            const [expr, ans] = this._generateCleanMixedProblem();
            return {
              expr_parts: expr, operator: 'mixed', answer: ans, is_vertical: false,
              is_cryptarithm: false, missing_index: -1,
            };
          }, seenProblems));
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

        pageProblems.push(this._generateUniqueProblem(() => {
          const [expr, ans] = this._generateStandardProblem(operator, opCfg);
          const missingIndex = isCrypto ? randInt(0, expr.length - 1) : -1;
          return {
            expr_parts: expr, operator, answer: ans,
            is_vertical: opCfg.is_vertical && expr.length === 3,
            is_cryptarithm: isCrypto, missing_index: missingIndex,
          };
        }, seenProblems));
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

  _drawDigitsProblem(page, prob, x, y, isAnswerKey, probNum) {
    let cx = x + 4;
    cx += this._drawProblemNumber(page, probNum, cx, y, this.fontSize * 0.9);
    const rightEdge = x + this.cellWidth - 8;
    const availableWidth = Math.max(40, rightEdge - cx);
    const leftText = prob.direction === 'parts_to_number'
      ? `${prob.expanded} =`
      : `${prob.number_text} =`;
    const answerText = prob.direction === 'parts_to_number' ? prob.number_text : prob.expanded;
    const fullText = `${leftText} ${answerText}`;
    const font = this.fonts.helvetica;
    const baseSize = this.fontSize;
    const targetText = isAnswerKey ? fullText : leftText;
    const reservedBlank = isAnswerKey ? 0 : Math.min(70, availableWidth * 0.28);
    const measured = font.widthOfTextAtSize(targetText, baseSize);
    const fontSize = Math.max(7, Math.min(baseSize, baseSize * Math.max(1, availableWidth - reservedBlank) / Math.max(1, measured)));

    if (font.widthOfTextAtSize(targetText, 7) > availableWidth - reservedBlank) {
      const wrapText = (text, width) => {
        const lines = [];
        let line = '';
        String(text).split(' ').forEach((word) => {
          const candidate = line ? `${line} ${word}` : word;
          if (line && font.widthOfTextAtSize(candidate, 7) > width) {
            lines.push(line);
            line = word;
          } else {
            line = candidate;
          }
        });
        if (line) lines.push(line);
        return lines;
      };
      const lineGap = 9;
      if (prob.direction === 'parts_to_number') {
        const lines = wrapText(leftText, availableWidth);
        lines.forEach((line, index) => this._drawText(page, line, cx, y - index * lineGap, { fontOverride: 7 }));
        const responseY = y - lines.length * lineGap;
        if (isAnswerKey) this._drawText(page, answerText, cx, responseY, { isRed: true, fontOverride: 7 });
        else drawLineSeg(page, cx, responseY - 1.25, Math.min(rightEdge, cx + 80), responseY - 1.25, 1);
      } else {
        this._drawText(page, leftText, cx, y, { fontOverride: 7 });
        if (isAnswerKey) {
          wrapText(answerText, availableWidth).forEach((line, index) => (
            this._drawText(page, line, cx, y - (index + 1) * lineGap, { isRed: true, fontOverride: 7 })
          ));
        } else {
          const leftWidth = font.widthOfTextAtSize(leftText, 7);
          drawLineSeg(page, cx + leftWidth + 3, y - 1.25, rightEdge, y - 1.25, 1);
        }
      }
      return;
    }

    this._drawText(page, leftText, cx, y, { fontOverride: fontSize });
    const leftWidth = font.widthOfTextAtSize(leftText, fontSize);
    const answerX = cx + leftWidth + fontSize * 0.45;
    if (isAnswerKey) {
      this._drawText(page, answerText, answerX, y, { isRed: true, fontOverride: fontSize });
    } else {
      drawLineSeg(page, answerX, y - fontSize * 0.18, rightEdge, y - fontSize * 0.18, 1);
    }
  }

  _drawDecimalPercentProblem(page, prob, x, y, isAnswerKey, probNum) {
    let cx = x + 4;
    cx += this._drawProblemNumber(page, probNum, cx, y, this.fontSize * 0.9);
    const prompt = `${prob.decimal} =`;
    this._drawText(page, prompt, cx, y);
    cx += this.fonts.helvetica.widthOfTextAtSize(prompt, this.fontSize) + this.fontSize * 0.45;
    const percentNumber = String(prob.answer).replace('%', '');
    const boxWidth = this._drawBox(page, cx, y, Math.max(2, percentNumber.length));
    if (isAnswerKey) this._drawText(page, percentNumber, cx + this.fontSize * 0.2, y + this.fontSize * 0.12, { isRed: true });
    this._drawText(page, '%', cx + boxWidth + this.fontSize * 0.25, y);
  }

  _drawDecimalBarProblem(page, prob, x, y, isAnswerKey, probNum) {
    const fs = this.fontSize;
    let cx = x + 4;
    cx += this._drawProblemNumber(page, probNum, cx, y, fs * 0.9);
    const barHeight = Math.max(18, Math.min(26, this.cellHeight * 0.24));
    const centerY = y + fs * 0.2;
    const textBaseline = centerY - fs * 0.35;
    const boxBaseline = centerY - fs * 0.425;
    const model = this._drawShadedFractionModel(page, { numerator: prob.shaded, denominator: 10 }, cx, centerY + barHeight / 2, 150, 'bar');
    cx += model.width + fs * 0.75;
    this._drawText(page, '=', cx, textBaseline);
    cx += fs * 1.25;
    const boxWidth = this._drawBox(page, cx, boxBaseline, 3);
    if (isAnswerKey) {
      const answerWidth = this.fonts.helvetica.widthOfTextAtSize(prob.answer, fs);
      this._drawText(page, prob.answer, cx + boxWidth / 2 - answerWidth / 2, boxBaseline + fs * 0.12, { isRed: true });
    }
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

  _drawFraction(page, fraction, x, y, opts = {}) {
    const fs = opts.fontSize || Math.max(10, this.fontSize * 0.9);
    const numerator = String(fraction.numerator);
    const denominator = String(fraction.denominator);
    const width = Math.max(
      this.fonts.helvetica.widthOfTextAtSize(numerator, fs),
      this.fonts.helvetica.widthOfTextAtSize(denominator, fs),
    ) + 8;
    const color = opts.isRed ? PDFLib.rgb(0.9, 0.2, 0.2) : PDFLib.rgb(0, 0, 0);
    page.drawText(numerator, {
      x: x + (width - this.fonts.helvetica.widthOfTextAtSize(numerator, fs)) / 2,
      y: y + 4,
      size: fs,
      font: this.fonts.helvetica,
      color,
    });
    drawLineSeg(page, x, y + 1, x + width, y + 1, 1);
    page.drawText(denominator, {
      x: x + (width - this.fonts.helvetica.widthOfTextAtSize(denominator, fs)) / 2,
      y: y - fs,
      size: fs,
      font: this.fonts.helvetica,
      color,
    });
    return width;
  }

  _drawFractionBlank(page, x, y, isAnswerKey, answer) {
    const fs = Math.max(10, this.fontSize * 0.86);
    const width = fs * 2.2;
    if (isAnswerKey) {
      const [numerator, denominator] = String(answer).split('/');
      this._drawFraction(page, { numerator, denominator }, x, y, { isRed: true, fontSize: fs });
    } else {
      drawBoxOutline(page, x, y + 3, width, fs * 1.05);
      drawLineSeg(page, x, y, x + width, y, 1);
      drawBoxOutline(page, x, y - fs * 1.2, width, fs * 1.05);
    }
    return width;
  }

  _drawShadedFractionModel(page, fraction, x, y, maxWidth = 86, shape = 'pie') {
    const denominator = Math.max(2, fraction.denominator);
    const fill = PDFLib.rgb(0.19, 0.66, 0.69);
    const outline = PDFLib.rgb(0.15, 0.15, 0.15);

    if (shape === 'bar') {
      const width = Math.min(maxWidth, Math.max(100, Math.min(this.cellWidth * 0.55, 150)));
      const height = Math.max(18, Math.min(26, this.cellHeight * 0.24));
      const cellWidth = width / 10;
      for (let index = 0; index < 10; index++) {
        page.drawRectangle({
          x: x + index * cellWidth,
          y: y - height,
          width: cellWidth,
          height,
          color: index < fraction.numerator ? fill : PDFLib.rgb(1, 1, 1),
          borderColor: outline,
          borderWidth: 0.8,
        });
      }
      return { width, height };
    }

    if (shape === 'grid') {
      let rows = Math.floor(Math.sqrt(denominator));
      while (rows > 1 && denominator % rows !== 0) rows--;
      const columns = denominator / rows;
      const size = Math.min(maxWidth, Math.max(52, Math.min(this.cellWidth * 0.34, this.cellHeight * 0.42)));
      const cellWidth = size / columns;
      const cellHeight = size / rows;
      for (let index = 0; index < denominator; index++) {
        const row = Math.floor(index / columns);
        const column = index % columns;
        page.drawRectangle({
          x: x + column * cellWidth,
          y: y - (row + 1) * cellHeight,
          width: cellWidth,
          height: cellHeight,
          color: index < fraction.numerator ? fill : PDFLib.rgb(1, 1, 1),
          borderColor: outline,
          borderWidth: 0.8,
        });
      }
      return { width: size, height: size };
    }

    const diameter = Math.min(maxWidth, Math.max(52, Math.min(this.cellWidth * 0.34, this.cellHeight * 0.42)));
    const radius = diameter / 2;
    const centerX = x + radius;
    const centerY = y - radius;
    page.drawCircle({ x: centerX, y: centerY, size: radius, color: PDFLib.rgb(1, 1, 1) });

    const sectorAngle = (Math.PI * 2) / denominator;
    const startAngle = -Math.PI / 2;
    const shadedAngle = fraction.numerator * sectorAngle;
    const curveCount = Math.max(1, Math.ceil(shadedAngle / (Math.PI / 2)));
    const curveAngle = shadedAngle / curveCount;
    const startX = radius + Math.cos(startAngle) * radius;
    const startY = radius + Math.sin(startAngle) * radius;
    const path = [`M ${radius} ${radius}`, `L ${startX} ${startY}`];
    for (let index = 0; index < curveCount; index++) {
      const angleA = startAngle + index * curveAngle;
      const angleB = angleA + curveAngle;
      const tangent = 4 / 3 * Math.tan((angleB - angleA) / 4);
      const endX = radius + Math.cos(angleB) * radius;
      const endY = radius + Math.sin(angleB) * radius;
      const control1X = radius + (Math.cos(angleA) - tangent * Math.sin(angleA)) * radius;
      const control1Y = radius + (Math.sin(angleA) + tangent * Math.cos(angleA)) * radius;
      const control2X = radius + (Math.cos(angleB) + tangent * Math.sin(angleB)) * radius;
      const control2Y = radius + (Math.sin(angleB) - tangent * Math.cos(angleB)) * radius;
      path.push(`C ${control1X} ${control1Y} ${control2X} ${control2Y} ${endX} ${endY}`);
    }
    path.push('Z');
    page.drawSvgPath(path.join(' '), { x, y, color: fill });

    for (let index = 0; index < denominator; index++) {
      const angle = -Math.PI / 2 + index * sectorAngle;
      drawLineSeg(
        page,
        centerX,
        centerY,
        centerX + Math.cos(angle) * radius,
        centerY - Math.sin(angle) * radius,
        0.8,
      );
    }
    page.drawCircle({ x: centerX, y: centerY, size: radius, borderColor: outline, borderWidth: 1 });
    return { width: diameter, height: diameter };
  }

  _drawFractionProblem(page, prob, x, y, isAnswerKey, probNum) {
    const fs = Math.max(10, this.fontSize * 0.88);
    const left = x + 5;
    const numberWidth = this._drawProblemNumber(page, probNum, left, y, fs);
    const contentX = left + Math.max(25, numberWidth);
    const contentY = y - Math.max(18, fs * 1.15);

    if (prob.fraction_type === 'comparison') {
      if (prob.comparison_visual) {
        const modelTop = contentY + fs * 1.65;
        const firstModel = this._drawShadedFractionModel(page, prob.first, contentX, modelTop, 64, prob.first_shape);
        const symbolSize = fs * 1.55;
        const symbolX = contentX + firstModel.width + fs * 0.75;
        const symbolY = modelTop - firstModel.height / 2 - symbolSize / 2;
        if (isAnswerKey) {
          this._drawText(page, prob.answer, symbolX + fs * 0.25, symbolY + fs * 0.25, { isRed: true, fontOverride: fs * 1.15 });
        } else {
          drawBoxOutline(page, symbolX, symbolY, symbolSize, symbolSize);
        }
        this._drawShadedFractionModel(page, prob.second, symbolX + fs * 2.35, modelTop, 64, prob.second_shape);
        return;
      }
      const firstWidth = this._drawFraction(page, prob.first, contentX, contentY, { fontSize: fs });
      const symbolX = contentX + firstWidth + fs * 0.75;
      if (isAnswerKey) {
        this._drawText(page, prob.answer, symbolX + fs * 0.25, contentY - fs * 0.12, { isRed: true, fontOverride: fs * 1.15 });
      } else {
        drawBoxOutline(page, symbolX, contentY - fs * 0.55, fs * 1.55, fs * 1.55);
      }
      this._drawFraction(page, prob.second, symbolX + fs * 2.35, contentY, { fontSize: fs });
      return;
    }

    if (prob.fraction_type === 'identify') {
      const model = this._drawShadedFractionModel(page, prob.model, contentX, contentY + fs * 0.8, 86, prob.model_shape);
      this._drawFractionBlank(page, contentX + model.width + fs, contentY, isAnswerKey, prob.answer);
      return;
    }

    if (prob.fraction_type === 'visual_choice') {
      const modelTop = contentY + fs * 0.8;
      const model = this._drawShadedFractionModel(page, prob.model, contentX, modelTop, 86, prob.model_shape);
      const choicesY = modelTop - model.height - fs * 1.15;
      const availableWidth = this.cellWidth - (contentX - x) - 8;
      const choiceGap = availableWidth / prob.choices.length;
      prob.choices.forEach((choice, index) => {
        const choiceX = contentX + index * choiceGap;
        const boxSize = Math.max(7, fs * 0.62);
        drawBoxOutline(page, choiceX, choicesY - boxSize * 0.18, boxSize, boxSize);
        const correct = choice === prob.answer && isAnswerKey;
        if (correct) this._drawText(page, 'x', choiceX + boxSize * 0.2, choicesY, { isRed: true, fontOverride: boxSize * 0.85 });
        this._drawText(page, choice, choiceX + boxSize + fs * 0.3, choicesY, {
          isRed: correct,
          fontOverride: Math.max(8, fs * 0.72),
        });
      });
      return;
    }

    if (prob.fraction_type === 'operations') {
      let cursor = contentX;
      cursor += this._drawFraction(page, prob.first, cursor, contentY, { fontSize: fs }) + fs * 0.55;
      const symbol = prob.operation === 'x' ? '\u00d7' : prob.operation === '/' ? '\u00f7' : prob.operation;
      this._drawText(page, symbol, cursor, contentY - fs * 0.1, { fontOverride: fs * 1.05 });
      cursor += fs * 1.25;
      cursor += this._drawFraction(page, prob.second, cursor, contentY, { fontSize: fs }) + fs * 0.55;
      this._drawText(page, '=', cursor, contentY - fs * 0.1, { fontOverride: fs });
      this._drawFractionBlank(page, cursor + fs * 1.25, contentY, isAnswerKey, prob.answer);
      return;
    }

    if (prob.fraction_type === 'simplify') {
      const width = this._drawFraction(page, prob.first, contentX, contentY, { fontSize: fs });
      this._drawText(page, '=', contentX + width + fs * 0.55, contentY - fs * 0.1, { fontOverride: fs });
      const answerX = contentX + width + fs * 1.7;
      if (prob.result.denominator === 1) {
        if (isAnswerKey) this._drawText(page, prob.answer, answerX, contentY - fs * 0.1, { isRed: true, fontOverride: fs });
        else this._drawBox(page, answerX, contentY - fs * 0.1, Math.max(2, String(prob.answer).length));
      } else {
        this._drawFractionBlank(page, answerX, contentY, isAnswerKey, prob.answer);
      }
      return;
    }

    if (prob.direction === 'fraction_to_decimal') {
      const width = this._drawFraction(page, prob.fraction, contentX, contentY, { fontSize: fs });
      this._drawText(page, '=', contentX + width + fs * 0.55, contentY - fs * 0.1, { fontOverride: fs });
      const answerX = contentX + width + fs * 1.7;
      if (isAnswerKey) this._drawText(page, prob.answer, answerX, contentY - fs * 0.1, { isRed: true, fontOverride: fs });
      else drawLineSeg(page, answerX, contentY - fs * 0.3, answerX + fs * 3.3, contentY - fs * 0.3, 1);
    } else {
      this._drawText(page, `${prob.decimal} =`, contentX, contentY - fs * 0.1, { fontOverride: fs });
      const textWidth = this.fonts.helvetica.widthOfTextAtSize(`${prob.decimal} =`, fs);
      this._drawFractionBlank(page, contentX + textWidth + fs * 0.55, contentY, isAnswerKey, prob.answer);
    }
  }

  _settingsSummary() {
    const cfg = this.config;
    let opsStr = cfg.mode === 'simultaneous' ? 'linear equations' : cfg.mode;
    if (cfg.mode === 'fractions') opsStr = `fractions (${cfg.fraction_config?.type || 'comparison'})`;
    if (cfg.mode === 'digits') {
      const dc = cfg.digits_config || {};
      const form = dc.direction === 'parts_to_number' ? 'parts to number' : dc.multiplication_form ? 'multiplication expansion' : 'expanded form';
      const decimals = Math.max(0, Number(dc.decimal_places) || 0);
      opsStr = `digits (${form}, ${dc.min_digits || 4}-${dc.max_digits || 5} digits, ${decimals} decimal places)`;
    }
    if (cfg.mode === 'decimals') {
      const dc = cfg.decimal_config || {};
      const leftSide = dc.whole_left === false ? 'whole or decimal left side' : 'whole-number left side';
      opsStr = `decimals (${dc.type || 'multiplication'}, ${leftSide}, max ${dc.left_max_digits || 4} digits)`;
    }
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

    if (this.config.mode === 'digits') {
      const dc = this.config.digits_config || {};
      const instruction = dc.direction === 'parts_to_number'
        ? 'Directions: Write each number in standard form.'
        : dc.multiplication_form
          ? 'Directions: Write each number as digit × place value.'
          : 'Directions: Write each number in expanded form.';
      page.drawText(instruction, {
        x: PDF_PAGE.MARGIN,
        y: PDF_PAGE.HEIGHT - 108,
        size: 9,
        font: this.fonts.timesBold,
        color: PDFLib.rgb(0.18, 0.18, 0.18),
      });
      if (dc.show_example !== false) {
        const decimals = Math.max(0, Math.min(3, Number(dc.decimal_places) || 0));
        const fractionDigits = '476'.slice(0, decimals);
        const number = `8,529${fractionDigits ? `.${fractionDigits}` : ''}`;
        const additiveFraction = [...fractionDigits].map((digit, index) => `0.${'0'.repeat(index)}${digit}`);
        const additive = ['8,000', '500', '20', '9', ...additiveFraction].join(' + ');
        const multiplicationFraction = [...fractionDigits].map((digit, index) => `${digit} × 0.${'0'.repeat(index)}1`);
        const multiplied = ['8 × 1,000', '5 × 100', '2 × 10', '9', ...multiplicationFraction].join(' + ');
        const example = dc.direction === 'parts_to_number'
          ? `${additive} = ${number}`
          : dc.multiplication_form
            ? `${number} = ${multiplied}`
            : `${number} = ${additive}`;
        page.drawText(`Example: ${example}`, {
          x: PDF_PAGE.MARGIN,
          y: PDF_PAGE.HEIGHT - 120,
          size: 8,
          font: helvetica,
          color: PDFLib.rgb(0.3, 0.3, 0.3),
        });
      }
    }

    if (this.config.mode === 'decimals') {
      const dc = this.config.decimal_config || {};
      const type = dc.type || 'multiplication';
      const instruction = type === 'multiplication'
        ? 'Directions: Multiply by the power of ten. Track how each digit changes place value.'
        : type === 'percent'
          ? 'Directions: Convert each decimal to a percentage.'
          : type === 'bar'
            ? 'Directions: Write the decimal shown by each tenths bar.'
            : 'Directions: Solve each decimal place-value problem.';
      page.drawText(instruction, {
        x: PDF_PAGE.MARGIN,
        y: PDF_PAGE.HEIGHT - 108,
        size: 9,
        font: this.fonts.timesBold,
        color: PDFLib.rgb(0.18, 0.18, 0.18),
      });
      if (dc.show_example !== false) {
        const examples = type === 'multiplication'
          ? ['0.01 × 100 = 1', '5,980 × 0.1 = 598']
          : type === 'percent'
            ? ['0.25 = 25%']
            : type === 'bar'
              ? ['7 shaded tenths = 0.7']
              : ['0.01 × 100 = 1', '0.25 = 25%', '7 shaded tenths = 0.7'];
        page.drawText(`Examples: ${examples.join('; ')}`, {
          x: PDF_PAGE.MARGIN,
          y: PDF_PAGE.HEIGHT - 120,
          size: 8,
          font: helvetica,
          color: PDFLib.rgb(0.3, 0.3, 0.3),
        });
      }
    }

    const startY = PDF_PAGE.HEIGHT - PDF_PAGE.HEADER_HEIGHT;
    problems.forEach((prob, i) => {
      const row = Math.floor(i / this.config.columns);
      const col = i % this.config.columns;
      const x = PDF_PAGE.MARGIN + col * this.cellWidth;
      const y = startY - row * this.cellHeight;

      if (prob.operator === 'fraction') {
        this._drawFractionProblem(page, prob, x, y, isAnswerKey, i + 1);
      } else if (prob.operator === 'simultaneous') {
        this._drawSimultaneous(page, prob, x, y, isAnswerKey, i + 1);
      } else if (prob.operator === 'digits') {
        this._drawDigitsProblem(page, prob, x, y, isAnswerKey, i + 1);
      } else if (prob.operator === 'digits_percent') {
        this._drawDecimalPercentProblem(page, prob, x, y, isAnswerKey, i + 1);
      } else if (prob.operator === 'digits_bar') {
        this._drawDecimalBarProblem(page, prob, x, y, isAnswerKey, i + 1);
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
