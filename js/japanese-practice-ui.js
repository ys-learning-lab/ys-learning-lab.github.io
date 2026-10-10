// Wires up japanese-practice.html: mode toggling (single/row/all), builds
// the row checkboxes from HIRAGANA_ROWS, validates the character selection,
// and triggers PDF generation via pdf-lib.

function getScript() {
  return document.querySelector('input[name="cfg-script"]:checked').value;
}

// Table data is hiragana; convert for display/selection when katakana is chosen.
function inScript(char) {
  return getScript() === 'kata' ? toKatakana(char) : char;
}

const DEFAULT_TITLES = { hira: 'Hiragana Writing Practice', kata: 'Katakana Writing Practice' };

// Rebuilt whenever the script changes; the ticked rows are kept.
function buildRowCheckboxes() {
  const container = document.getElementById('row-panel');
  const first = !container.children.length;
  const checked = new Set(Array.from(container.querySelectorAll('.row-check:checked')).map((el) => el.value));
  container.innerHTML = HIRAGANA_ROWS.map((r) => `
    <label class="flex items-center gap-2 text-xs">
      <input type="checkbox" class="row-check h-4 w-4" value="${r.id}" ${(first ? r.id === 'A' : checked.has(r.id)) ? 'checked' : ''} /> ${inScript(r.label[0]) + r.label.slice(1)} (${r.chars.map(inScript).join('')})
    </label>
  `).join('');
}

// Romaji reading per character, gojuon order (matches HIRAGANA_ROWS exactly)
// - shown alongside each dropdown option purely so a parent/teacher can find
// the right character without needing to read hiragana themselves.
const HIRAGANA_ROMAJI = {
  'あ': 'a', 'い': 'i', 'う': 'u', 'え': 'e', 'お': 'o',
  'か': 'ka', 'き': 'ki', 'く': 'ku', 'け': 'ke', 'こ': 'ko',
  'さ': 'sa', 'し': 'shi', 'す': 'su', 'せ': 'se', 'そ': 'so',
  'た': 'ta', 'ち': 'chi', 'つ': 'tsu', 'て': 'te', 'と': 'to',
  'な': 'na', 'に': 'ni', 'ぬ': 'nu', 'ね': 'ne', 'の': 'no',
  'は': 'ha', 'ひ': 'hi', 'ふ': 'fu', 'へ': 'he', 'ほ': 'ho',
  'ま': 'ma', 'み': 'mi', 'む': 'mu', 'め': 'me', 'も': 'mo',
  'や': 'ya', 'ゆ': 'yu', 'よ': 'yo',
  'ら': 'ra', 'り': 'ri', 'る': 'ru', 'れ': 're', 'ろ': 'ro',
  'わ': 'wa', 'を': 'wo', 'ん': 'n',
};

// Rebuilt whenever the script changes; the same sound stays selected.
function buildSingleSelect() {
  const select = document.getElementById('cfg-single');
  const previous = select.value ? toHiragana(select.value) : null;
  select.innerHTML = HIRAGANA_ROWS.flatMap((r) => r.chars).map((c) => `
    <option value="${inScript(c)}">${inScript(c)} (${HIRAGANA_ROMAJI[c] || '?'})</option>
  `).join('');
  if (previous) select.value = inScript(previous);
}

function onScriptChange() {
  const titleInput = document.getElementById('cfg-title');
  if (Object.values(DEFAULT_TITLES).includes(titleInput.value)) titleInput.value = DEFAULT_TITLES[getScript()];
  buildRowCheckboxes();
  buildSingleSelect();
}

function getMode() {
  return document.querySelector('input[name="cfg-mode"]:checked').value;
}

// Row/all mode packs every selected character onto the page edge-to-edge
// (see the renderer's right-to-left column packing), so a whole 行 (5
// characters) only fits on one page at a modest repeat count - single-
// character mode has the opposite goal (fill a page with just one
// character), hence the very different defaults.
function applyModeDefaults(mode) {
  document.getElementById('cfg-repeats').value = mode === 'single' ? 15 : 5;
  const wordsCheckbox = document.getElementById('cfg-words');
  wordsCheckbox.disabled = mode !== 'single';
  if (mode !== 'single') wordsCheckbox.checked = false;
  syncWordControls();
}

// The word inputs only matter in single-character mode with the checkbox on.
function syncWordControls() {
  const active = getMode() === 'single' && document.getElementById('cfg-words').checked;
  document.getElementById('custom-words').classList.toggle('opacity-50', !active);
  for (const id of ['cfg-word1', 'cfg-word2', 'cfg-hide']) document.getElementById(id).disabled = !active;
  document.getElementById('word-fieldset').classList.toggle('hidden', getMode() !== 'single');
  // Built-in example words exist for hiragana only.
  const kata = getScript() === 'kata';
  document.getElementById('kata-words-note').classList.toggle('hidden', !kata);
  document.getElementById('hira-words-note').classList.toggle('hidden', kata);
  const ph = (hira1, hira2, kata1, kata2) => (kata ? [kata1, kata2] : [hira1, hira2]);
  const [p1, p2] = ph(I18N.t('word.ph.hira1', 'e.g. ねこ'), I18N.t('word.ph.hira2', 'e.g. みかん'), I18N.t('word.ph.kata1', 'e.g. ケーキ'), I18N.t('word.ph.kata2', 'e.g. パン'));
  document.getElementById('cfg-word1').placeholder = p1;
  document.getElementById('cfg-word2').placeholder = p2;
}

function syncModePanels() {
  const mode = getMode();
  document.getElementById('single-panel').classList.toggle('hidden', mode !== 'single');
  document.getElementById('row-panel').classList.toggle('hidden', mode !== 'row');
  applyModeDefaults(mode);
}

function buildConfig() {
  const mode = getMode();
  const selectedRows = Array.from(document.querySelectorAll('.row-check:checked')).map((el) => el.value);
  const singleValue = document.getElementById('cfg-single').value;
  const singleChars = singleValue ? [singleValue] : [];
  const repeats = Math.max(3, Math.min(30, parseInt(document.getElementById('cfg-repeats').value, 10) || 15));
  const includeWords = document.getElementById('cfg-words').checked;
  const wordsActive = includeWords && mode === 'single';
  const script = getScript();
  const parsed = parsePracticeWords([document.getElementById('cfg-word1').value, document.getElementById('cfg-word2').value], singleChars[0], script);
  const customWords = wordsActive ? parsed.words : [];
  // Which problem (if any) the typed words have: disallowed characters, or a word
  // that doesn't contain the selected character.
  const wordsError = !wordsActive ? null : !parsed.valid ? 'chars' : parsed.blocked.length ? 'blocked' : parsed.missing ? 'missing' : null;
  const wordsValid = !wordsError;
  const hideOthers = wordsActive && document.getElementById('cfg-hide').checked;
  const title = document.getElementById('cfg-title').value;
  const teacher = document.getElementById('cfg-teacher').value;
  return { mode, script, pdfLang: getPdfLang(), selectedRows, singleChars, repeats, includeWords, customWords, wordsValid, wordsError, blockedWords: parsed.blocked, hideOthers, title, teacher };
}

function wordErrorMessage(cfg) {
  if (cfg.wordsError === 'blocked') {
    return cfg.blockedWords.map((word) => I18N.t('word.blocked', '{word}: That word can\'t be used.', { word })).join(' ');
  }
  if (cfg.wordsError === 'missing') {
    return I18N.t('word.errorMissing', 'Each word must contain the selected character ({char}).', { char: cfg.singleChars[0] });
  }
  const script = cfg.script === 'kata' ? I18N.t('script.kata', 'katakana') : I18N.t('script.hira', 'hiragana');
  return I18N.t('word.error', 'Words can use only {script} characters and ー (not as the first letter), up to 5 letters each.', { script });
}

function updatePreviewSummary() {
  syncWordControls();
  const cfg = buildConfig();
  const wordError = document.getElementById('word-error');
  wordError.classList.toggle('hidden', cfg.wordsValid);
  if (!cfg.wordsValid) wordError.textContent = wordErrorMessage(cfg);
  const generator = new HiraganaPracticeGenerator(cfg);
  const chars = generator.selectedChars();
  const summary = document.getElementById('preview-summary');

  const tr = I18N.t;
  const modeLabel = cfg.mode === 'single' ? tr('sum.modeSingle', 'Single character(s)') : cfg.mode === 'row' ? tr('sum.modeRow', 'By row (行)') : tr('sum.modeAll', 'All 46 basic characters');
  const scriptLabel = cfg.script === 'kata' ? tr('script.kata', 'katakana') : tr('script.hira', 'hiragana');
  const lines = [
    `<div><span class="font-semibold">${tr('sum.script', 'Script:')}</span> <span class="capitalize">${scriptLabel}</span></div>`,
    `<div><span class="font-semibold">${tr('sum.mode', 'Mode:')}</span> ${modeLabel}</div>`,
    `<div><span class="font-semibold">${tr('sum.chars', 'Characters selected:')}</span> ${chars.length ? chars.join(' ') : tr('sum.none', '(none - pick at least one)')}</div>`,
    `<div><span class="font-semibold">${tr('sum.repeats', 'Repetitions per character:')}</span> ${cfg.repeats}</div>`,
    `<div><span class="font-semibold">${tr('sum.words', 'Example words:')}</span> ${!cfg.includeWords ? tr('sum.no', 'No')
      : cfg.customWords.length ? tr('sum.wordsCustom', 'Your words: {words}', { words: cfg.customWords.join(' / ') })
      : tr('sum.yes', 'Yes (where available)')}</div>`,
    ...(cfg.hideOthers ? [`<div><span class="font-semibold">${tr('sum.hide', 'Other letters:')}</span> ${tr('sum.hideValue', 'Hidden (sample answer on page 2)')}</div>`] : []),
  ];
  summary.innerHTML = lines.join('');
}

async function handleGenerate() {
  const cfg = buildConfig();
  const generator = new HiraganaPracticeGenerator(cfg);
  const chars = generator.selectedChars();

  const status = document.getElementById('generate-status');
  if (!chars.length) {
    status.textContent = I18N.t('status.pick', 'Pick at least one character first.');
    return;
  }
  if (!cfg.wordsValid) {
    status.textContent = wordErrorMessage(cfg);
    return;
  }

  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = I18N.t('status.working', 'Generating PDF...');

  const resultTab = window.open('', '_blank');

  try {
    const renderer = new HiraganaPracticeRenderer(cfg, chars);
    const bytes = await renderer.render();
    const filename = `${cfg.script === 'kata' ? 'katakana' : 'hiragana'}_practice_${timestamp()}.pdf`;
    await openPdfResults(bytes, filename, 'japanese-practice.html', 'Kana Writing Practice', resultTab);
    status.textContent = I18N.t('status.done', 'Opened your worksheet in a new tab.');
  } catch (e) {
    console.error(e);
    status.textContent = I18N.t('status.error', 'Error generating PDF: ') + e.message;
    if (resultTab) resultTab.close();
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  buildRowCheckboxes();
  buildSingleSelect();
  syncModePanels();
  updatePreviewSummary();

  document.querySelectorAll('input[name="cfg-script"]').forEach((el) => {
    el.addEventListener('change', onScriptChange);
  });
  document.querySelectorAll('input[name="cfg-mode"]').forEach((el) => {
    el.addEventListener('change', () => { syncModePanels(); updatePreviewSummary(); });
  });
  document.getElementById('controls').addEventListener('input', updatePreviewSummary);
  document.getElementById('controls').addEventListener('change', updatePreviewSummary);
  document.getElementById('generate-btn').addEventListener('click', handleGenerate);
  document.addEventListener('i18n:change', () => {
    updatePreviewSummary();
    document.getElementById('generate-status').textContent = '';
  });
  initPdfLangSelect();
  I18N.init();
});
