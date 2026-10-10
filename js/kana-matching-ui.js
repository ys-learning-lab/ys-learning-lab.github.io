// Wires up kana-matching.html: row checkboxes, live preview of the worksheet, PDF generation.

// The worksheet shown in the preview is cached and handed to the PDF as-is, so
// what the user sees is exactly what gets printed. Only a settings change or the
// Reshuffle button builds a new one (a language switch must not).
let matchSetCache = null;

function buildRowCheckboxes() {
  for (const group of ['basic', 'voiced']) {
    document.getElementById(`row-${group}`).innerHTML = MATCH_ROWS.filter((r) => r.group === group).map((r) => `
      <label class="flex items-center gap-2 text-xs">
        <input type="checkbox" class="row-check h-4 w-4" value="${r.id}" ${r.id === 'A' ? 'checked' : ''} /> ${r.label} (${r.items.map((i) => i[0]).join('')})
      </label>
    `).join('');
  }
}

function buildMatchConfig() {
  const num = (id, fallback, min, max) => {
    const n = parseInt(document.getElementById(id).value, 10);
    return Math.max(min, Math.min(max, Number.isNaN(n) ? fallback : n));
  };
  return {
    rowIds: Array.from(document.querySelectorAll('.row-check:checked')).map((el) => el.value),
    matchType: document.getElementById('cfg-type').value,
    count: num('cfg-count', 5, 2, MATCH_MAX_CHOICES),
    regularPct: num('cfg-regular', 70, 0, 100),
    shuffleLeft: document.getElementById('cfg-shuffle').checked,
    mixScripts: document.getElementById('cfg-mix').checked && document.getElementById('cfg-type').value === 'h-k',
    trick: document.getElementById('cfg-trick').checked,
    decoyCount: num('cfg-decoys', 1, 1, MATCH_MAX_DECOYS),
    includeAnswerKey: document.getElementById('cfg-key').checked,
    includeAnswerQr: document.getElementById('cfg-qr').checked,
    pdfLang: getPdfLang(),
    title: document.getElementById('cfg-title').value,
    teacher: document.getElementById('cfg-teacher').value,
  };
}

function syncControls() {
  document.getElementById('voiced-pct').textContent = 100 - buildMatchConfig().regularPct;
  const mix = document.getElementById('cfg-mix');
  mix.disabled = document.getElementById('cfg-type').value !== 'h-k';
  mix.closest('label').classList.toggle('opacity-50', mix.disabled);
  document.getElementById('cfg-decoys').disabled = !document.getElementById('cfg-trick').checked;
}

function regenerateSet() {
  matchSetCache = new KanaMatchingGenerator(buildMatchConfig()).buildSet();
}

function matchTypeLabel(type) {
  return {
    'h-k': I18N.t('match.opts.hk', 'Hiragana ↔ Katakana'),
    'h-r': I18N.t('match.opts.hr', 'Hiragana ↔ Romaji'),
    'k-r': I18N.t('match.opts.kr', 'Katakana ↔ Romaji'),
  }[type];
}

function renderMatchPreview() {
  const cfg = buildMatchConfig();
  const tr = I18N.t;
  const type = MATCH_TYPES[cfg.matchType];
  const generator = new KanaMatchingGenerator(cfg);
  const chosen = generator.selectedItems();
  const pairs = generator.count - generator.decoyCount;
  const fromRows = Math.min(chosen.length, pairs);

  document.getElementById('preview-summary').innerHTML = [
    `<div><span class="font-semibold">${tr('match.sum.rows', 'Kana from your rows:')}</span> ${chosen.length ? chosen.map((i) => i[0]).join(' ') : tr('match.sum.none', 'none (all random)')}</div>`,
    `<div><span class="font-semibold">${tr('match.sum.choices', 'Choices:')}</span> ${tr('match.sum.choicesValue', '{count} in each column ({fromRows} from your rows, {random} random)', { count: generator.count, fromRows, random: pairs - fromRows })}</div>`,
    `<div><span class="font-semibold">${tr('match.sum.type', 'Match:')}</span> ${matchTypeLabel(cfg.matchType)}</div>`,
    `<div><span class="font-semibold">${tr('match.sum.trick', 'Trick choices:')}</span> ${generator.decoyCount ? tr('match.sum.trickValue', '{count} in each column', { count: generator.decoyCount }) : tr('match.sum.no', 'No')}</div>`,
    `<div><span class="font-semibold">${tr('match.sum.key', 'Answer key:')}</span> ${cfg.includeAnswerKey ? tr('match.sum.yes', 'Yes') : tr('match.sum.no', 'No')}</div>`,
  ].join('');

  const cell = (text) => `<div class="border-2 border-stone-800 rounded px-3 py-2 text-xl text-center min-w-[64px]">${text}</div>`;
  const dot = '<span class="inline-block w-2.5 h-2.5 rounded-full bg-stone-800"></span>';
  document.getElementById('preview-sets').innerHTML = `
    <div class="border border-stone-300 rounded-lg p-3 max-w-md">
      <div class="grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 items-center">
        ${matchSetCache.left.map((entry, i) => `
          ${cell(entry.item[entry.script !== undefined ? entry.script : type.left])}
          <div class="flex justify-between px-1">${dot}${dot}</div>
          ${cell(matchSetCache.right[i].item[matchSetCache.right[i].script !== undefined ? matchSetCache.right[i].script : type.right])}
        `).join('')}
      </div>
    </div>`;
}

function refreshAll() {
  syncControls();
  regenerateSet();
  renderMatchPreview();
}

async function handleMatchGenerate() {
  const cfg = buildMatchConfig();
  const status = document.getElementById('generate-status');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = I18N.t('match.status.working', 'Generating PDF...');

  // Opened synchronously, inside the click, so the popup blocker allows it.
  const resultTab = window.open('', '_blank');

  try {
    const bytes = await new KanaMatchingRenderer(cfg, matchSetCache).render();
    await openPdfResults(bytes, `kana_matching_${timestamp()}.pdf`, 'kana-matching.html', 'Kana Matching Worksheet', resultTab);
    status.textContent = I18N.t('match.status.done', 'Opened your worksheet in a new tab.');
  } catch (e) {
    console.error(e);
    status.textContent = I18N.t('match.status.error', 'Error generating PDF: ') + e.message;
    if (resultTab) resultTab.close();
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  buildRowCheckboxes();

  const controls = document.getElementById('controls');
  // Title, teacher and the answer-key checkbox don't change which kana are used,
  // so they only need the cheap re-render, not a fresh draw.
  const redrawIds = new Set(['cfg-type', 'cfg-count', 'cfg-regular', 'cfg-shuffle', 'cfg-mix', 'cfg-trick', 'cfg-decoys']);
  const onControlChange = (e) => {
    if (e.target.classList.contains('row-check') || redrawIds.has(e.target.id)) refreshAll();
    else renderMatchPreview();
  };
  controls.addEventListener('input', onControlChange);
  controls.addEventListener('change', onControlChange);

  document.getElementById('clear-btn').addEventListener('click', () => {
    document.querySelectorAll('.row-check').forEach((el) => { el.checked = false; });
    refreshAll();
  });
  document.getElementById('reshuffle-btn').addEventListener('click', refreshAll);
  document.getElementById('generate-btn').addEventListener('click', handleMatchGenerate);

  document.addEventListener('i18n:change', () => {
    renderMatchPreview();
    document.getElementById('generate-status').textContent = '';
  });

  refreshAll();
  initPdfLangSelect();
  I18N.init();
});
