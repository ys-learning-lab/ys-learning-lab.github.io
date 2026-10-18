// Wires up math.html: reads controls -> MathConfig, renders a live HTML preview,
// validates weight totals / density, and triggers PDF generation via pdf-lib.

const OP_DEFAULT_WEIGHT = { '+': 50, '-': 50, '×': 0, '÷': 0 };
const RATIO_VALUES = Array.from({ length: 21 }, (_, i) => i * 5); // 0,5,...,100
const MIX_STEP = 5;
const OP_MIX_INFO = {
  '+': { label: 'Addition (+)', symbol: '+', css: 'add' },
  '-': { label: 'Subtraction (-)', symbol: '−', css: 'sub' },
  '×': { label: 'Multiplication (×)', symbol: '×', css: 'mul' },
  '÷': { label: 'Division (÷)', symbol: '÷', css: 'div' },
};
const MAX_OPERAND_DIGITS = 3;
const MIN_PROBLEM_FONT_SIZE = 8;
const MAX_PROBLEM_FONT_SIZE = 26;

function populateSelect(sel, values, selected) {
  sel.innerHTML = values.map((v) => `<option value="${v}">${v}</option>`).join('');
  sel.value = String(selected);
}

function initOpPanels() {
  document.querySelectorAll('#panel-standard fieldset[data-op]').forEach((fs) => {
    const op = fs.dataset.op;
    const weightSel = fs.querySelector('.op-weight');
    const cryptoSel = fs.querySelector('.op-cryptopct');
    if (weightSel) weightSel.value = OP_DEFAULT_WEIGHT[op] ?? 25;
    if (cryptoSel) populateSelect(cryptoSel, RATIO_VALUES, 10);
  });
}

function clampDigitCount(value) {
  return Math.max(1, Math.min(MAX_OPERAND_DIGITS, parseInt(value, 10) || 1));
}

function syncDigitOptions(fs) {
  const left = fs.querySelector('.op-digitsl');
  const right = fs.querySelector('.op-digitsr');
  if (!left || !right) return;
  const maxNumber = parseInt(fs.querySelector('.op-maxnum')?.value, 10) || 0;
  const maxAvailableDigits = maxNumber > 0
    ? Math.max(1, Math.min(MAX_OPERAND_DIGITS, String(maxNumber).length))
    : MAX_OPERAND_DIGITS;
  const setAvailable = (select, maxDigits) => {
    [...select.options].forEach((option) => {
      const unavailable = Number(option.value) > maxDigits;
      option.hidden = unavailable;
      option.disabled = unavailable;
    });
    if (Number(select.value) > maxDigits || !select.value) select.value = String(maxDigits);
  };

  setAvailable(left, maxAvailableDigits);
  const negativeMode = fs.querySelector('.op-negatives')?.value || 'never';
  const needsLeftAtLeastRight = fs.dataset.op === '÷'
    || (fs.dataset.op === '-' && negativeMode === 'never');
  setAvailable(right, needsLeftAtLeastRight ? Math.min(maxAvailableDigits, Number(left.value)) : maxAvailableDigits);
}

function syncAllDigitOptions() {
  standardOpFieldsets().forEach(syncDigitOptions);
}

function standardOpFieldsets() {
  return [...document.querySelectorAll('#panel-standard fieldset[data-op]')];
}

function selectedStandardOps() {
  return standardOpFieldsets()
    .filter((fs) => fs.querySelector('.op-enabled')?.checked)
    .map((fs) => fs.dataset.op);
}

function getOpWeight(op) {
  const fs = standardOpFieldsets().find((field) => field.dataset.op === op);
  return parseInt(fs?.querySelector('.op-weight')?.value, 10) || 0;
}

function setOpWeights(weights) {
  standardOpFieldsets().forEach((fs) => {
    const weight = fs.querySelector('.op-weight');
    if (weight && weights[fs.dataset.op] != null) weight.value = weights[fs.dataset.op];
  });
}

function snapMix(value) {
  return Math.round(value / MIX_STEP) * MIX_STEP;
}

function clampProblemFontSize(value) {
  return Math.max(MIN_PROBLEM_FONT_SIZE, Math.min(MAX_PROBLEM_FONT_SIZE, Math.round(Number(value) || 17)));
}

function evenlyDistributedWeights(ops) {
  const totalUnits = 100 / MIX_STEP;
  const base = Math.floor(totalUnits / ops.length);
  const remainder = totalUnits % ops.length;
  return Object.fromEntries(ops.map((op, index) => [op, (base + (index < remainder ? 1 : 0)) * MIX_STEP]));
}

function syncOperationMixer() {
  const selected = selectedStandardOps();
  standardOpFieldsets().forEach((fs) => {
    const enabled = fs.querySelector('.op-enabled')?.checked;
    fs.classList.toggle('hidden', !enabled);
    const toggle = document.querySelector(`.operation-toggle[data-op="${fs.dataset.op}"]`);
    if (toggle) toggle.checked = !!enabled;
  });
  renderOperationDistribution(selected);
  syncAllVerticalToggle();
}

function syncAllVerticalToggle() {
  const master = document.getElementById('standard-all-vertical');
  if (!master) return;
  const verticalInputs = standardOpFieldsets()
    .map((fieldset) => fieldset.querySelector('.op-vertical'))
    .filter(Boolean);
  const verticalCount = verticalInputs.filter((input) => input.checked).length;
  master.checked = verticalInputs.length > 0 && verticalCount === verticalInputs.length;
  master.indeterminate = verticalCount > 0 && verticalCount < verticalInputs.length;
  master.setAttribute('aria-checked', master.indeterminate ? 'mixed' : String(master.checked));
}

function initAllVerticalToggle() {
  const master = document.getElementById('standard-all-vertical');
  if (!master) return;
  master.addEventListener('change', () => {
    const makeVertical = master.checked;
    standardOpFieldsets().forEach((fieldset) => {
      const vertical = fieldset.querySelector('.op-vertical');
      if (vertical) vertical.checked = makeVertical;
    });
    syncAllVerticalToggle();
    syncAutoProblemFontSize();
    updateAll();
  });
  syncAllVerticalToggle();
}

function setOperationWeight(op, requestedValue) {
  const selected = selectedStandardOps();
  const otherOps = selected.filter((item) => item !== op);
  if (!selected.includes(op)) return;
  if (!otherOps.length) {
    setOpWeights({ [op]: 100 });
    return;
  }

  const target = Math.max(MIX_STEP, Math.min(100 - otherOps.length * MIX_STEP, snapMix(requestedValue)));
  const remainingUnits = (100 - target) / MIX_STEP;
  const baseUnits = otherOps.length;
  const extraUnits = remainingUnits - baseUnits;
  const previousExtras = otherOps.map((item) => Math.max(0, getOpWeight(item) / MIX_STEP - 1));
  const previousTotal = previousExtras.reduce((sum, value) => sum + value, 0);
  const provisional = previousExtras.map((value) => previousTotal ? (value / previousTotal) * extraUnits : extraUnits / otherOps.length);
  const assigned = provisional.map((value) => Math.floor(value));
  let unassigned = extraUnits - assigned.reduce((sum, value) => sum + value, 0);
  provisional.map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction)
    .forEach(({ index }) => { if (unassigned-- > 0) assigned[index] += 1; });

  const weights = { [op]: target };
  otherOps.forEach((item, index) => { weights[item] = (1 + assigned[index]) * MIX_STEP; });
  setOpWeights(weights);
}

function closeOperationValueEditor() {
  document.querySelector('.operation-value-editor')?.remove();
}

function openOperationValueEditor(op, handle) {
  closeOperationValueEditor();
  const selected = selectedStandardOps();
  const editor = document.createElement('form');
  editor.className = 'operation-value-editor';
  editor.innerHTML = `<label>${OP_MIX_INFO[op].label}: <input type="number" min="${MIX_STEP}" max="${100 - (selected.length - 1) * MIX_STEP}" step="${MIX_STEP}" value="${getOpWeight(op)}" aria-label="${OP_MIX_INFO[op].label} percentage" />%</label><button type="submit">Apply</button>`;
  const percentage = Number.parseFloat(handle.style.left) || 0;
  editor.style.left = `${Math.min(percentage, 78)}%`;
  document.getElementById('operation-distribution').appendChild(editor);
  const input = editor.querySelector('input');
  input.focus();
  input.select();
  editor.addEventListener('submit', (event) => {
    event.preventDefault();
    setOperationWeight(op, Number(input.value));
    closeOperationValueEditor();
    syncOperationMixer();
    updateAll();
  });
}

function adjustBoundary(selected, boundaryIndex, requestedBoundary) {
  const weights = Object.fromEntries(selected.map((op) => [op, getOpWeight(op)]));
  const before = selected.slice(0, boundaryIndex).reduce((sum, op) => sum + weights[op], 0);
  const pairEnd = before + weights[selected[boundaryIndex]] + weights[selected[boundaryIndex + 1]];
  const boundary = Math.max(before + MIX_STEP, Math.min(pairEnd - MIX_STEP, snapMix(requestedBoundary)));
  weights[selected[boundaryIndex]] = boundary - before;
  weights[selected[boundaryIndex + 1]] = pairEnd - boundary;
  setOpWeights(weights);
}

function operationSegmentLabel(op, weight) {
  if (weight <= MIX_STEP) return `<span class="operation-segment-percent">${weight}%</span>`;
  return `<span class="operation-segment-keycap" aria-hidden="true">${OP_MIX_INFO[op].symbol}</span><span class="operation-segment-percent">${weight}%</span>`;
}

function updateOperationSegmentContent(segment, op, weight) {
  const compact = weight <= MIX_STEP;
  const wasCompact = segment.classList.contains('is-compact');
  segment.classList.toggle('is-compact', compact);
  segment.dataset.symbol = OP_MIX_INFO[op].symbol;
  if (compact !== wasCompact) {
    segment.innerHTML = operationSegmentLabel(op, weight);
    return;
  }
  const percent = segment.querySelector('.operation-segment-percent');
  if (percent) percent.textContent = `${weight}%`;
}

function renderOperationDistribution(selected = selectedStandardOps()) {
  const distribution = document.getElementById('operation-distribution');
  if (!distribution) return;
  closeOperationValueEditor();
  distribution.innerHTML = '';
  if (!selected.length) {
    distribution.classList.add('is-empty');
    distribution.textContent = 'Choose an operation to set its share.';
    return;
  }
  distribution.classList.remove('is-empty');
  let offset = 0;
  selected.forEach((op, index) => {
    const weight = getOpWeight(op);
    const segment = document.createElement('button');
    segment.type = 'button';
    segment.className = `operation-segment operation-segment--${OP_MIX_INFO[op].css}${index === 0 ? ' is-first' : ''}${index === selected.length - 1 ? ' is-last' : ''}`;
    if (weight <= MIX_STEP) segment.classList.add('is-compact');
    segment.dataset.symbol = OP_MIX_INFO[op].symbol;
    segment.style.left = `${offset}%`;
    segment.style.width = `${weight}%`;
    segment.innerHTML = operationSegmentLabel(op, weight);
    segment.setAttribute('aria-label', `Open ${OP_MIX_INFO[op].label} settings, ${weight}% of problems`);
    segment.addEventListener('click', () => jumpToOperationSettings(op));
    distribution.appendChild(segment);
    offset += weight;

    if (index >= selected.length - 1) return;
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'operation-handle';
    handle.style.left = `${offset}%`;
    handle.setAttribute('aria-label', `Adjust ${OP_MIX_INFO[op].label}, currently ${weight}%`);
    handle.addEventListener('click', (event) => {
      if (handle.dataset.dragged === 'true') {
        event.preventDefault();
        handle.dataset.dragged = 'false';
        return;
      }
      openOperationValueEditor(op, handle);
    });
    handle.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const currentBoundary = selected.slice(0, index + 1).reduce((sum, item) => sum + getOpWeight(item), 0);
      adjustBoundary(selected, index, currentBoundary + (event.key === 'ArrowLeft' ? -MIX_STEP : MIX_STEP));
      updateOperationDistributionLayout(selected);
      updateAll();
    });
    handle.addEventListener('pointerdown', (startEvent) => {
      startEvent.stopPropagation();
      const startX = startEvent.clientX;
      let moved = false;
      let framePending = false;
      let latestBoundary = 0;
      const paint = () => {
        framePending = false;
        adjustBoundary(selected, index, latestBoundary);
        updateOperationDistributionLayout(selected);
      };
      handle.dataset.dragged = 'false';
      const move = (event) => {
        const rect = distribution.getBoundingClientRect();
        if (!rect.width) return;
        if (Math.abs(event.clientX - startX) > 3) {
          moved = true;
          handle.dataset.dragged = 'true';
        }
        latestBoundary = ((event.clientX - rect.left) / rect.width) * 100;
        if (!framePending) {
          framePending = true;
          requestAnimationFrame(paint);
        }
      };
      const end = () => {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', end);
        if (framePending) paint();
        if (moved) updateAll();
      };
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', end, { once: true });
    });
    distribution.appendChild(handle);
  });
}

function updateOperationDistributionLayout(selected) {
  const distribution = document.getElementById('operation-distribution');
  if (!distribution) return;
  const segments = [...distribution.querySelectorAll('.operation-segment')];
  const handles = [...distribution.querySelectorAll('.operation-handle')];
  let offset = 0;

  selected.forEach((op, index) => {
    const weight = getOpWeight(op);
    const segment = segments[index];
    if (segment) {
      segment.style.left = `${offset}%`;
      segment.style.width = `${weight}%`;
      updateOperationSegmentContent(segment, op, weight);
      segment.setAttribute('aria-label', `Open ${OP_MIX_INFO[op].label} settings, ${weight}% of problems`);
    }
    offset += weight;
    const handle = handles[index];
    if (handle) {
      handle.style.left = `${offset}%`;
      handle.setAttribute('aria-label', `Adjust ${OP_MIX_INFO[op].label}, currently ${weight}%`);
    }
  });
}

function jumpToOperationSettings(op) {
  const fieldset = standardOpFieldsets().find((item) => item.dataset.op === op);
  if (!fieldset || fieldset.classList.contains('hidden')) return;
  fieldset.classList.remove('is-jump-target');
  void fieldset.offsetWidth;
  fieldset.classList.add('is-jump-target');
  fieldset.setAttribute('tabindex', '-1');
  fieldset.scrollIntoView({ behavior: 'smooth', block: 'start' });
  fieldset.focus({ preventScroll: true });
  window.setTimeout(() => fieldset.classList.remove('is-jump-target'), 1200);
}

function initOperationMixer() {
  document.querySelectorAll('.operation-toggle').forEach((toggle) => {
    toggle.addEventListener('change', () => {
      const fs = standardOpFieldsets().find((field) => field.dataset.op === toggle.dataset.op);
      if (!fs) return;
      const previousSelection = selectedStandardOps();
      if (!toggle.checked && previousSelection.length === 1) {
        toggle.checked = true;
        return;
      }
      fs.querySelector('.op-enabled').checked = toggle.checked;
      const selected = selectedStandardOps();
      setOpWeights(evenlyDistributedWeights(selected));
      syncOperationMixer();
      syncAutoProblemFontSize();
      updateAll();
    });
  });
  syncOperationMixer();
}

function readOpConfig(fs) {
  const g = (sel) => fs.querySelector(sel);
  const negativeMode = g('.op-negatives')?.value || 'never';
  return {
    enabled: g('.op-enabled') ? g('.op-enabled').checked : false,
    weight: g('.op-weight') ? parseInt(g('.op-weight').value, 10) : 0,
    digits_left: g('.op-digitsl') ? clampDigitCount(g('.op-digitsl').value) : 2,
    digits_right: g('.op-digitsr') ? clampDigitCount(g('.op-digitsr').value) : 1,
    max_number: g('.op-maxnum') ? (parseInt(g('.op-maxnum').value, 10) || 0) : 0,
    is_vertical: g('.op-vertical') ? g('.op-vertical').checked : false,
    allow_regrouping: g('.op-regroup') ? g('.op-regroup').checked : false,
    allow_remainder: g('.op-remainder') ? g('.op-remainder').checked : false,
    allow_negatives: negativeMode !== 'never',
    force_negatives: negativeMode === 'force',
    division_answer_digits: fs.dataset.divisionAnswerDigits || null,
    decimal_places: g('.op-decimals') ? parseInt(g('.op-decimals').value, 10) || 0 : 0,
    allow_crypto: g('.op-crypto') ? g('.op-crypto').checked : false,
    pct_crypto: g('.op-cryptopct') ? parseInt(g('.op-cryptopct').value, 10) : 10,
    num_terms: g('.op-terms') ? parseInt(g('.op-terms').value, 10) || 2 : 2,
    allow_zero: g('.op-allowzero') ? g('.op-allowzero').checked : false,
    random_decimal_places: fs.dataset.randomDecimalPlaces === 'true',
  };
}

function getCurrentMode() {
  const active = document.querySelector('.mode-tab.is-active');
  return active ? active.dataset.mode : 'standard';
}

function buildConfig() {
  const rows = parseInt(document.getElementById('cfg-rows').value, 10) || 1;
  const columns = parseInt(document.getElementById('cfg-cols').value, 10) || 1;
  const num_pages = parseInt(document.getElementById('cfg-pages').value, 10) || 1;
  const problem_font_size = clampProblemFontSize(document.getElementById('cfg-font-size').value);
  const circle_question_numbers = document.getElementById('cfg-circle-numbers').checked;
  const randomize_order = document.getElementById('cfg-randorder').checked;
  const mode = getCurrentMode();

  const ops = {};
  document.querySelectorAll('#panel-standard fieldset[data-op]').forEach((fs) => {
    ops[fs.dataset.op] = readOpConfig(fs);
  });

  const mixed_config = {
    enabled_ops: {
      '+': document.getElementById('mixed-add').checked,
      '-': document.getElementById('mixed-sub').checked,
      '×': document.getElementById('mixed-mul').checked,
      '÷': document.getElementById('mixed-div').checked,
    },
    max_digits: parseInt(document.getElementById('mixed-maxdigits').value, 10) || 2,
    num_operations: parseInt(document.getElementById('mixed-numops').value, 10) || 2,
    use_parentheses: document.getElementById('mixed-parens').checked,
    require_mul_div: document.getElementById('mixed-require-muldiv').checked,
    allow_negatives: document.getElementById('mixed-negatives').checked,
    decimal_places: parseInt(document.getElementById('mixed-decimals').value, 10) || 0,
    allow_zero: document.getElementById('mixed-allowzero').checked,
  };

  const simType = document.querySelector('input[name="sim-type"]:checked').value;
  const simultaneous_config = {
    type: simType,
    allow_negatives: document.getElementById('sim-negatives').checked,
    max_coef: parseInt(document.getElementById('sim-maxcoef').value, 10) || 5,
  };

  const include_answer_key = document.getElementById('cfg-answerkey').checked;
  const show_answer_boxes = document.getElementById('cfg-answerboxes').checked;
  const title = document.getElementById('cfg-title').value;
  const teacher = document.getElementById('cfg-teacher').value;
  const show_settings_footer = document.getElementById('cfg-footer').checked;
  const include_answer_qr = document.getElementById('cfg-answerqr').checked;

  return { rows, columns, num_pages, problem_font_size, circle_question_numbers, randomize_order, combined_pdf: true, mode, ops, mixed_config, simultaneous_config, include_answer_key, show_answer_boxes, title, teacher, show_settings_footer, include_answer_qr };
}

// Reverse of readOpConfig() - writes an OpConfig-shaped object back onto one
// operator fieldset's controls. Fields absent from the fieldset (e.g. no
// .op-regroup on ÷) are silently skipped, matching readOpConfig's own guards.
function applyOpConfigToForm(fs, op) {
  const s = (sel, v) => { const el = fs.querySelector(sel); if (el && v != null) el.value = v; };
  const c = (sel, v) => { const el = fs.querySelector(sel); if (el && v != null) el.checked = v; };
  c('.op-enabled', op.enabled);
  s('.op-weight', op.weight);
  s('.op-digitsl', clampDigitCount(op.digits_left));
  s('.op-digitsr', clampDigitCount(op.digits_right));
  s('.op-maxnum', op.max_number);
  c('.op-vertical', op.is_vertical);
  c('.op-regroup', op.allow_regrouping);
  c('.op-remainder', op.allow_remainder);
  s('.op-negatives', op.force_negatives ? 'force' : op.allow_negatives ? 'allow' : 'never');
  s('.op-decimals', op.decimal_places);
  c('.op-crypto', op.allow_crypto);
  s('.op-cryptopct', op.pct_crypto);
  s('.op-terms', op.num_terms);
  c('.op-allowzero', op.allow_zero);
  fs.dataset.randomDecimalPlaces = op.random_decimal_places === true ? 'true' : 'false';
  if (op.division_answer_digits) fs.dataset.divisionAnswerDigits = op.division_answer_digits;
  else delete fs.dataset.divisionAnswerDigits;
}

// Applies a full (or partial) MathConfig back onto every control - used by
// both INI import and (in principle) any future "load a saved config" UI.
function applyMathConfigToForm(cfg) {
  if (!cfg) return;
  if (cfg.rows != null) document.getElementById('cfg-rows').value = cfg.rows;
  if (cfg.columns != null) document.getElementById('cfg-cols').value = cfg.columns;
  if (cfg.num_pages != null) document.getElementById('cfg-pages').value = cfg.num_pages;
  if (cfg.problem_font_size != null) {
    const fontSize = clampProblemFontSize(cfg.problem_font_size);
    document.getElementById('cfg-font-size').value = fontSize;
    document.getElementById('cfg-font-size-value').value = fontSize;
  }
  if (cfg.circle_question_numbers != null) document.getElementById('cfg-circle-numbers').checked = cfg.circle_question_numbers;
  if (cfg.randomize_order != null) document.getElementById('cfg-randorder').checked = cfg.randomize_order;
  if (cfg.include_answer_key != null) document.getElementById('cfg-answerkey').checked = cfg.include_answer_key;
  if (cfg.show_answer_boxes != null) document.getElementById('cfg-answerboxes').checked = cfg.show_answer_boxes;
  if (cfg.title != null) document.getElementById('cfg-title').value = cfg.title;
  if (cfg.teacher != null) document.getElementById('cfg-teacher').value = cfg.teacher;
  if (cfg.show_settings_footer != null) document.getElementById('cfg-footer').checked = cfg.show_settings_footer;
  if (cfg.include_answer_qr != null) document.getElementById('cfg-answerqr').checked = cfg.include_answer_qr;
  if (cfg.mode) setMathMode(cfg.mode);

  if (cfg.ops) {
    document.querySelectorAll('#panel-standard fieldset[data-op]').forEach((fs) => {
      const op = cfg.ops[fs.dataset.op];
      if (op) applyOpConfigToForm(fs, op);
    });
  }

  if (cfg.mixed_config) {
    const mc = cfg.mixed_config;
    if (mc.enabled_ops) {
      if (mc.enabled_ops['+'] != null) document.getElementById('mixed-add').checked = mc.enabled_ops['+'];
      if (mc.enabled_ops['-'] != null) document.getElementById('mixed-sub').checked = mc.enabled_ops['-'];
      if (mc.enabled_ops['×'] != null) document.getElementById('mixed-mul').checked = mc.enabled_ops['×'];
      if (mc.enabled_ops['÷'] != null) document.getElementById('mixed-div').checked = mc.enabled_ops['÷'];
    }
    if (mc.max_digits != null) document.getElementById('mixed-maxdigits').value = mc.max_digits;
    if (mc.num_operations != null) document.getElementById('mixed-numops').value = mc.num_operations;
    if (mc.use_parentheses != null) document.getElementById('mixed-parens').checked = mc.use_parentheses;
    document.getElementById('mixed-require-muldiv').checked = mc.require_mul_div === true;
    if (mc.allow_negatives != null) document.getElementById('mixed-negatives').checked = mc.allow_negatives;
    if (mc.decimal_places != null) document.getElementById('mixed-decimals').value = mc.decimal_places;
    if (mc.allow_zero != null) document.getElementById('mixed-allowzero').checked = mc.allow_zero;
  }

  if (cfg.simultaneous_config) {
    const sc = cfg.simultaneous_config;
    if (sc.type) {
      const el = document.querySelector(`input[name="sim-type"][value="${sc.type}"]`);
      if (el) el.checked = true;
    }
    if (sc.allow_negatives != null) document.getElementById('sim-negatives').checked = sc.allow_negatives;
    if (sc.max_coef != null) document.getElementById('sim-maxcoef').value = sc.max_coef;
  }
  syncAllDigitOptions();
  syncOperationMixer();
  if (cfg.problem_font_size == null) syncAutoProblemFontSize();
}

// ---------- level-based quick templates ----------
// Only uses features the generator actually has (standard +/-/x/÷ with digit
// range/vertical/regrouping/negatives/decimals, mixed continuous equations,
// and 2-variable simultaneous equations) - no fractions/money/geometry/ratios/
// coordinate-plane/statistics, since none of those exist in the generator.
// Full OpConfig shape per operator, so every field the generator/UI reads is
// explicit and template-matching (below) can compare states reliably.
function op(overrides) {
  return {
    enabled: false, weight: 0, digits_left: 2, digits_right: 1, max_number: 0,
    is_vertical: false, allow_regrouping: false, allow_remainder: false,
    allow_negatives: false, force_negatives: false, decimal_places: 0, allow_crypto: false,
    pct_crypto: 10, num_terms: 2, allow_zero: false, random_decimal_places: false,
    division_answer_digits: null,
    ...overrides,
  };
}

const MATH_LEVEL_TEMPLATES = {
  level1: {
    label: 'Level 1',
    cycle: [{
      rows: 5, columns: 4, num_pages: 1, mode: 'standard',
      ops: {
        '+': op({ enabled: true, weight: 50, digits_left: 1, is_vertical: false }),
        '-': op({ enabled: true, weight: 50, digits_left: 1, is_vertical: false }),
        '×': op({ digits_left: 1 }),
        '÷': op({ digits_left: 1 }),
      },
    }],
  },
  level2: {
    label: 'Level 2',
    cycle: [{
      rows: 5, columns: 4, num_pages: 1, mode: 'standard',
      ops: {
        '+': op({ enabled: true, weight: 40, digits_left: 2, is_vertical: false, allow_regrouping: true }),
        '-': op({ enabled: true, weight: 40, digits_left: 2, max_number: 30, is_vertical: false, allow_regrouping: true }),
        '×': op({ enabled: true, weight: 20, digits_left: 1, is_vertical: false }),
        '÷': op({ enabled: false, weight: 0, digits_left: 1, is_vertical: false }),
      },
    }],
  },
  level3: {
    label: 'Level 3',
    cycle: [
      { // A: one-digit multiplication/division fluency
        rows: 5, columns: 4, num_pages: 1, mode: 'standard',
        ops: {
          '+': op({}),
          '-': op({}),
          '×': op({ enabled: true, weight: 60, digits_left: 1, digits_right: 1, is_vertical: true }),
          '÷': op({ enabled: true, weight: 40, digits_left: 1, digits_right: 1, is_vertical: true, division_answer_digits: 'one' }),
        },
      },
      { // B: existing multiplication and division fluency mix
        rows: 5, columns: 4, num_pages: 1, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 10, digits_left: 2, is_vertical: true, allow_regrouping: true }),
          '-': op({ enabled: true, weight: 10, digits_left: 2, is_vertical: true, allow_regrouping: true }),
          // One digit on each side keeps these as multiplication facts.
          '×': op({ enabled: true, weight: 40, digits_left: 1, is_vertical: true }),
          '÷': op({ enabled: true, weight: 40, digits_left: 2, digits_right: 1, is_vertical: true, division_answer_digits: 'one' }),
        },
      },
      /* { // Multi-step problems (mixed continuous expressions)
        rows: 10, columns: 2, num_pages: 1, mode: 'mixed_ops',
        mixed_config: {
          enabled_ops: { '+': true, '-': true, '×': true, '÷': true },
          max_digits: 1, num_operations: 2, use_parentheses: true,
          require_mul_div: false, allow_negatives: false, decimal_places: 0, allow_zero: false,
        },
      }, */
    ],
  },
  level4: {
    label: 'Level 4',
    cycle: [{ // Level 3 arithmetic plus three-digit vertical addition/subtraction
      rows: 5, columns: 4, num_pages: 1, mode: 'standard',
      ops: {
        '+': op({ enabled: true, weight: 25, digits_left: 3, digits_right: 3, is_vertical: true, allow_regrouping: true }),
        '-': op({ enabled: true, weight: 25, digits_left: 3, digits_right: 3, is_vertical: true, allow_regrouping: true }),
        '×': op({ enabled: true, weight: 25, digits_left: 2, digits_right: 1, is_vertical: true }),
        '÷': op({ enabled: true, weight: 25, digits_left: 2, digits_right: 1, is_vertical: true, division_answer_digits: 'mostly_two' }),
      },
    }],
  },
  level5: {
    label: 'Level 5',
    cycle: [
      { // Mixed continuous expressions
        rows: 10, columns: 2, num_pages: 1, mode: 'mixed_ops',
        mixed_config: {
          enabled_ops: { '+': true, '-': true, '×': true, '÷': true },
          max_digits: 2, num_operations: 3, use_parentheses: true,
          require_mul_div: true, allow_negatives: false, decimal_places: 0, allow_zero: false,
        },
      },
      { // Vertical place-value decimals with independently varied decimal points
        rows: 5, columns: 4, num_pages: 1, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 50, digits_left: 3, digits_right: 3, is_vertical: true, allow_regrouping: true, decimal_places: 3, random_decimal_places: true }),
          '-': op({ enabled: true, weight: 50, digits_left: 3, digits_right: 3, is_vertical: true, allow_regrouping: true, decimal_places: 3, random_decimal_places: true }),
          '×': op({ digits_left: 1 }),
          '÷': op({ digits_left: 1 }),
        },
      },
    ],
  },
  level6: {
    label: 'Level 6',
    cycle: [
      { // Negative numbers
        rows: 5, columns: 4, num_pages: 1, mode: 'standard',
        ops: {
          '+': op({ enabled: true, weight: 35, digits_left: 2, digits_right: 2, num_terms: 3, is_vertical: false, allow_regrouping: true, allow_negatives: true, force_negatives: true }),
          '-': op({ enabled: true, weight: 35, digits_left: 2, digits_right: 2, num_terms: 3, is_vertical: false, allow_regrouping: true, allow_negatives: true, force_negatives: true }),
          '×': op({ enabled: true, weight: 30, digits_left: 2, digits_right: 1, is_vertical: false, allow_negatives: true, force_negatives: true }),
          '÷': op({ digits_left: 1 }),
        },
      },
      { // B: one-step equation with a missing x answer
        rows: 4, columns: 5, num_pages: 1, problem_font_size: 11, mode: 'simultaneous',
        simultaneous_config: { type: 'substitution_blank', allow_negatives: false, max_coef: 5 },
      },
      { // C: simple substitution without negative values
        rows: 4, columns: 5, num_pages: 1, problem_font_size: 11, mode: 'simultaneous',
        simultaneous_config: { type: 'substitution_simple', allow_negatives: false, max_coef: 5 },
      },
      { // D: standard two-variable pairs with negative values allowed
        rows: 4, columns: 5, num_pages: 1, problem_font_size: 11, mode: 'simultaneous',
        simultaneous_config: { type: 'standard', allow_negatives: true, max_coef: 5 },
      },
    ],
  },
};

// Extracts just the fields level templates actually set, so we can tell
// whether the form currently matches a given template state (to know
// whether to advance the cycle or start fresh) without a fragile deep-equal
// over the entire MathConfig.
function mathTemplateSignature(cfg) {
  const layout = { rows: cfg.rows, columns: cfg.columns, num_pages: cfg.num_pages };
  if (cfg.mode === 'mixed_ops') {
    return JSON.stringify({ ...layout, mode: cfg.mode, mixed_config: cfg.mixed_config });
  }
  if (cfg.mode === 'simultaneous') {
    return JSON.stringify({ ...layout, mode: cfg.mode, simultaneous_config: cfg.simultaneous_config });
  }
  const ops = {};
  for (const k of ['+', '-', '×', '÷']) {
    const o = cfg.ops[k] || {};
    ops[k] = {
      enabled: o.enabled, weight: o.weight, digits_left: o.digits_left, digits_right: o.digits_right,
      is_vertical: o.is_vertical,
      allow_regrouping: o.allow_regrouping, allow_remainder: o.allow_remainder,
      allow_negatives: o.allow_negatives, force_negatives: o.force_negatives,
      decimal_places: o.decimal_places, num_terms: o.num_terms,
      allow_zero: o.allow_zero, random_decimal_places: o.random_decimal_places,
      division_answer_digits: o.division_answer_digits,
    };
  }
  return JSON.stringify({ ...layout, mode: cfg.mode, ops });
}

let lastAppliedMathLevel = null;
let lastAppliedMathLevelIndex = -1;

function syncLevelTemplateButtons(activeName = null, activeIndex = -1) {
  document.querySelectorAll('.level-template-btn').forEach((btn) => {
    const template = MATH_LEVEL_TEMPLATES[btn.dataset.levelTemplate];
    if (!template) return;
    const isActive = btn.dataset.levelTemplate === activeName;
    const hasVariants = template.cycle.length > 1;
    const variant = hasVariants && isActive ? `-${String.fromCharCode(65 + activeIndex)}` : '';
    btn.textContent = `${template.label}${variant}`;
    btn.classList.toggle('is-active', isActive);
    btn.setAttribute('aria-pressed', isActive ? 'true' : 'false');
  });
}

function applyMathTemplate(name) {
  const template = MATH_LEVEL_TEMPLATES[name];
  if (!template) return;

  const currentMatchesLast = lastAppliedMathLevel === name
    && lastAppliedMathLevelIndex >= 0
    && mathTemplateSignature(buildConfig()) === mathTemplateSignature(template.cycle[lastAppliedMathLevelIndex]);
  const nextIndex = currentMatchesLast ? (lastAppliedMathLevelIndex + 1) % template.cycle.length : 0;
  const next = template.cycle[nextIndex];

  applyMathConfigToForm(next);
  lastAppliedMathLevel = name;
  lastAppliedMathLevelIndex = nextIndex;
  syncLevelTemplateButtons(name, nextIndex);
  updateAll();
}

// ---------- export/import settings as .ini ----------
// Mirrors the section layout the original Tkinter app's configparser used
// (GLOBAL + one OP_<symbol> section per operator), plus MIXED/SIMULTANEOUS
// sections for this port's two extra modes.
const MATH_OPS = ['+', '-', '×', '÷'];

function mathConfigToIni(cfg) {
  const lines = [
    '[GLOBAL]',
    `rows = ${cfg.rows}`,
    `cols = ${cfg.columns}`,
    `copies = ${cfg.num_pages}`,
    `problem_font_size = ${cfg.problem_font_size}`,
    `circle_question_numbers = ${cfg.circle_question_numbers}`,
    `randomize_order = ${cfg.randomize_order}`,
    `mode = ${cfg.mode}`,
    `include_answer_key = ${cfg.include_answer_key}`,
    `show_answer_boxes = ${cfg.show_answer_boxes}`,
    `title = ${cfg.title || ''}`,
    `teacher = ${cfg.teacher || ''}`,
    `show_settings_footer = ${cfg.show_settings_footer}`,
    `include_answer_qr = ${cfg.include_answer_qr}`,
    '',
  ];
  for (const op of MATH_OPS) {
    const o = cfg.ops[op] || {};
    lines.push(`[OP_${op}]`);
    lines.push(`enabled = ${!!o.enabled}`);
    lines.push(`weight = ${o.weight ?? 0}`);
    lines.push(`digits_left = ${o.digits_left ?? 2}`);
    lines.push(`digits_right = ${o.digits_right ?? 1}`);
    lines.push(`max_number = ${o.max_number ?? 0}`);
    lines.push(`is_vertical = ${!!o.is_vertical}`);
    lines.push(`allow_regrouping = ${!!o.allow_regrouping}`);
    lines.push(`allow_remainder = ${!!o.allow_remainder}`);
    lines.push(`allow_negatives = ${!!o.allow_negatives}`);
    lines.push(`force_negatives = ${!!o.force_negatives}`);
    lines.push(`decimal_places = ${o.decimal_places ?? 0}`);
    lines.push(`allow_crypto = ${!!o.allow_crypto}`);
    lines.push(`pct_crypto = ${o.pct_crypto ?? 10}`);
    lines.push(`num_terms = ${o.num_terms ?? 2}`);
    lines.push(`allow_zero = ${!!o.allow_zero}`);
    lines.push(`random_decimal_places = ${!!o.random_decimal_places}`);
    lines.push(`division_answer_digits = ${o.division_answer_digits || ''}`);
    lines.push('');
  }
  lines.push('[MIXED]');
  lines.push(`add = ${!!cfg.mixed_config.enabled_ops['+']}`);
  lines.push(`sub = ${!!cfg.mixed_config.enabled_ops['-']}`);
  lines.push(`mul = ${!!cfg.mixed_config.enabled_ops['×']}`);
  lines.push(`div = ${!!cfg.mixed_config.enabled_ops['÷']}`);
  lines.push(`max_digits = ${cfg.mixed_config.max_digits}`);
  lines.push(`num_operations = ${cfg.mixed_config.num_operations}`);
  lines.push(`use_parentheses = ${cfg.mixed_config.use_parentheses}`);
  lines.push(`require_mul_div = ${cfg.mixed_config.require_mul_div}`);
  lines.push(`allow_negatives = ${cfg.mixed_config.allow_negatives}`);
  lines.push(`decimal_places = ${cfg.mixed_config.decimal_places}`);
  lines.push(`allow_zero = ${cfg.mixed_config.allow_zero}`);
  lines.push('');
  lines.push('[SIMULTANEOUS]');
  lines.push(`type = ${cfg.simultaneous_config.type}`);
  lines.push(`allow_negatives = ${cfg.simultaneous_config.allow_negatives}`);
  lines.push(`max_coef = ${cfg.simultaneous_config.max_coef}`);

  return lines.join('\n') + '\n';
}

function mathConfigFromIni(text) {
  const cfg = { ops: {}, mixed_config: { enabled_ops: {} }, simultaneous_config: {} };
  const toBool = (v) => /^(true|1|yes)$/i.test(v.trim());
  const toInt = (v) => parseInt(v, 10);
  let section = '';
  let currentOp = null;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const sectionMatch = line.match(/^\[(.+)\]$/);
    if (sectionMatch) {
      section = sectionMatch[1];
      if (section.startsWith('OP_')) {
        currentOp = section.slice(3);
        cfg.ops[currentOp] = {};
      } else {
        section = section.toUpperCase();
        currentOp = null;
      }
      continue;
    }
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim().toLowerCase();
    const value = line.slice(eq + 1).trim();

    if (currentOp) {
      const o = cfg.ops[currentOp];
      if (key === 'enabled') o.enabled = toBool(value);
      else if (key === 'weight') o.weight = toInt(value);
      else if (key === 'digits_left') o.digits_left = toInt(value);
      else if (key === 'digits_right') o.digits_right = toInt(value);
      else if (key === 'max_number') o.max_number = toInt(value);
      else if (key === 'is_vertical') o.is_vertical = toBool(value);
      else if (key === 'allow_regrouping') o.allow_regrouping = toBool(value);
      else if (key === 'allow_remainder') o.allow_remainder = toBool(value);
      else if (key === 'allow_negatives') o.allow_negatives = toBool(value);
      else if (key === 'force_negatives') o.force_negatives = toBool(value);
      else if (key === 'decimal_places') o.decimal_places = toInt(value);
      else if (key === 'allow_crypto') o.allow_crypto = toBool(value);
      else if (key === 'pct_crypto') o.pct_crypto = toInt(value);
      else if (key === 'num_terms') o.num_terms = toInt(value);
      else if (key === 'allow_zero') o.allow_zero = toBool(value);
      else if (key === 'random_decimal_places') o.random_decimal_places = toBool(value);
      else if (key === 'division_answer_digits') o.division_answer_digits = value || null;
    } else if (section === 'GLOBAL') {
      if (key === 'rows') cfg.rows = toInt(value);
      else if (key === 'cols') cfg.columns = toInt(value);
      else if (key === 'copies') cfg.num_pages = toInt(value);
      else if (key === 'problem_font_size') cfg.problem_font_size = toInt(value);
      else if (key === 'circle_question_numbers') cfg.circle_question_numbers = toBool(value);
      else if (key === 'randomize_order') cfg.randomize_order = toBool(value);
      else if (key === 'mode') cfg.mode = value;
      else if (key === 'include_answer_key') cfg.include_answer_key = toBool(value);
      else if (key === 'show_answer_boxes') cfg.show_answer_boxes = toBool(value);
      else if (key === 'title') cfg.title = value;
      else if (key === 'teacher') cfg.teacher = value;
      else if (key === 'show_settings_footer') cfg.show_settings_footer = toBool(value);
      else if (key === 'include_answer_qr') cfg.include_answer_qr = toBool(value);
    } else if (section === 'MIXED') {
      if (key === 'add') cfg.mixed_config.enabled_ops['+'] = toBool(value);
      else if (key === 'sub') cfg.mixed_config.enabled_ops['-'] = toBool(value);
      else if (key === 'mul') cfg.mixed_config.enabled_ops['×'] = toBool(value);
      else if (key === 'div') cfg.mixed_config.enabled_ops['÷'] = toBool(value);
      else if (key === 'max_digits') cfg.mixed_config.max_digits = toInt(value);
      else if (key === 'num_operations') cfg.mixed_config.num_operations = toInt(value);
      else if (key === 'use_parentheses') cfg.mixed_config.use_parentheses = toBool(value);
      else if (key === 'require_mul_div') cfg.mixed_config.require_mul_div = toBool(value);
      else if (key === 'allow_negatives') cfg.mixed_config.allow_negatives = toBool(value);
      else if (key === 'decimal_places') cfg.mixed_config.decimal_places = toInt(value);
      else if (key === 'allow_zero') cfg.mixed_config.allow_zero = toBool(value);
    } else if (section === 'SIMULTANEOUS') {
      if (key === 'type') cfg.simultaneous_config.type = value;
      else if (key === 'allow_negatives') cfg.simultaneous_config.allow_negatives = toBool(value);
      else if (key === 'max_coef') cfg.simultaneous_config.max_coef = toInt(value);
    }
  }
  return cfg;
}

function exportMathIni() {
  const cfg = buildConfig();
  downloadTextFile(mathConfigToIni(cfg), `math_worksheet_settings_${timestamp()}.ini`, 'text/plain');
}

function importMathIni(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const cfg = mathConfigFromIni(String(reader.result));
      applyMathConfigToForm(cfg);
      updateAll();
      const status = document.getElementById('generate-status');
      if (status) status.textContent = `Imported settings from ${file.name}.`;
    } catch (e) {
      alert('Could not read that .ini file: ' + e.message);
    }
  };
  reader.onerror = () => alert('Could not read that file.');
  reader.readAsText(file);
}

function validateWeights(cfg) {
  const warn = document.getElementById('weight-warning');
  if (cfg.mode !== 'standard') { warn.classList.add('hidden'); return true; }
  const total = Object.values(cfg.ops).filter((o) => o.enabled).reduce((s, o) => s + o.weight, 0);
  if (total !== 100) {
    warn.textContent = `Total mix percentage for enabled operators must equal exactly 100%. Current total: ${total}%`;
    warn.classList.remove('hidden');
    return false;
  }
  warn.classList.add('hidden');
  return true;
}

function checkDensity(cfg) {
  const warnEl = document.getElementById('density-warning');
  const maxRecommendedRows = cfg.mode === 'simultaneous' ? 5 : 10;
  const dense = cfg.rows > maxRecommendedRows || cfg.rows * cfg.columns > 24;
  if (dense) {
    const modeLabel = cfg.mode === 'simultaneous' ? 'equation-pair' : cfg.mode.replace('_', ' ');
    warnEl.textContent = `Layout (${cfg.rows} rows x ${cfg.columns} cols) exceeds recommended spacing for ${modeLabel} problems - content may look tightly packed.`;
    warnEl.classList.remove('hidden');
  } else {
    warnEl.classList.add('hidden');
  }
  return dense;
}

// ---------- exact first-page PDF preview ----------
let printPreviewTimer = null;
let printPreviewRenderId = 0;
let printPreviewPageRenderId = 0;
let previewPagesCache = null;
let previewConfigSignature = '';
let pdfJsPromise = null;

function printableConfigSignature(cfg) {
  return JSON.stringify(cfg);
}

function loadPdfJs() {
  if (!pdfJsPromise) {
    pdfJsPromise = import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.min.mjs').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/6.3.289/pdf.worker.min.mjs';
      return pdfjs;
    });
  }
  return pdfJsPromise;
}

async function drawPrintPreview(cfg, renderId) {
  const status = document.getElementById('print-preview-status');
  const canvas = document.getElementById('print-preview-canvas');
  const thumbnails = document.getElementById('print-preview-thumbnails');

  try {
    const generator = new MathGenerator(cfg);
    const pages = generator.generatePages();
    if (!pages.length || !pages[0].length) throw new Error('Select at least one operation with a nonzero share.');

    previewPagesCache = pages;
    previewConfigSignature = printableConfigSignature(cfg);

    const previewConfig = { ...cfg, include_answer_key: false };
    const renderer = new MathPDFRenderer(previewConfig, pages);
    const bytes = await renderer.renderCombined();
    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({ data: bytes.slice() });
    const pdf = await loadingTask.promise;
    if (renderId !== printPreviewRenderId) return;

    thumbnails.innerHTML = '';
    thumbnails.classList.toggle('hidden', pdf.numPages <= 1);
    await renderMainPreviewPage(pdf, 1, renderId);
    if (pdf.numPages > 1) await renderPreviewThumbnails(pdf, renderId);
  } catch (error) {
    if (renderId !== printPreviewRenderId) return;
    canvas.classList.add('hidden');
    status.classList.remove('hidden');
    status.classList.add('text-red-600');
    status.textContent = `Print preview unavailable: ${error.message}`;
  }
}

async function renderMainPreviewPage(pdf, pageNumber, renderId) {
  const stage = document.getElementById('print-preview-stage');
  const status = document.getElementById('print-preview-status');
  const canvas = document.getElementById('print-preview-canvas');
  const pageLabel = document.getElementById('print-preview-page-label');
  const pageRenderId = ++printPreviewPageRenderId;
  const page = await pdf.getPage(pageNumber);
  if (renderId !== printPreviewRenderId || pageRenderId !== printPreviewPageRenderId) return;

  const baseViewport = page.getViewport({ scale: 1 });
  const availableWidth = Math.max(200, stage.clientWidth - 20);
  const cssScale = Math.min(1, availableWidth / baseViewport.width);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const renderViewport = page.getViewport({ scale: cssScale * pixelRatio });
  const renderedCanvas = document.createElement('canvas');
  renderedCanvas.width = Math.ceil(renderViewport.width);
  renderedCanvas.height = Math.ceil(renderViewport.height);
  await page.render({ canvasContext: renderedCanvas.getContext('2d'), viewport: renderViewport }).promise;
  if (renderId !== printPreviewRenderId || pageRenderId !== printPreviewPageRenderId) return;

  canvas.width = renderedCanvas.width;
  canvas.height = renderedCanvas.height;
  canvas.style.width = `${Math.round(baseViewport.width * cssScale)}px`;
  canvas.style.height = `${Math.round(baseViewport.height * cssScale)}px`;
  canvas.getContext('2d').drawImage(renderedCanvas, 0, 0);
  canvas.setAttribute('aria-label', `Worksheet page ${pageNumber} of ${pdf.numPages} print preview`);
  canvas.classList.remove('hidden');
  status.classList.add('hidden');
  pageLabel.textContent = `Worksheet page ${pageNumber} of ${pdf.numPages}`;
  document.querySelectorAll('.print-preview-thumbnail').forEach((button) => {
    const active = Number(button.dataset.pageNumber) === pageNumber;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-current', active ? 'page' : 'false');
  });
}

async function renderPreviewThumbnails(pdf, renderId) {
  const thumbnails = document.getElementById('print-preview-thumbnails');
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
    if (renderId !== printPreviewRenderId) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `print-preview-thumbnail${pageNumber === 1 ? ' is-active' : ''}`;
    button.dataset.pageNumber = String(pageNumber);
    button.setAttribute('aria-label', `Show worksheet page ${pageNumber}`);
    button.setAttribute('aria-current', pageNumber === 1 ? 'page' : 'false');
    const thumbnailCanvas = document.createElement('canvas');
    const caption = document.createElement('span');
    caption.textContent = `Page ${pageNumber}`;
    button.append(thumbnailCanvas, caption);
    thumbnails.appendChild(button);

    const page = await pdf.getPage(pageNumber);
    const baseViewport = page.getViewport({ scale: 1 });
    const cssWidth = 92;
    const cssScale = cssWidth / baseViewport.width;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
    const viewport = page.getViewport({ scale: cssScale * pixelRatio });
    thumbnailCanvas.width = Math.ceil(viewport.width);
    thumbnailCanvas.height = Math.ceil(viewport.height);
    thumbnailCanvas.style.width = `${cssWidth}px`;
    thumbnailCanvas.style.height = `${Math.round(baseViewport.height * cssScale)}px`;
    await page.render({ canvasContext: thumbnailCanvas.getContext('2d'), viewport }).promise;
    if (renderId !== printPreviewRenderId) return;

    button.addEventListener('click', () => renderMainPreviewPage(pdf, pageNumber, renderId));
  }
}

function renderPreview(cfg) {
  clearTimeout(printPreviewTimer);
  const status = document.getElementById('print-preview-status');
  const canvas = document.getElementById('print-preview-canvas');
  const thumbnails = document.getElementById('print-preview-thumbnails');
  const pageLabel = document.getElementById('print-preview-page-label');
  status.textContent = 'Updating print preview…';
  status.classList.remove('hidden', 'text-red-600');
  canvas.classList.add('hidden');
  thumbnails.classList.add('hidden');
  thumbnails.innerHTML = '';
  pageLabel.textContent = 'Worksheet page 1';
  printPreviewPageRenderId++;
  const renderId = ++printPreviewRenderId;
  printPreviewTimer = setTimeout(() => drawPrintPreview(cfg, renderId), 180);
}

function syncGenerateButtonLabel(cfg) {
  const btn = document.getElementById('generate-btn');
  if (!btn) return;
  btn.textContent = cfg.include_answer_key ? 'Generate PDF (Worksheet + Answer Key)' : 'Generate PDF (Worksheet Only)';
}

function updateAll() {
  syncAllDigitOptions();
  const cfg = buildConfig();
  validateWeights(cfg);
  checkDensity(cfg);
  renderPreview(cfg);
  syncGenerateButtonLabel(cfg);
}

function refreshWorksheetPreview() {
  previewPagesCache = null;
  previewConfigSignature = null;
  updateAll();
}

function setMathMode(mode) {
  const btn = document.querySelector(`.mode-tab[data-mode="${mode}"]`);
  if (!btn) return;
  document.querySelectorAll('.mode-tab').forEach((b) => {
    const active = b === btn;
    b.classList.toggle('is-active', active);
    b.setAttribute('aria-selected', active ? 'true' : 'false');
  });

  document.querySelectorAll('.mode-panel').forEach((p) => p.classList.add('hidden'));
  document.getElementById(`panel-${mode}`).classList.remove('hidden');
  const operationMixer = document.getElementById('operation-mixer');
  if (operationMixer) operationMixer.hidden = mode !== 'standard';
  const modeFolder = document.getElementById('worksheet-mode-folder');
  if (modeFolder) modeFolder.dataset.mode = mode;
}

function initTabs() {
  document.querySelectorAll('.mode-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      setMathMode(btn.dataset.mode);
      syncAutoProblemFontSize();
      updateAll();
    });
  });
}

function bindLiveInputs() {
  ['controls', 'panel-mixed_ops', 'panel-simultaneous'].forEach((id) => {
    const container = document.getElementById(id);
    if (!container) return;
    container.addEventListener('input', updateAll);
    container.addEventListener('change', updateAll);
  });
}

function initProblemFontSizeControl() {
  const slider = document.getElementById('cfg-font-size');
  const valueInput = document.getElementById('cfg-font-size-value');
  if (!slider || !valueInput) return;

  slider.addEventListener('input', () => { valueInput.value = slider.value; });
  valueInput.addEventListener('input', () => {
    if (valueInput.value !== '') slider.value = String(clampProblemFontSize(valueInput.value));
  });
  valueInput.addEventListener('change', () => {
    const value = clampProblemFontSize(valueInput.value);
    slider.value = String(value);
    valueInput.value = String(value);
  });

  ['cfg-rows', 'cfg-cols'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', syncAutoProblemFontSize);
  });
  document.querySelectorAll('#panel-standard .op-vertical').forEach((input) => {
    input.addEventListener('change', () => {
      syncAllVerticalToggle();
      syncAutoProblemFontSize();
    });
  });
  syncAutoProblemFontSize();
}

function syncAutoProblemFontSize() {
  const slider = document.getElementById('cfg-font-size');
  const valueInput = document.getElementById('cfg-font-size-value');
  if (!slider || !valueInput || typeof calculateMathProblemFontSize !== 'function') return;
  const mode = getCurrentMode();
  const hasVertical = mode === 'standard' && standardOpFieldsets().some((fieldset) => (
    fieldset.querySelector('.op-enabled')?.checked && fieldset.querySelector('.op-vertical')?.checked
  ));
  const value = calculateMathProblemFontSize({
    rows: document.getElementById('cfg-rows').value,
    columns: document.getElementById('cfg-cols').value,
    mode,
    has_vertical: hasVertical,
  });
  slider.value = String(value);
  valueInput.value = String(value);
}

async function handleGenerate() {
  const cfg = buildConfig();
  if (!validateWeights(cfg)) {
    alert('Total mix percentage for enabled operators must equal exactly 100% before generating.');
    return;
  }
  if (checkDensity(cfg)) {
    const proceed = confirm(`The selected row/column layout (${cfg.rows} rows x ${cfg.columns} columns) exceeds recommended spacing limits.\n\nQuestions may appear tightly packed or overlap. Continue anyway?`);
    if (!proceed) return;
  }

  const status = document.getElementById('generate-status');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = 'Generating PDF...';

  // Open the results tab synchronously now (still within the click's user-
  // gesture context) and fill it in once the PDF is ready - opening it after
  // the awaits below risks the browser's popup blocker treating it as not
  // user-initiated.
  const resultTab = window.open('', '_blank');

  try {
    const signature = printableConfigSignature(cfg);
    const pages = previewPagesCache && previewConfigSignature === signature
      ? previewPagesCache
      : new MathGenerator(cfg).generatePages();
    if (!pages.length || !pages[0].length) {
      status.textContent = 'Nothing to generate - check your operator settings.';
      if (resultTab) resultTab.close();
      btn.disabled = false;
      return;
    }

    const renderer = new MathPDFRenderer(cfg, pages);
    const bytes = await renderer.renderCombined();
    const filename = cfg.include_answer_key
      ? `math_worksheet_and_answers_${timestamp()}.pdf`
      : `math_worksheet_${timestamp()}.pdf`;
    await openPdfResults(bytes, filename, 'math.html', 'Math Worksheet Generator', resultTab);
    status.textContent = 'Opened your worksheet in a new tab.';
  } catch (e) {
    console.error(e);
    status.textContent = 'Error generating PDF: ' + e.message;
    if (resultTab) resultTab.close();
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initOpPanels();
  initOperationMixer();
  initAllVerticalToggle();
  initTabs();
  initProblemFontSizeControl();
  bindLiveInputs();
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.getElementById('refresh-preview-btn')?.addEventListener('click', refreshWorksheetPreview);

  document.querySelectorAll('.level-template-btn').forEach((btn) => {
    btn.addEventListener('click', () => applyMathTemplate(btn.dataset.levelTemplate));
  });
  syncLevelTemplateButtons();

  document.getElementById('export-ini-btn').addEventListener('click', exportMathIni);
  document.getElementById('import-ini-btn').addEventListener('click', () => document.getElementById('import-ini-file').click());
  document.getElementById('import-ini-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importMathIni(file);
    e.target.value = ''; // allow re-importing the same file later
  });

  updateAll();
});
