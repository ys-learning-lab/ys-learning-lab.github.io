// Wires up kana-word-builder.html: settings, a live preview of the tiles, PDF generation.

// The puzzles shown in the preview are cached and handed to the PDF as-is, so what the user sees
// is exactly what gets printed. Only a settings change or "Shuffle" builds new ones (a
// language switch must not).
let wordPuzzlesCache = [];

function buildWordConfig() {
  return {
    includeAnswerKey: document.getElementById('cfg-key').checked,
    pdfLang: getPdfLang(),
    title: document.getElementById('cfg-title').value,
    teacher: document.getElementById('cfg-teacher').value,
  };
}

function renderWordPreview() {
  const cfg = buildWordConfig();
  const tr = I18N.t;
  document.getElementById('preview-summary').innerHTML = [
    `<div><span class="font-semibold">${tr('words.sum.key', 'Answer key:')}</span> ${cfg.includeAnswerKey ? tr('words.sum.yes', 'Yes') : tr('words.sum.no', 'No')}</div>`,
  ].join('');

  const tile = (ch) => `
    <div class="border-2 border-stone-800 rounded w-12 h-12 flex items-center justify-center text-2xl bg-white">${ch}</div>`;
  document.getElementById('preview-sets').innerHTML = wordPuzzlesCache.map((p, i) => `
    <div class="border border-stone-300 rounded-lg p-3">
      <p class="text-xs font-semibold text-stone-600 mb-2">${tr('words.preview.puzzle', 'Puzzle {n}', { n: i + 1 })}</p>
      <div class="flex flex-wrap gap-2">${p.rack.map(tile).join('')}</div>
    </div>`).join('');
}

function refreshAll() {
  wordPuzzlesCache = new KanaWordBuilderGenerator().buildPuzzles();
  renderWordPreview();
}

async function handleWordGenerate() {
  const cfg = buildWordConfig();
  const status = document.getElementById('generate-status');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = I18N.t('words.status.working', 'Generating PDF...');

  // Opened synchronously, inside the click, so the popup blocker allows it.
  const resultTab = window.open('', '_blank');

  try {
    const bytes = await new KanaWordBuilderRenderer(cfg, wordPuzzlesCache).render();
    await openPdfResults(bytes, `kana_word_builder_${timestamp()}.pdf`, 'kana-word-builder.html', 'Kana Word Builder', resultTab);
    status.textContent = I18N.t('words.status.done', 'Opened your worksheet in a new tab.');
  } catch (e) {
    console.error(e);
    status.textContent = I18N.t('words.status.error', 'Error generating PDF: ') + e.message;
    if (resultTab) resultTab.close();
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const controls = document.getElementById('controls');
  // Title, teacher and the answer-key box don't change the tiles, so they only need the
  // cheap re-render, not a fresh draw.
  const onControlChange = () => renderWordPreview();
  controls.addEventListener('input', onControlChange);
  controls.addEventListener('change', onControlChange);

  document.getElementById('reshuffle-btn').addEventListener('click', refreshAll);
  document.getElementById('generate-btn').addEventListener('click', handleWordGenerate);

  document.addEventListener('i18n:change', () => {
    renderWordPreview();
    document.getElementById('generate-status').textContent = '';
  });

  refreshAll();
  initPdfLangSelect();
  I18N.init();
});
