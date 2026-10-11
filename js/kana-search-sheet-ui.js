// Wires up kana-search-sheet.html: settings, a live preview of the grids, PDF generation.

// The grids shown in the preview are cached and handed to the PDF as-is, so what the user sees is
// exactly what gets printed. Only a settings change or "Shuffle" builds new ones.
let ssCache = [];

const ssEl = (id) => document.getElementById(id);

// The goal can't be more than the words hidden on purpose: options above it are disabled, and a goal
// that is now too high drops to the hidden count.
function ssSyncGoal() {
  const words = parseInt(ssEl('cfg-words').value, 10);
  const goal = ssEl('cfg-goal');
  for (const opt of goal.options) opt.disabled = parseInt(opt.value, 10) > words;
  if (parseInt(goal.value, 10) > words) goal.value = String(words);
}

function ssConfig() {
  return {
    side: parseInt(ssEl('cfg-side').value, 10),
    words: parseInt(ssEl('cfg-words').value, 10),
    goal: parseInt(ssEl('cfg-goal').value, 10),
    mode: ssEl('cfg-mode').value,
    puzzles: parseInt(ssEl('cfg-count').value, 10),
    includeAnswerKey: ssEl('cfg-key').checked,
    pdfLang: getPdfLang(),
    title: ssEl('cfg-title').value,
    teacher: ssEl('cfg-teacher').value,
  };
}

function ssRenderPreview() {
  const cfg = ssConfig();
  const tr = I18N.t;
  ssEl('preview-summary').innerHTML = [
    `<div><span class="font-semibold">${tr('ps.sum.puzzles', 'Puzzles:')}</span> ${ssCache.length}</div>`,
    `<div><span class="font-semibold">${tr('ss.sum.goal', 'Words to find:')}</span> ${Math.min(cfg.goal, ssCache.length ? ssCache[0].planted.length : cfg.goal)}</div>`,
    `<div><span class="font-semibold">${tr('ps.sum.key', 'Answer key:')}</span> ${cfg.includeAnswerKey ? tr('ps.sum.yes', 'Yes') : tr('ps.sum.no', 'No')}</div>`,
  ].join('');

  ssEl('preview-puzzles').innerHTML = ssCache.map((p, i) => {
    let grid = '';
    for (const row of p.grid) {
      for (const ch of row) {
        grid += `<div class="aspect-square border-2 border-stone-800 bg-white flex items-center justify-center" style="font-size:clamp(0.7rem,2.6vw,1.5rem)">${ch}</div>`;
      }
    }
    return `
    <div class="border border-stone-300 rounded-lg p-3">
      <p class="text-xs font-semibold text-stone-600 mb-2">${tr('ps.preview.puzzle', 'Puzzle {n}', { n: i + 1 })}
        <span class="font-normal text-stone-400">- ${tr('ss.preview.size', '{n} x {n} letters, {words} hidden words', { n: p.side, words: p.planted.length })}</span></p>
      <div class="grid gap-[3px] max-w-md" style="grid-template-columns:repeat(${p.side},minmax(0,1fr))">${grid}</div>
    </div>`;
  }).join('');
}

function ssRefresh() {
  ssCache = ssBuildPuzzles(ssConfig());
  ssRenderPreview();
}

async function ssGenerate() {
  const cfg = ssConfig();
  const status = ssEl('generate-status');
  const btn = ssEl('generate-btn');
  btn.disabled = true;
  status.textContent = I18N.t('ps.status.working', 'Generating PDF...');

  // Opened synchronously, inside the click, so the popup blocker allows it.
  const resultTab = window.open('', '_blank');

  try {
    const bytes = await new KanaSearchSheetRenderer(cfg, ssCache).render();
    await openPdfResults(bytes, `kana_word_search_${timestamp()}.pdf`, 'kana-search-sheet.html', 'Kana Word Search Worksheet', resultTab);
    status.textContent = I18N.t('ps.status.done', 'Opened your worksheet in a new tab.');
  } catch (e) {
    console.error(e);
    status.textContent = I18N.t('ps.status.error', 'Error generating PDF: ') + e.message;
    if (resultTab) resultTab.close();
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Title, teacher, the goal and the answer-key box don't change the grids, so they only need the
  // cheap re-render, not a fresh draw.
  const redrawIds = new Set(['cfg-side', 'cfg-words', 'cfg-mode', 'cfg-count']);
  const onControlChange = (e) => {
    if (e.target.id === 'cfg-words') ssSyncGoal();
    if (redrawIds.has(e.target.id)) ssRefresh();
    else ssRenderPreview();
  };
  const controls = ssEl('controls');
  controls.addEventListener('input', onControlChange);
  controls.addEventListener('change', onControlChange);

  ssEl('reshuffle-btn').addEventListener('click', ssRefresh);
  ssEl('generate-btn').addEventListener('click', ssGenerate);

  document.addEventListener('i18n:change', () => {
    ssRenderPreview();
    ssEl('generate-status').textContent = '';
  });

  ssSyncGoal();
  ssRefresh();
  initPdfLangSelect();
  I18N.init();
});
