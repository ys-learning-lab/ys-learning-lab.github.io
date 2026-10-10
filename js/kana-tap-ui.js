// Kana tap practice (kana-tap-practice.html): an on-screen quiz. One character is shown
// and the student taps the matching one from a few choices. Kana data comes from
// MATCH_ROWS in kana-matching-generator.js; each item is [hiragana, katakana, romaji].
//
// Three screens (setup -> play -> results). All state lives in `state`, and every screen is
// rendered from it, so switching language mid-quiz just re-renders.

const TAP_SCRIPTS = { h: 0, k: 1, r: 2 };
const TAP_MAX_CHOICES = 8;
const TAP_MAX_QUESTIONS = 100;
const TAP_CORRECT_DELAY_MS = 700;
const TAP_QUICK_DELAY_MS = 150;

const state = {
  config: null,
  questions: [],   // { item, qs, cs, choices: {item, s}[], picked: choice|null }
  index: 0,
  locked: false,   // an answer was picked and we're showing feedback
  timer: null,
};

const $ = (id) => document.getElementById(id);

function scriptName(s) {
  return { h: I18N.t('tap.script.h', 'Hiragana'), k: I18N.t('tap.script.k', 'Katakana'), r: I18N.t('tap.script.r', 'Romaji') }[s];
}

function show(screen) {
  for (const id of ['setup', 'play', 'results']) $(`screen-${id}`).classList.toggle('hidden', id !== screen);
  $('guide').classList.toggle('hidden', screen !== 'setup');
  window.scrollTo(0, 0);
}

// ---------- setup ----------

function buildRowCheckboxes() {
  for (const group of ['basic', 'voiced']) {
    $(`row-${group}`).innerHTML = MATCH_ROWS.filter((r) => r.group === group).map((r) => `
      <label class="flex items-center gap-2 text-sm py-1">
        <input type="checkbox" class="row-check h-5 w-5" value="${r.id}" ${r.id === 'A' || r.id === 'K' ? 'checked' : ''} /> <span class="jp-font">${r.label} (${r.items.map((i) => i[0]).join('')})</span>
      </label>
    `).join('');
  }
}

// ---------- saved settings (browser storage; every failure is ignored) ----------

const TAP_SETTINGS_KEY = 'ysll-tap-settings';
const TAP_SETTING_FIELDS = ['cfg-choices', 'cfg-questions', 'cfg-near', 'cfg-feedback'];

function saveSettings() {
  try {
    const checked = (cls) => Array.from(document.querySelectorAll(`.${cls}:checked`)).map((el) => el.value);
    const data = { rows: checked('row-check'), q: checked('q-script'), c: checked('c-script') };
    for (const id of TAP_SETTING_FIELDS) data[id] = $(id).type === 'checkbox' ? $(id).checked : $(id).value;
    localStorage.setItem(TAP_SETTINGS_KEY, JSON.stringify(data));
  } catch (e) { /* storage blocked or full: settings just won't be remembered */ }
}

function loadSettings() {
  try {
    const data = JSON.parse(localStorage.getItem(TAP_SETTINGS_KEY) || 'null');
    if (!data || typeof data !== 'object') return;
    const apply = (cls, list) => {
      if (Array.isArray(list)) document.querySelectorAll(`.${cls}`).forEach((el) => { el.checked = list.includes(el.value); });
    };
    apply('row-check', data.rows);
    apply('q-script', data.q);
    apply('c-script', data.c);
    for (const id of TAP_SETTING_FIELDS) {
      if (!(id in data)) continue;
      if ($(id).type === 'checkbox') $(id).checked = !!data[id]; else $(id).value = data[id];
    }
  } catch (e) { /* unreadable saved settings: keep the defaults */ }
}

function setRows(predicate) {
  document.querySelectorAll('.row-check').forEach((el) => {
    const row = MATCH_ROWS.find((r) => r.id === el.value);
    el.checked = predicate(row);
  });
}

function readConfig() {
  const num = (id, fallback, min, max) => {
    const n = parseInt($(id).value, 10);
    return Math.max(min, Math.min(max, Number.isNaN(n) ? fallback : n));
  };
  const checked = (cls) => Array.from(document.querySelectorAll(`.${cls}:checked`)).map((el) => el.value);
  const qScripts = checked('q-script');
  const cScripts = checked('c-script');
  return {
    rowIds: checked('row-check'),
    qScripts,
    cScripts,
    // Every (question, choice) script combination that can be asked: never the same script twice.
    pairs: qScripts.flatMap((q) => cScripts.filter((c) => c !== q).map((c) => [q, c])),
    choices: num('cfg-choices', 6, 2, TAP_MAX_CHOICES),
    questions: num('cfg-questions', 10, 1, TAP_MAX_QUESTIONS),
    nearOnly: $('cfg-near').checked,
    feedback: $('cfg-feedback').checked,
  };
}

function configError(cfg) {
  if (!cfg.rowIds.length) return I18N.t('tap.err.rows', 'Tick at least one row of kana.');
  if (!cfg.qScripts.length) return I18N.t('tap.err.q', 'Tick at least one type for the question.');
  if (!cfg.cScripts.length) return I18N.t('tap.err.c', 'Tick at least one type for the choices.');
  if (!cfg.pairs.length) return I18N.t('tap.err.same', 'The question and the choices need different types. For example, Question: Katakana with Choices: Hiragana.');
  return '';
}

// ---------- building a quiz ----------

function tapShuffle(arr) {
  return matchShuffle(arr);
}

// `count` questions drawn from `pool`: every kana once (shuffled) before any repeats.
function drawQuestionItems(pool, count) {
  const out = [];
  let queue = [];
  while (out.length < count) {
    if (!queue.length) {
      queue = tapShuffle(pool);
      // Don't ask the same kana twice in a row when the list wraps around.
      if (out.length && queue.length > 1 && queue[0] === out[out.length - 1]) queue.push(queue.shift());
    }
    out.push(queue.shift());
  }
  return out;
}

function buildQuestions(cfg, pool) {
  const all = matchAllItems();
  return drawQuestionItems(pool, Math.min(cfg.questions, TAP_MAX_QUESTIONS)).map((item) => {
    const [qs, cs] = cfg.pairs[Math.floor(Math.random() * cfg.pairs.length)];
    const near = cfg.nearOnly ? tapShuffle(pool.filter((i) => i !== item)) : [];
    const rest = tapShuffle(all.filter((i) => i !== item && !near.includes(i)));
    // The right answer is shown in script `cs` (never the question's own). Wrong choices use any
    // ticked choice script, so with two ticked they are mixed and the script gives nothing away.
    const anyScript = () => cfg.cScripts[Math.floor(Math.random() * cfg.cScripts.length)];
    const wrong = [...near, ...rest].slice(0, cfg.choices - 1).map((i) => ({ item: i, s: anyScript() }));
    return { item, qs, cs, choices: tapShuffle([{ item, s: cs }, ...wrong]), picked: null };
  });
}

function startQuiz(cfg, poolOverride) {
  const pool = poolOverride || MATCH_ROWS.filter((r) => cfg.rowIds.includes(r.id)).flatMap((r) => r.items);
  state.config = cfg;
  // A "missed only" round asks each missed kana once, however many questions were set up.
  state.questions = buildQuestions(poolOverride ? { ...cfg, questions: poolOverride.length } : cfg, pool);
  state.index = 0;
  state.locked = false;
  clearTimeout(state.timer);
  show('play');
  renderPlay();
}

// ---------- play ----------

function glyph(item, script) {
  return item[TAP_SCRIPTS[script]];
}

// 8.4s under a minute, 1:05 after that.
function formatTime(ms) {
  if (ms < 59950) return `${(ms / 1000).toFixed(1)}${I18N.t('tap.sec', 's')}`;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function isRight(q) {
  return q.picked && q.picked.item === q.item;
}

function renderPlay() {
  const q = state.questions[state.index];
  if (!q) return;
  const total = state.questions.length;
  $('play-progress').textContent = I18N.t('tap.progress', 'Question {n} of {total}', { n: state.index + 1, total });
  $('play-bar').style.width = `${(state.index / total) * 100}%`;
  // With one choice type the prompt names it; with several, naming it would give the answer away.
  $('play-prompt').textContent = state.config.cScripts.length > 1
    ? I18N.t('tap.promptMixed', 'Tap the one with the same sound')
    : I18N.t('tap.prompt', 'Tap the matching {script}', { script: scriptName(q.cs) });
  $('play-question').textContent = glyph(q.item, q.qs);

  const cols = q.choices.length <= 4 ? 2 : q.choices.length <= 6 ? 3 : 4;
  const box = $('play-choices');
  box.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
  box.innerHTML = '';
  q.choices.forEach((choice, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn-key btn-key-cream jp-font';
    b.style.minHeight = '4.5rem';
    b.style.fontSize = choice.s === 'r' ? '1.75rem' : '2.25rem';
    b.dataset.index = String(i);
    b.setAttribute('aria-label', `${i + 1}: ${glyph(choice.item, choice.s)}`);
    b.textContent = glyph(choice.item, choice.s);
    b.addEventListener('click', () => pick(i));
    box.appendChild(b);
  });
  $('play-feedback').textContent = '';
  state.locked = false;
  // The clock starts when a question first appears (not again on a language re-render).
  if (q.shownAt === undefined) q.shownAt = performance.now();
  if (q.picked && state.config.feedback) paintFeedback(q);
}

function pick(i) {
  const q = state.questions[state.index];
  if (!q || state.locked) return;
  q.picked = q.choices[i];
  q.ms = performance.now() - q.shownAt;
  state.locked = true;
  const correct = isRight(q);

  if (!state.config.feedback) {
    state.timer = setTimeout(next, TAP_QUICK_DELAY_MS);
    return;
  }
  paintFeedback(q);
  if (correct) state.timer = setTimeout(next, TAP_CORRECT_DELAY_MS);
}

// Colors the picked and correct buttons, and shows the message (plus a Next button after a miss).
function paintFeedback(q) {
  state.locked = true;
  const correct = isRight(q);
  document.querySelectorAll('#play-choices button').forEach((b) => {
    b.disabled = true;
    const choice = q.choices[Number(b.dataset.index)];
    if (choice.item === q.item) { b.style.backgroundColor = '#bfe3c0'; b.style.opacity = '1'; }
    else if (choice === q.picked) { b.style.backgroundColor = '#f0b8b0'; b.style.opacity = '1'; }
    else b.style.opacity = '0.45';
  });
  const msg = $('play-feedback');
  if (correct) {
    msg.textContent = I18N.t('tap.right', 'Correct!');
    msg.style.color = '#2f6b33';
    return;
  }
  msg.style.color = '#9a2f22';
  msg.textContent = '';
  msg.append(I18N.t('tap.wrong', 'Not quite. The answer is {answer}.', { answer: glyph(q.item, q.cs) }), ' ');
  const nextBtn = document.createElement('button');
  nextBtn.type = 'button';
  nextBtn.id = 'next-btn';
  nextBtn.className = 'btn-key btn-key-primary px-4 py-2 text-sm ml-2';
  nextBtn.textContent = I18N.t('tap.next', 'Next');
  nextBtn.addEventListener('click', next);
  msg.appendChild(nextBtn);
  nextBtn.focus();
}

function next() {
  clearTimeout(state.timer);
  if (state.index + 1 >= state.questions.length) {
    show('results');
    renderResults();
    return;
  }
  state.index++;
  renderPlay();
}

// ---------- results ----------

function renderResults() {
  const qs = state.questions;
  const right = qs.filter((q) => isRight(q)).length;
  const pct = Math.round((right / qs.length) * 100);
  $('result-score').textContent = `${right} / ${qs.length}`;
  $('result-pct').textContent = `${pct}%`;
  renderSheet();
  const totalMs = qs.reduce((sum, q) => sum + q.ms, 0);
  $('result-time').textContent = I18N.t('tap.result.time', 'Total time {total} · average {avg} per question', {
    total: formatTime(totalMs), avg: formatTime(totalMs / qs.length),
  });
  $('missed-btn').disabled = right === qs.length;
  $('missed-btn').classList.toggle('opacity-50', right === qs.length);

  const onlyMissed = $('only-missed').checked;
  const ok = I18N.t('tap.result.correct', 'Correct');
  const bad = I18N.t('tap.result.wrong', 'Missed');
  $('result-rows').innerHTML = qs.map((q, n) => ({ q, n }))
    .filter(({ q }) => !onlyMissed || !isRight(q))
    .map(({ q, n }) => {
      const good = isRight(q);
      return `<tr class="${good ? '' : 'bg-red-50'} border-b border-stone-200">
        <td class="py-2 pr-2 text-stone-500">${n + 1}</td>
        <td class="py-2 pr-2 text-xl">${glyph(q.item, q.qs)}</td>
        <td class="py-2 pr-2 text-xl ${good ? '' : 'text-red-700'}">${glyph(q.picked.item, q.picked.s)}</td>
        <td class="py-2 pr-2 text-xl">${glyph(q.item, q.cs)}</td>
        <td class="py-2 font-bold ${good ? 'text-green-700' : 'text-red-700'}"><span aria-hidden="true">${good ? '✓' : '✗'}</span> ${good ? ok : bad}</td>
        <td class="py-2 text-stone-600 whitespace-nowrap">${formatTime(q.ms)}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="6" class="py-3 text-center text-stone-500">${I18N.t('tap.result.none', 'Nothing missed. Well done!')}</td></tr>`;
}

// ---------- writing practice sheet ----------

// The kana to send to Writing Practice, from the ticked boxes. Each is shown in the script the
// student saw it in (a romaji question or choice falls back to the kana script of the question),
// and "converted" adds the same kana in the other script.
function sheetLetters() {
  const on = (id) => $(id).checked;
  const other = (s) => (s === 'h' ? 'k' : 'h');
  const kanaScript = (q) => (q.qs !== 'r' ? q.qs : q.cs);
  const chars = [];
  const add = (item, script) => {
    const list = on('sheet-conv') ? [script, other(script)] : [script];
    for (const s of list) {
      const ch = glyph(item, s);
      if (!chars.includes(ch)) chars.push(ch);
    }
  };
  for (const q of state.questions) {
    const right = isRight(q);
    if (right && !on('sheet-correct')) continue;
    if (on('sheet-q')) add(q.item, kanaScript(q));
    if (on('sheet-wrong') && !right) add(q.picked.item, q.picked.s === 'r' ? kanaScript(q) : q.picked.s);
  }
  return chars;
}

function renderSheet() {
  const chars = sheetLetters();
  $('sheet-chars').textContent = chars.length ? chars.join(' ') : I18N.t('tap.sheet.empty', 'No letters to send.');
  $('sheet-btn').disabled = !chars.length;
  $('sheet-btn').classList.toggle('opacity-50', !chars.length);
}

async function generateSheet() {
  const chars = sheetLetters();
  if (!chars.length) return;
  const status = $('sheet-status');
  const btn = $('sheet-btn');
  const repeats = normalizePracticeRepeats($('sheet-repeats').value, 5);
  $('sheet-repeats').value = repeats;
  btn.disabled = true;
  status.textContent = I18N.t('tap.sheet.working', 'Generating PDF...');
  // Opened right away, inside the click, so the browser's popup blocker allows it.
  const resultTab = window.open('', '_blank');
  try {
    const cfg = { mode: 'custom', script: 'hira', pdfLang: getPdfLang(), repeats, title: '', teacher: '', customChars: chars, includeWords: false, customWords: [], hideOthers: false };
    const bytes = await new HiraganaPracticeRenderer(cfg, chars).render();
    await openPdfResults(bytes, `kana_practice_${timestamp()}.pdf`, 'kana-tap-practice.html', 'Kana Tap Practice', resultTab);
    status.textContent = I18N.t('tap.sheet.done', 'Opened your worksheet in a new tab.');
  } catch (e) {
    console.error(e);
    status.textContent = I18N.t('tap.sheet.error', 'Error generating PDF: ') + e.message;
    if (resultTab) resultTab.close();
  } finally {
    btn.disabled = !sheetLetters().length;
  }
}

// The full Writing Practice page, with these letters filled in, for title / teacher / word options.
function openSheet() {
  const chars = sheetLetters();
  if (!chars.length) return;
  const params = new URLSearchParams({ lang: I18N.getLang(), mode: 'custom', chars: chars.join('') });
  location.href = `japanese-practice.html?${params}`;
}

// ---------- wiring ----------

function start() {
  const cfg = readConfig();
  const err = configError(cfg);
  const box = $('setup-error');
  box.classList.toggle('hidden', !err);
  box.textContent = err;
  if (err) return;
  startQuiz(cfg);
}

document.addEventListener('DOMContentLoaded', () => {
  buildRowCheckboxes();
  loadSettings();
  I18N.init();
  $('screen-setup').addEventListener('change', saveSettings);

  $('start-btn').addEventListener('click', () => start());
  $('all-basic-btn').addEventListener('click', () => setRows((r) => r.group === 'basic'));
  $('all-btn').addEventListener('click', () => setRows(() => true));
  $('clear-btn').addEventListener('click', () => setRows(() => false));
  // Programmatic checkbox changes fire no 'change' event, so save after the row buttons.
  ['all-basic-btn', 'all-btn', 'clear-btn'].forEach((id) => $(id).addEventListener('click', saveSettings));

  $('quit-btn').addEventListener('click', () => { clearTimeout(state.timer); show('setup'); });
  $('again-btn').addEventListener('click', () => startQuiz(state.config));
  $('settings-btn').addEventListener('click', () => show('setup'));
  $('missed-btn').addEventListener('click', () => {
    const missed = [...new Set(state.questions.filter((q) => !isRight(q)).map((q) => q.item))];
    if (missed.length) startQuiz(state.config, missed);
  });
  $('only-missed').addEventListener('change', renderResults);
  document.querySelectorAll('#sheet-q, #sheet-wrong, #sheet-conv, #sheet-correct').forEach((el) => el.addEventListener('change', renderSheet));
  $('sheet-btn').addEventListener('click', generateSheet);
  $('sheet-more').addEventListener('click', (e) => { e.preventDefault(); openSheet(); });
  initPdfLangSelect();

  // Number keys pick a choice (after a miss, the focused Next button takes Enter / Space).
  document.addEventListener('keydown', (e) => {
    if ($('screen-play').classList.contains('hidden') || e.ctrlKey || e.metaKey || e.altKey) return;
    if (/^[1-8]$/.test(e.key)) {
      const q = state.questions[state.index];
      if (q && Number(e.key) <= q.choices.length) pick(Number(e.key) - 1);
    }
  });

  document.addEventListener('i18n:change', () => {
    if (!$('screen-play').classList.contains('hidden')) renderPlay();
    if (!$('screen-results').classList.contains('hidden')) renderResults();
  });
});
