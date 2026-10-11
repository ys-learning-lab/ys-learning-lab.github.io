// Wires up kana-puzzle-sheet.html: settings, a live preview of the puzzles, PDF generation.

// The puzzles shown in the preview are cached and handed to the PDF as-is, so what the user sees is
// exactly what gets printed. Only a settings change or "Shuffle" builds new ones (a language switch
// must not).
let psCache = [];

function psConfig() {
  return {
    words: parseInt(document.getElementById('cfg-words').value, 10),
    level: document.getElementById('cfg-level').value,
    puzzles: parseInt(document.getElementById('cfg-count').value, 10),
    includeAnswerKey: document.getElementById('cfg-key').checked,
    pdfLang: getPdfLang(),
    title: document.getElementById('cfg-title').value,
    teacher: document.getElementById('cfg-teacher').value,
  };
}

function psRenderPreview() {
  const cfg = psConfig();
  const tr = I18N.t;
  document.getElementById('preview-summary').innerHTML = [
    `<div><span class="font-semibold">${tr('ps.sum.puzzles', 'Puzzles:')}</span> ${psCache.length}</div>`,
    `<div><span class="font-semibold">${tr('ps.sum.words', 'Words in each puzzle:')}</span> ${cfg.words}</div>`,
    `<div><span class="font-semibold">${tr('ps.sum.key', 'Answer key:')}</span> ${cfg.includeAnswerKey ? tr('ps.sum.yes', 'Yes') : tr('ps.sum.no', 'No')}</div>`,
  ].join('');

  document.getElementById('preview-puzzles').innerHTML = psCache.map((p, i) => {
    const cells = new Map(p.cells.map((c) => [c.key, c]));
    let grid = '';
    for (let r = 0; r < p.rows; r++) {
      for (let c = 0; c < p.cols; c++) {
        const cell = cells.get(`${r},${c}`);
        grid += !cell ? '<div></div>'
          : `<div class="aspect-square border-2 border-stone-800 flex items-center justify-center ${cell.given ? 'bg-stone-200 text-stone-600' : 'bg-white'}" style="font-size:clamp(0.7rem,2.6vw,1.6rem)">${cell.given ? cell.ch : ''}</div>`;
      }
    }
    return `
    <div class="border border-stone-300 rounded-lg p-3">
      <p class="text-xs font-semibold text-stone-600 mb-2">${tr('ps.preview.puzzle', 'Puzzle {n}', { n: i + 1 })}
        <span class="font-normal text-stone-400">- ${tr('ps.preview.size', '{rows} x {cols} boxes, {kana} kana to place', { rows: p.rows, cols: p.cols, kana: p.tiles.length })}</span></p>
      <p class="text-[11px] text-stone-500 mb-1">${tr('ps.preview.kana', 'Kana to use')}</p>
      <div class="flex flex-wrap gap-1 mb-3">${p.tiles.map((t) => `<div class="border-2 border-stone-800 rounded w-9 h-9 flex items-center justify-center text-lg bg-white">${t.ch}</div>`).join('')}</div>
      <div class="grid gap-[3px] max-w-md" style="grid-template-columns:repeat(${p.cols},minmax(0,1fr))">${grid}</div>
    </div>`;
  }).join('');
}

function psRefresh() {
  psCache = psBuildPuzzles(psConfig());
  psRenderPreview();
}

async function psGenerate() {
  const cfg = psConfig();
  const status = document.getElementById('generate-status');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = I18N.t('ps.status.working', 'Generating PDF...');

  // Opened synchronously, inside the click, so the popup blocker allows it.
  const resultTab = window.open('', '_blank');

  try {
    const bytes = await new KanaPuzzleSheetRenderer(cfg, psCache).render();
    await openPdfResults(bytes, `kana_word_puzzle_${timestamp()}.pdf`, 'kana-puzzle-sheet.html', 'Kana Word Puzzle Worksheet', resultTab);
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
  const controls = document.getElementById('controls');
  // Title, teacher and the answer-key box don't change the puzzles, so they only need the cheap
  // re-render, not a fresh draw.
  const redrawIds = new Set(['cfg-words', 'cfg-level', 'cfg-count']);
  const onControlChange = (e) => {
    if (redrawIds.has(e.target.id)) psRefresh();
    else psRenderPreview();
  };
  controls.addEventListener('input', onControlChange);
  controls.addEventListener('change', onControlChange);

  document.getElementById('reshuffle-btn').addEventListener('click', psRefresh);
  document.getElementById('generate-btn').addEventListener('click', psGenerate);

  document.addEventListener('i18n:change', () => {
    psRenderPreview();
    document.getElementById('generate-status').textContent = '';
  });

  psRefresh();
  initPdfLangSelect();
  I18N.init();
});
