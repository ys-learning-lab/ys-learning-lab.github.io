// Class roster import for kana-quiz.html: download an Excel template, fill in each
// student's name and the kana they missed, import it, check the preview, and create
// one test per student (name printed on the page, the missed kana forced in).

const RT = (key, def, vars) => I18N.t(key, def, vars);

// Splits the "missed kana" cell into kana units (see KanaDatabase.parseKanaList).
function parseMissedKana(text, db, direction) {
  return db.parseKanaList(text, romajiScriptFor(direction));
}

// Students sheet: column A name/ID, column B missed kana. Row 1 is the header. Columns C and D
// (teacher, class) are optional and only matter for files with no "Teacher & class" sheet, such as CSV.
function parseRosterRows(rows, db) {
  const students = [];
  const warnings = [];
  const extra = { teacher: '', className: '' };
  rows.slice(1).forEach((row, i) => {
    const cell = (n) => String(row[n] == null ? '' : row[n]).trim();
    if (!extra.teacher) extra.teacher = cell(2);
    if (!extra.className) extra.className = cell(3);
    const name = cell(0), missed = cell(1);
    if (!name && !missed) return; // blank row
    const line = i + 2;
    if (!name) { warnings.push({ key: 'noName', vars: { line } }); return; }
    const { unknown } = parseMissedKana(missed, db, 'h2k');
    if (unknown.length) warnings.push({ key: 'unknown', vars: { name, chars: unknown.join(' ') } });
    students.push({ name, missed, line }); // kana are worked out later: romaji depends on the quiz direction
  });
  return { students, warnings, extra };
}

// "Teacher & class" sheet: headers on row 1, the teacher under the first and the class under the second.
function parseRosterInfo(rows) {
  const cell = (c) => String(rows[1] && rows[1][c] != null ? rows[1][c] : '').trim();
  return { teacher: cell(0), className: cell(1) };
}

// "Settings" sheet: column B holds the value, column C a fixed English key (so the sheet reads the
// same on any device and in any language). Returns a partial config, or null if there is no such sheet.
const ROSTER_INT_KEYS = { rows: 'rows', columns: 'columns', num_pages: 'num_pages', mixed_k2h_ratio: 'mixed_k2h_ratio', basic_ratio: 'basic_ratio' };
const ROSTER_BOOL_KEYS = { is_ordered: 'is_ordered', group_by_row: 'group_by_row', allow_duplicates: 'allow_duplicates', show_settings_footer: 'show_settings_footer', include_answer_key: 'include_answer_key', include_answer_qr: 'include_answer_qr' };
function parseRosterSettings(rows) {
  const cfg = {};
  let found = false;
  for (const row of rows) {
    const key = String(row[2] == null ? '' : row[2]).trim();
    const val = String(row[1] == null ? '' : row[1]).trim();
    if (!key) continue;
    if (ROSTER_INT_KEYS[key]) { const n = parseInt(val, 10); if (!Number.isNaN(n)) { cfg[key] = n; found = true; } }
    else if (ROSTER_BOOL_KEYS[key]) { cfg[key] = /^(true|1|yes|on|はい|あり)$/i.test(val); found = true; }
    else if (key === 'direction') { if (['k2h', 'h2k', 'mixed'].includes(val)) { cfg.direction = val; found = true; } }
    else if (key === 'categories') {
      const cats = val.split(/[,\s、]+/).filter((c) => ALL_CATEGORIES.includes(c));
      if (cats.length) { cfg.categories = cats; found = true; }
    }
    else if (key === 'always_include') { cfg.always_include = val; found = true; }
    else if (key === 'title') { cfg.title = val; found = true; }
    else if (key === 'pdf_lang') { if (val === 'ja' || val === 'en' || val === 'zh') { cfg.pdfLang = val; found = true; } }
  }
  return found ? cfg : null;
}

// One config per student: the page's settings, plus their name and their missed kana forced in
// (before whatever "Always include" holds for everyone).
function buildStudentConfig(base, student, info) {
  const everyone = new KanaDatabase().parseKanaList(base.always_include, romajiScriptFor(base.direction)).chars;
  const forced = [...student.chars];
  for (const c of everyone) if (!forced.includes(c)) forced.push(c);
  return {
    ...base,
    always_include: forced.join(', '),
    studentName: student.name,
    className: info.className,
    teacher: info.teacher || base.teacher,
  };
}

// Labels are in the page language; keys (column C) and values (column B) are fixed, so a file
// made on one device means the same thing on any other. Column D says what the value means.
function rosterSettingsRows(cfg) {
  const yes = RT('roster.yes', 'yes'), no = RT('roster.no', 'no');
  const bool = (v) => [String(!!v), v ? yes : no];
  const dir = {
    k2h: RT('roster.dir.k2h', 'Katakana \u2192 Hiragana'),
    h2k: RT('roster.dir.h2k', 'Hiragana \u2192 Katakana'),
    mixed: RT('roster.dir.mixed', 'Mixed ({pct}% katakana \u2192 hiragana)', { pct: cfg.mixed_k2h_ratio }),
  }[cfg.direction] || cfg.direction;
  const row = (labelKey, labelDef, key, value, meaning = '') => [RT(labelKey, labelDef), String(value), key, meaning];
  const flag = (labelKey, labelDef, key, v) => { const [val, m] = bool(v); return row(labelKey, labelDef, key, val, m); };
  return [
    [RT('roster.set.setting', 'Setting'), RT('roster.set.value', 'Value'), RT('roster.set.key', 'Key'), RT('roster.set.meaning', 'Meaning')],
    row('roster.set.rows', 'Rows per page', 'rows', cfg.rows),
    row('roster.set.cols', 'Columns per page', 'columns', cfg.columns),
    row('roster.set.pages', 'Pages per student', 'num_pages', cfg.num_pages),
    row('roster.set.dir', 'Direction (k2h, h2k or mixed)', 'direction', cfg.direction, dir),
    row('roster.set.mixed', 'Katakana \u2192 hiragana share when mixed (%)', 'mixed_k2h_ratio', cfg.mixed_k2h_ratio),
    row('roster.set.cats', 'Kana groups (basic, dakuten, handakuten, youon)', 'categories', cfg.categories.join(', ')),
    row('roster.set.basic', 'Basic kana share (%)', 'basic_ratio', cfg.basic_ratio),
    flag('roster.set.seq', 'Sequential order', 'is_ordered', cfg.is_ordered),
    flag('roster.set.group', 'Group by row', 'group_by_row', cfg.group_by_row),
    flag('roster.set.dups', 'Allow duplicates', 'allow_duplicates', cfg.allow_duplicates),
    row('roster.set.always', 'Always include (everyone)', 'always_include', cfg.always_include),
    flag('roster.set.footer', 'Print settings footer', 'show_settings_footer', cfg.show_settings_footer),
    flag('roster.set.key', 'Answer key pages', 'include_answer_key', cfg.include_answer_key),
    flag('roster.set.qr', 'Answer QR code', 'include_answer_qr', cfg.include_answer_qr),
    row('roster.set.title', 'Title', 'title', cfg.title),
    row('roster.set.pdflang', 'PDF language (en, ja or zh)', 'pdf_lang', cfg.pdfLang),
    [],
    [RT('roster.set.note1', 'When you import, the Value column decides the quiz settings, whatever the page currently shows.')],
    [RT('roster.set.note2', 'Change a value to change the test. Keep column C as it is. Without this sheet (for example a CSV file), the settings on the page are used.')],
  ];
}

// Every cell is plain text so a spreadsheet app cannot turn "1A" or "2/1" into a date or a number.
function rosterTextSheet(aoa, widths) {
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  for (const addr of Object.keys(ws)) {
    if (addr[0] === '!') continue;
    ws[addr].t = 's';
    ws[addr].z = '@';
    ws[addr].v = String(ws[addr].v == null ? '' : ws[addr].v);
  }
  ws['!cols'] = widths.map((wch) => ({ wch }));
  return ws;
}

function downloadRosterTemplate() {
  const cfg = buildJpConfig();
  const wb = XLSX.utils.book_new();

  const blank = Array.from({ length: 200 }, () => ['', '']);
  XLSX.utils.book_append_sheet(wb, rosterTextSheet([[RT('roster.col.name', 'Student name / ID'), RT('roster.col.missed', 'Missed kana')], ...blank], [26, 44]), RT('roster.sheet.students', 'Students'));

  XLSX.utils.book_append_sheet(wb, rosterTextSheet([[RT('roster.info.teacher', 'Teacher (optional)'), RT('roster.info.class', 'Class (optional)')], ['', '']], [26, 26]), RT('roster.sheet.info', 'Teacher & class'));

  XLSX.utils.book_append_sheet(wb, rosterTextSheet(rosterSettingsRows(cfg), [34, 20, 22, 36]), RT('roster.sheet.settings', 'Settings'));

  const how = rosterTextSheet([
    [RT('roster.how.h', 'How to use this template')],
    [RT('roster.how.1', '1. On the "Students" sheet, write one student per row, starting on row 2.')],
    [RT('roster.how.2', '2. Column A: the student\'s name or a short ID. It is printed on that student\'s test.')],
    [RT('roster.how.3', '3. Column B: the kana the student missed on the last test, for example: あ ヲ しゃ (commas such as , or 、, and spaces are all fine, or none at all: あヲしゃ works too). Romaji works too, for example: a, wo, sha, gya (r or l both work for ら行: re = le = れ; type a small kana with x, e.g. kixya = きゃ). Without a Japanese keyboard, separate romaji with commas or spaces.')],
    [RT('roster.how.3b', 'Hiragana is shown as hiragana on the new test (the student writes katakana); katakana is shown as katakana (the student writes hiragana). Romaji follows the quiz direction: katakana shown for Katakana → Hiragana, hiragana shown for Hiragana → Katakana, and a random mix for Mixed.')],
    [RT('roster.how.4', '4. On the "Teacher & class" sheet, optionally write a teacher name under "Teacher" and a class name under "Class" (row 2). They are printed on every student\'s test.')],
    [RT('roster.how.7', '5. The "Settings" sheet holds the quiz settings. Importing applies them, so the file decides the settings, not the device you import on. Change the Value column to change the test.')],
    [RT('roster.how.5', '6. Save the file, then use "Import filled template" on the Kana Conversion Quiz page.')],
    [RT('roster.how.6', 'Nothing is uploaded: the file is read in your browser.')],
  ], [110]);
  XLSX.utils.book_append_sheet(wb, how, RT('roster.sheet.how', 'How to use'));

  XLSX.writeFile(wb, `kana_class_template_${timestamp()}.xlsx`);
}

function showRosterMessages(lines) {
  const box = document.getElementById('roster-messages');
  if (!box) return;
  box.innerHTML = '';
  for (const l of lines) {
    const li = document.createElement('li');
    li.textContent = l;
    box.appendChild(li);
  }
}

function rosterWarningText(w) {
  const t = {
    noName: ['roster.warn.noName', 'Row {line}: no student name, skipped.'],
    unknown: ['roster.warn.unknown', '{name}: ignored "{chars}" (not a kana the quiz uses).'],
    tooMany: ['roster.warn.tooMany', '{name}: {count} missed kana but only {cells} fit on a page, so the first {cells} are used.'],
    glyph: ['roster.warn.glyph', '"{name}" has characters the PDF font does not have, so they may print as blank boxes. Kana or Latin letters are safe.'],
  }[w.key];
  return RT(t[0], t[1], w.vars);
}

// What the last import produced; the preview and the PDF both come from it.
let rosterPending = null;

function rosterBuildSheets() {
  const cfg = buildJpConfig();
  const db = new KanaDatabase();
  const cells = cfg.rows * cfg.columns;
  const warnings = rosterPending.warnings.slice();
  rosterPending.sheets = rosterPending.students.map((st0) => {
    const st = { ...st0, chars: parseMissedKana(st0.missed, db, cfg.direction).chars };
    if (st.chars.length > cells) warnings.push({ key: 'tooMany', vars: { name: st.name, count: st.chars.length, cells } });
    const sc = buildStudentConfig(cfg, st, rosterPending.info);
    return { cfg: sc, student: st, pagesData: new RandomizationEngine(sc, db).generatePagesData() };
  });
  rosterPending.cfg = cfg;
  rosterPending.shownWarnings = warnings;
}

function rosterIsActive() { return !!rosterPending; }

// Swaps the regular preview area between the sample grid and the imported students.
function setRosterMode(on) {
  for (const id of ['preview-pager', 'preview-note', 'preview-grid-wrap']) document.getElementById(id).classList.toggle('hidden', on);
  document.getElementById('roster-preview').classList.toggle('hidden', !on);
  document.getElementById('roster-loaded').classList.toggle('hidden', !on);
  document.getElementById('preview-heading').textContent = on
    ? RT('roster.preview.heading', 'Imported class preview')
    : RT('kana.preview.heading', 'Kana Selection Preview');
  syncGenerateButtonLabel();
}

function renderRosterPreview(rebuild = true) {
  if (!rosterPending) { setRosterMode(false); showRosterMessages([]); return; }
  if (rebuild) {
    try {
      rosterBuildSheets();
    } catch (e) {
      document.getElementById('roster-status').textContent = e.message;
      return;
    }
  }
  const { fileName, sheets, cfg, shownWarnings } = rosterPending;
  document.getElementById('roster-status').textContent = rosterPending.note || '';
  setRosterMode(true);
  const nameEl = document.getElementById('roster-file-name');
  nameEl.textContent = fileName;
  nameEl.title = fileName; // the row is a fixed width; hover shows the whole name
  document.getElementById('roster-count').textContent = RT('roster.count', '{n} students', { n: sheets.length });
  showRosterMessages(shownWarnings.map(rosterWarningText));

  const list = document.getElementById('roster-cards');
  list.innerHTML = '';
  for (const sh of sheets) {
    const card = document.createElement('div');
    card.className = 'border border-stone-300 rounded-lg p-3 bg-white';

    const head = document.createElement('div');
    head.className = 'text-sm font-semibold mb-1';
    const parts = [`${RT('roster.p.name', 'Name')}: ${sh.cfg.studentName}`];
    if (sh.cfg.teacher) parts.push(`${RT('roster.p.teacher', 'Teacher')}: ${sh.cfg.teacher}`);
    if (sh.cfg.className) parts.push(`${RT('roster.p.class', 'Class')}: ${sh.cfg.className}`);
    head.textContent = parts.join('   ');
    card.appendChild(head);

    const missed = document.createElement('div');
    missed.className = 'text-xs text-stone-500 mb-2';
    missed.textContent = `${RT('roster.p.missed', 'Missed kana')}: ${sh.student.chars.join(' ') || RT('roster.none', '(none)')}`;
    card.appendChild(missed);

    const forced = new Set(sh.student.chars);
    const grid = document.createElement('div');
    grid.className = 'grid gap-1 jp-font';
    grid.style.gridTemplateColumns = `repeat(${cfg.columns}, minmax(0, 1fr))`;
    for (const row of sh.pagesData[0] || []) {
      for (const item of row) {
        const c = document.createElement('div');
        c.className = 'border border-stone-300 rounded text-center text-base py-1';
        if (item.is_empty) c.classList.add('opacity-30');
        else { c.textContent = item.prompt; if (forced.has(item.prompt)) c.classList.add('bg-amber-100', 'font-semibold'); }
        grid.appendChild(c);
      }
    }
    card.appendChild(grid);
    if (sh.pagesData.length > 1) {
      const more = document.createElement('div');
      more.className = 'text-[11px] text-stone-500 mt-1';
      more.textContent = RT('roster.p.more', 'Page 1 of {n} shown.', { n: sh.pagesData.length });
      card.appendChild(more);
    }
    list.appendChild(card);
  }
}

async function handleRosterFile(file) {
  const status = document.getElementById('roster-status');
  status.textContent = '';
  try {
    const wb = XLSX.read(await file.arrayBuffer(), { type: 'array' });
    const toRows = (name) => (name ? XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, defval: '', raw: false }) : []);
    const { students, warnings, extra } = parseRosterRows(toRows(wb.SheetNames[0]), new KanaDatabase());
    if (!students.length) {
      rosterPending = null;
      renderRosterPreview();
      showRosterMessages(warnings.map(rosterWarningText));
      status.textContent = RT('roster.status.empty', 'No students found. Fill in the template starting on row 2.');
      return;
    }
    const info = wb.SheetNames.length > 1 ? parseRosterInfo(toRows(wb.SheetNames[1])) : { teacher: '', className: '' };
    if (!info.teacher) info.teacher = extra.teacher;
    if (!info.className) info.className = extra.className;

    // The file decides the quiz settings: apply them to the page before building anything.
    let settings = null;
    for (const name of wb.SheetNames) { settings = parseRosterSettings(toRows(name)); if (settings) break; }
    rosterPending = { fileName: file.name, students, warnings, info, note: settings ? RT('roster.status.settings', 'Quiz settings were loaded from the file.') : '' };
    if (settings) {
      applyJpConfigToForm(settings);
      if (settings.pdfLang) document.getElementById('pdf-lang').value = settings.pdfLang;
      saveJpConfig();
      updateJpAll(); // redraws the roster preview, since a roster is now loaded
    } else {
      renderRosterPreview();
    }
  } catch (e) {
    console.error(e);
    rosterPending = null;
    renderRosterPreview();
    status.textContent = RT('roster.status.error', 'Could not use that file: ') + e.message;
  }
}

function clearRoster() {
  rosterPending = null;
  document.getElementById('roster-status').textContent = '';
  renderRosterPreview();
}

// Runs from the page's own Generate button while a roster is loaded.
async function createRosterPdf() {
  if (!rosterPending || !rosterPending.sheets) return;
  const status = document.getElementById('generate-status');
  const btn = document.getElementById('generate-btn');
  btn.disabled = true;
  status.textContent = RT('roster.status.working', 'Generating PDF...');
  const resultTab = window.open('', '_blank'); // opened inside the click, filled when ready (popup blockers)
  try {
    const { bytes, missingGlyphs } = await PDFWorksheetRenderer.renderBatch(rosterPending.sheets);
    const w = [...rosterPending.shownWarnings, ...missingGlyphs.map((name) => ({ key: 'glyph', vars: { name } }))];
    showRosterMessages(w.map(rosterWarningText));
    await openPdfResults(bytes, `japanese_class_worksheets_${timestamp()}.pdf`, 'kana-quiz.html', 'Kana Conversion Quiz', resultTab);
    status.textContent = RT('roster.status.done', 'Made {n} tests and opened them in a new tab.', { n: rosterPending.sheets.length });
  } catch (e) {
    console.error(e);
    if (resultTab) resultTab.close();
    status.textContent = RT('kana.status.error', 'Error generating PDF: ') + e.message;
  } finally {
    btn.disabled = false;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const dl = document.getElementById('roster-template-btn');
  const imp = document.getElementById('roster-import-btn');
  const input = document.getElementById('roster-file');
  if (!dl || !imp || !input) return;
  dl.addEventListener('click', downloadRosterTemplate);
  imp.addEventListener('click', () => input.click());
  input.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) handleRosterFile(file);
    e.target.value = '';
  });
  document.getElementById('roster-clear-btn').addEventListener('click', clearRoster);
  // A language switch re-labels the cards without re-rolling them; settings changes call
  // renderRosterPreview() from updateJpAll().
  document.addEventListener('i18n:change', () => { if (rosterPending) renderRosterPreview(false); });
});
