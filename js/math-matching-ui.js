// Math Matching: tap-friendly two-way fixed-target work and three-way random-answer work.
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const board = $('match-board');
  const svg = $('match-svg');
  const OPS = ['+', '−', '×', '÷'];
  const OP_COLORS = { '+': '#6d8f5f', '−': '#3f7f7d', '×': '#9a7822', '÷': '#725389' };
  const GAME_STORAGE_KEY = 'ys-learning-lab-math-match-saves-v1';
  const LEGACY_GAME_STORAGE_KEY = 'ys-learning-lab-math-match-game-v1';
  const DRAG_PREVIEW_DISTANCE = 18;
  const state = { mode: 'addition', target: 10, random: true, ops: OPS.slice(), pairs: [], first: [], second: [], answers: [], paths: [], awarded: new Set(), partial: null, selected: null, operator: null, drag: null, suppressClickUntil: 0, done: false, roundPoints: 0 };
  const storedSaves = loadSaves();
  let saves = storedSaves.slots;
  let archivedSaves = storedSaves.archived;
  let highScores = storedSaves.highScores;
  let activeSlot = null;
  let selectedTab = 'casual';
  let game = freshGame();
  let settingTimer = null;

  const clamp = (value, fallback, min, max) => Math.max(min, Math.min(max, Number.isFinite(value) ? value : fallback));
  const numberValue = (id, fallback, min, max) => clamp(parseInt($(id).value, 10), fallback, min, max);
  const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
  const shuffle = (items) => { const copy = items.slice(); for (let i = copy.length - 1; i > 0; i--) { const j = rand(0, i); [copy[i], copy[j]] = [copy[j], copy[i]]; } return copy; };

  function freshGame(startLives = 5, threshold = 10) { return { name: '', started: false, score: 0, streak: 0, roundsCompleted: 0, lives: startLives, startLives, threshold, updatedAt: Date.now() }; }

  function validGame(saved) { return saved && Number.isFinite(saved.score) && Number.isFinite(saved.streak) && Number.isFinite(saved.lives) && Number.isFinite(saved.startLives) && Number.isFinite(saved.threshold); }

  function loadSaves() {
    try {
      const saved = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY));
      if (saved && Array.isArray(saved.slots)) return { slots: Array.from({ length: 3 }, (_, index) => validGame(saved.slots[index]) ? saved.slots[index] : null), archived: Array.isArray(saved.archived) ? saved.archived.filter(validGame).slice(0, 5) : [], highScores: Array.isArray(saved.highScores) ? saved.highScores : [] };
      if (Array.isArray(saved)) return { slots: Array.from({ length: 3 }, (_, index) => validGame(saved[index]) ? saved[index] : null), archived: [], highScores: [] };
      const legacy = JSON.parse(localStorage.getItem(LEGACY_GAME_STORAGE_KEY));
      if (legacy && Number.isFinite(legacy.score) && Number.isFinite(legacy.streak) && Number.isFinite(legacy.lives) && Number.isFinite(legacy.startLives)) return { slots: [{ ...legacy, name: '', threshold: 10, updatedAt: Date.now() }, null, null], archived: [], highScores: [] };
    } catch (error) { /* Start a fresh local game if storage is unavailable. */ }
    return { slots: [null, null, null], archived: [], highScores: [] };
  }

  function saveGame() {
    if (activeSlot === null) return;
    game.settings = { mode: $('cfg-mode').value, random: $('cfg-random-target').checked, count: $('cfg-count').value, ops: selectedOps() };
    game.updatedAt = Date.now(); saves[activeSlot] = { ...game }; writeSaves();
  }

  function writeSaves() {
    try { localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify({ slots: saves, archived: archivedSaves, highScores })); } catch (error) { /* The activity remains playable without storage. */ }
  }

  function deleteSaveSlot(index) {
    if (!saves[index]) return;
    archivedSaves.unshift({ ...saves[index], archivedAt: Date.now() }); archivedSaves = archivedSaves.slice(0, 5); saves[index] = null; writeSaves();
    if (activeSlot === index) { activeSlot = null; game = freshGame(); $('cfg-lives').value = '5'; $('cfg-target').value = '10'; startRound(); }
    renderSaveSlots();
  }
  function renderGameStatus() {
    $('game-score').textContent = game.score;
    $('game-streak').textContent = game.streak;
    const lives = $('game-lives'); lives.replaceChildren();
    const totalSlots = Math.max(game.startLives, game.lives);
    const lostLives = Math.max(0, totalSlots - game.lives);
    for (let index = 0; index < totalSlots; index++) {
      const icon = document.createElement('img'); icon.src = index < lostLives ? 'assets/lifeemp.png' : 'assets/life.png'; icon.alt = ''; icon.className = 'life-icon'; lives.appendChild(icon);
    }
    lives.setAttribute('aria-label', `${game.lives} life`);
  }

  function isGameMode() { return activeSlot !== null; }

  function renderGameMode() {
    const runningGame = isGameMode() && game.started;
    $('game-mode-bar').classList.toggle('hidden', !runningGame);
    $('game-status').classList.toggle('hidden', !runningGame);
    $('round-title').classList.toggle('hidden', runningGame);
    $('new-btn').textContent = isGameMode() ? (game.started ? 'Restart this game' : 'Start Game') : 'New random round';
    if (isGameMode()) $('game-player-name').textContent = game.name || `Save ${activeSlot + 1}`;
  }

  function updateFolderView() {
    const gameTab = selectedTab === 'game';
    const configuringNewGame = gameTab && isGameMode() && !game.started;
    const continuingGame = gameTab && isGameMode() && game.started;
    $('mode-folder').classList.toggle('game-folder', gameTab);
    document.querySelector('.mode-tabs').classList.toggle('game-folder', gameTab);
    $('save-slots').classList.toggle('hidden', !gameTab);
    $('game-settings').classList.toggle('hidden', !(selectedTab === 'casual' || configuringNewGame));
    $('game-work').classList.toggle('hidden', !(selectedTab === 'casual' || continuingGame));
  }

  function setPracticeTab(tab) {
    selectedTab = tab;
    const gameTab = tab === 'game';
    $('open-game-mode-btn').classList.toggle('active', gameTab);
    $('start-casual-btn').classList.toggle('active', !gameTab);
    $('open-game-mode-btn').setAttribute('aria-selected', String(gameTab));
    $('start-casual-btn').setAttribute('aria-selected', String(!gameTab));
    updateFolderView();
  }

  function recordHighScore() {
    if (!isGameMode() || game.score < 1) return;
    highScores.push({ name: game.name || `Save ${activeSlot + 1}`, score: game.score, achievedAt: Date.now() });
    highScores.sort((a, b) => b.score - a.score); highScores = highScores.slice(0, 10);
  }

  function renderSaveSlots() {
    const list = $('save-slot-list'); list.innerHTML = '';
    saves.forEach((saved, index) => {
      const wrap = document.createElement('div');
      const button = document.createElement('button'); button.type = 'button'; button.className = 'btn-key btn-key-cream relative w-full min-w-0 flex-col items-start px-4 py-3 text-left';
      const slotName = `Save ${index + 1}`; const playerName = saved && saved.name ? saved.name : slotName;
      button.innerHTML = saved
        ? `<span class="block font-extrabold">${playerName}</span><span class="block text-xs mt-1">${slotName} · Score ${saved.score} · Streak ${saved.streak}</span><span class="block text-xs">life ${saved.lives} · threshold ${saved.threshold}</span>`
        : `<span class="block font-extrabold">${slotName}</span><span class="block text-xs mt-1">Empty — start here</span>`;
      button.addEventListener('click', (event) => {
        if (event.target.closest('[data-delete-save]')) { deleteSaveSlot(index); return; }
        selectSaveSlot(index);
      });
      button.replaceChildren();
      const title = document.createElement('span'); title.className = 'block max-w-[calc(100%-3rem)] text-base font-extrabold'; title.textContent = playerName;
      const details = document.createElement('span'); details.className = 'block mt-1 text-xs font-normal text-stone-600';
      if (saved) {
        const modeNames = { addition: 'Addition', subtraction: 'Subtraction', multiplication: 'Multiplication', division: 'Division', operators: 'Mix' };
        details.textContent = `Score ${saved.score} | Streak ${saved.streak} | Life ${saved.lives}/${saved.startLives} | Threshold ${saved.threshold} | ${modeNames[saved.settings && saved.settings.mode] || 'Addition'}`;
      } else details.textContent = 'Empty — start here';
      button.append(title, details);
      if (saved) {
        const removeInside = document.createElement('span'); removeInside.className = 'absolute right-3 top-3 grid h-7 w-7 place-items-center rounded text-lg text-stone-500 hover:text-red-800'; removeInside.innerHTML = '&#128465;'; removeInside.dataset.deleteSave = 'true'; removeInside.title = 'Move to deleted saves'; button.appendChild(removeInside);
      }
      wrap.appendChild(button);
      list.appendChild(wrap);
    });
    renderArchivedSaves();
  }

  function renameSaveSlot(index) {
    if (!saves[index]) return;
    const name = window.prompt('Player name for this save:', saves[index].name || '');
    if (name === null) return;
    saves[index].name = name.trim().slice(0, 24);
    if (activeSlot === index) game.name = saves[index].name;
    writeSaves(); renderSaveSlots();
  }

  function renderArchivedSaves() {
    $('archived-save-count').textContent = String(archivedSaves.length);
    const list = $('archived-save-list'); list.innerHTML = '';
    if (!archivedSaves.length) { list.textContent = 'No deleted saves.'; return; }
    archivedSaves.forEach((saved, archiveIndex) => {
      const row = document.createElement('div'); row.className = 'flex flex-wrap items-center gap-2 card-soft p-2';
      const name = saved.name || 'Unnamed save';
      const summary = document.createElement('span'); summary.className = 'text-xs flex-1'; summary.textContent = `${name} — Score ${saved.score}, Streak ${saved.streak}, life ${saved.lives}`; row.appendChild(summary);
      const target = document.createElement('select'); target.className = 'border-2 border-stone-300 rounded px-1 py-1 text-xs';
      const choose = document.createElement('option'); choose.value = ''; choose.textContent = 'Choose a save'; choose.disabled = true; choose.selected = true; target.appendChild(choose);
      saves.forEach((slot, index) => { const option = document.createElement('option'); option.value = String(index); option.textContent = slot ? `Overwrite ${slot.name || `Save ${index + 1}`}` : `Restore to Save ${index + 1}`; target.appendChild(option); });
      const restore = document.createElement('button'); restore.type = 'button'; restore.className = 'btn-key btn-key-primary px-3 py-1 text-xs'; restore.textContent = 'Restore'; restore.disabled = true;
      target.addEventListener('change', () => { restore.disabled = !target.value; });
      restore.addEventListener('click', () => restoreArchivedSave(archiveIndex, Number(target.value)));
      row.append(target, restore); list.appendChild(row);
    });
  }

  function restoreArchivedSave(archiveIndex, targetIndex) {
    const restored = archivedSaves[archiveIndex]; if (!restored) return;
    const target = saves[targetIndex]; const targetName = target ? (target.name || `Save ${targetIndex + 1}`) : `Save ${targetIndex + 1}`;
    if (target && !window.confirm(`Overwrite ${targetName} with ${restored.name || 'this deleted save'}?`)) return;
    saves[targetIndex] = { ...restored }; delete saves[targetIndex].archivedAt; archivedSaves.splice(archiveIndex, 1); writeSaves(); renderSaveSlots();
  }

  function selectSaveSlot(index) {
    const emptySlot = !saves[index]; activeSlot = index; game = saves[index] ? { ...saves[index] } : freshGame();
    if (!game.name) game.name = `Save ${index + 1}`;
    if (!Number.isFinite(game.roundsCompleted)) game.roundsCompleted = 0;
    if (!emptySlot && game.started === undefined) game.started = true;
    if (game.settings) {
      $('cfg-mode').value = game.settings.mode || 'addition'; $('cfg-random-target').checked = game.settings.random !== false; $('cfg-count').value = game.settings.count || '4';
      document.querySelectorAll('.cfg-mix-op').forEach((input) => { input.checked = (game.settings.ops || OPS).includes(input.value); });
    }
    $('cfg-lives').value = String(game.startLives); $('cfg-target').value = String(game.threshold);
    updateFolderView(); saveGame(); startRound();
    requestAnimationFrame(() => $(emptySlot ? 'game-settings' : 'game-mode-bar').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  function factorPairs(target) {
    const pairs = [];
    for (let a = 1; a * a <= target; a++) if (target % a === 0) pairs.push({ a, b: target / a });
    return pairs;
  }

  function calculate(op, first, second) {
    if (op === '+') return first + second;
    if (op === '−') return first - second;
    if (op === '×') return first * second;
    if (op === '÷') return second && first % second === 0 ? first / second : null;
    return null;
  }

  // A board must have exactly one mathematical route for every intended answer.
  // This prevents a child from finding a different, still-valid equation by chance.
  function hasOnlyIntendedMatches(pairs, mode) {
    const allowedOps = mode === 'operators' ? state.ops : [pairs[0] && pairs[0].op];
    for (let first = 0; first < pairs.length; first++) {
      for (let second = 0; second < pairs.length; second++) {
        for (let answer = 0; answer < pairs.length; answer++) {
          for (const op of allowedOps) {
            if (calculate(op, pairs[first].a, pairs[second].b) !== pairs[answer].answer) continue;
            if (first !== second || second !== answer || pairs[first].op !== op) return false;
          }
        }
      }
    }
    return true;
  }

  function safePairs(candidates, mode, count) {
    const chosen = []; const usedFirst = new Set(); const usedSecond = new Set(); const usedAnswers = new Set();
    shuffle(candidates).forEach((pair) => {
      if (chosen.length >= count || usedFirst.has(pair.a) || usedSecond.has(pair.b) || usedAnswers.has(pair.answer)) return;
      if (!hasOnlyIntendedMatches(chosen.concat(pair), mode)) return;
      usedFirst.add(pair.a); usedSecond.add(pair.b); usedAnswers.add(pair.answer); chosen.push(pair);
    });
    return chosen;
  }

  function choicesFromRange(min, max, count, fallbackMin, fallbackMax) {
    const pool = Array.from({ length: Math.max(0, max - min + 1) }, (_, i) => min + i);
    if (pool.length < count) for (let n = fallbackMin; n <= fallbackMax; n++) if (!pool.includes(n)) pool.push(n);
    return shuffle(pool).slice(0, Math.min(count, pool.length));
  }

  // Fixed target: the classic two-column exercise. Every number remains non-zero.
  function fixedPairs(mode, target, count) {
    if (mode === 'addition') {
      // Zero is never a choice, so a target of 10 has at most nine visible pairs.
      return safePairs(choicesFromRange(1, target - 1, count, 1, target - 1).map((a) => ({ a, b: target - a, answer: target, op: '+' })), mode, count);
    }
    if (mode === 'subtraction') {
      const min = Math.max(1, Math.floor(target * 0.35));
      const max = Math.max(min, Math.floor(target * 0.65));
      return safePairs(choicesFromRange(min, max, count, 1, Math.max(count, target)).map((b) => ({ a: target + b, b, answer: target, op: '−' })), mode, count);
    }
    if (mode === 'multiplication') return safePairs(factorPairs(target).map((p) => ({ ...p, answer: target, op: '×' })), mode, count);
    if (mode === 'division') return safePairs(choicesFromRange(2, Math.max(2 + count - 1, Math.min(12, target + 2)), count, 2, 12).map((b) => ({ a: target * b, b, answer: target, op: '÷' })), mode, count);
    const opPairs = state.ops.map((op) => makePair(op, target));
    return safePairs(opPairs.filter(Boolean), mode, count);
  }

  function makePair(mode, result) {
    if (mode === 'addition' || mode === '+') {
      const min = Math.max(1, Math.floor(result * 0.3));
      const max = Math.max(min, Math.floor(result * 0.7));
      const a = rand(min, Math.min(result - 1, max));
      return { a, b: result - a, answer: result, op: '+' };
    }
    if (mode === 'subtraction' || mode === '−') {
      const b = rand(1, Math.max(3, Math.min(12, result)));
      return { a: result + b, b, answer: result, op: '−' };
    }
    if (mode === 'multiplication' || mode === '×') {
      const maxFactor = Math.floor(Math.sqrt(result));
      if (maxFactor < 2) return null;
      const factors = [];
      for (let a = 2; a <= maxFactor; a++) if (result % a === 0) factors.push({ a, b: result / a });
      if (!factors.length) return null;
      return { ...factors[rand(0, factors.length - 1)], answer: result, op: '×' };
    }
    // Division is built as dividend / divisor = result. The visible answer is the quotient.
    const b = rand(2, 9);
    return { a: result * b, b, answer: result, op: '÷' };
  }

  function randomPair(mode, threshold, index) {
    if (mode === 'operators') {
      const op = state.ops[index % state.ops.length];
      const min = op === '×' ? 4 : 2;
      return makePair(op, rand(min, threshold));
    }
    if (mode === 'multiplication') {
      // Pick a composite answer; a prime cannot make a non-trivial factor match.
      const composite = [];
      for (let n = 4; n <= threshold; n++) if (factorPairs(n).some((p) => p.a > 1)) composite.push(n);
      return composite.length ? makePair('×', composite[rand(0, composite.length - 1)]) : null;
    }
    return makePair(mode, rand(2, threshold));
  }

  // Three-way work needs unambiguous visible choices in all three columns.
  function randomPairs(mode, threshold, count) {
    const pairs = [];
    const usedFirst = new Set(); const usedSecond = new Set(); const usedAnswers = new Set();
    for (let attempt = 0; attempt < 600 && pairs.length < count; attempt++) {
      const pair = randomPair(mode, threshold, pairs.length);
      if (!pair || usedFirst.has(pair.a) || usedSecond.has(pair.b) || usedAnswers.has(pair.answer)) continue;
      if (!hasOnlyIntendedMatches(pairs.concat(pair), mode)) continue;
      usedFirst.add(pair.a); usedSecond.add(pair.b); usedAnswers.add(pair.answer); pairs.push(pair);
    }
    return pairs;
  }

  function bestRandomPairs(mode, threshold, limit) {
    let best = [];
    // Different valid pair choices can block one another. Keep the largest safe set
    // found, so the configured round size is honoured whenever the threshold allows it.
    for (let attempt = 0; attempt < 80 && best.length < limit; attempt++) {
      const candidate = randomPairs(mode, threshold, limit);
      if (candidate.length > best.length) best = candidate;
    }
    return best;
  }

  function copyForMode() {
    const fixed = !state.random;
    const target = state.target;
    const modes = {
      addition: { title: fixed ? `Make ${target}` : 'Addition matching', instruction: fixed ? `Match two numbers that make ${target}.` : 'Match: first + second = answer.', first: 'First number', second: 'Number to add' },
      subtraction: { title: fixed ? `Take away to make ${target}` : 'Subtraction matching', instruction: fixed ? `Match two numbers to make ${target}.` : 'Match: first − second = answer.', first: 'Starting number', second: 'Amount to take away' },
      multiplication: { title: fixed ? `Make ${target}` : 'Multiplication matching', instruction: fixed ? `Match factors that make ${target}.` : 'Match: first × second = answer.', first: 'First factor', second: 'Second factor' },
      division: { title: fixed ? `Make ${target}` : 'Division matching', instruction: fixed ? `Match a division that makes ${target}.` : 'Match: first ÷ second = answer.', first: 'Dividend', second: 'Divisor' },
      operators: { title: fixed ? `Make ${target} with an operation` : 'Mixed-operation matching', instruction: fixed ? `Choose an operation and match two numbers to make ${target}.` : 'Choose an operation, then match: first operation second = answer.', first: 'First number', second: 'Second number' },
    };
    return modes[state.mode];
  }

  function pairFor(role, index) { return state.pairs.find((pair) => pair.id === state[role][index].id); }
  function isUsed(role, index) { return state.paths.some((path) => path.solved && path[role] === index); }
  function selectedOps() { return Array.from(document.querySelectorAll('.cfg-mix-op:checked')).map((input) => input.value); }
  function visibleOperation() { return state.mode === 'operators' ? (state.operator || '?') : ({ addition: '+', subtraction: '−', multiplication: '×', division: '÷' }[state.mode]); }

  function syncSettingsCopy() {
    const random = $('cfg-random-target').checked;
    $('target-caption').textContent = random ? 'Starting answer threshold' : 'Starting target number';
    $('cfg-target').min = random ? '4' : '2';
    $('config-note').textContent = random
      ? 'No answer is shown first. Every answer is a mixed choice, generated at or below the threshold; 0 is never used.'
      : 'Fixed-target practice: the two matching numbers make the target shown above; 0 is never used.';
  }

  function setConfigWarning(message) {
    const warning = $('config-warning'); warning.textContent = message; warning.classList.toggle('hidden', !message);
  }

  function startRound() {
    state.mode = $('cfg-mode').value;
    state.random = $('cfg-random-target').checked;
    state.ops = selectedOps();
    state.target = clamp(game.threshold, 10, state.random ? 4 : 2, 100);
    $('cfg-target').value = String(state.target);
    const requestedCount = numberValue('cfg-count', 4, 1, 10);
    syncSettingsCopy();
    const rawPairs = state.random ? bestRandomPairs(state.mode, state.target, 10) : fixedPairs(state.mode, state.target, 10);
    const count = Math.min(requestedCount, rawPairs.length);
    if (count < requestedCount) {
      $('cfg-count').value = String(count);
      setConfigWarning(`Only ${count} unambiguous matches are available for this threshold and operation focus. Matches in this round was reduced; the threshold was not changed.`);
    } else setConfigWarning('');
    state.pairs = rawPairs.slice(0, count).map((pair, id) => ({ ...pair, id }));
    state.first = shuffle(state.pairs.map((pair) => ({ id: pair.id, value: pair.a })));
    state.second = shuffle(state.pairs.map((pair) => ({ id: pair.id, value: pair.b })));
    state.answers = state.random ? shuffle(state.pairs.map((pair) => ({ id: pair.id, value: pair.answer }))) : [];
    state.paths = []; state.awarded = new Set(); state.roundPoints = 0; state.partial = null; state.selected = null; state.operator = state.mode === 'operators' ? state.ops[0] : null; state.drag = null; state.done = isGameMode() && (!game.started || game.lives < 1);
    $('round-feedback').textContent = ''; $('again-btn').classList.add('hidden');
    render();
    if (state.done) say(game.started ? 'No lives left. This save has ended.' : 'Choose settings, then press Start Game.', '#59646d');
  }

  function render() {
    const copy = copyForMode();
    $('round-title').textContent = copy.title; $('game-round-title').textContent = copy.title;
    $('top-heading').textContent = copy.first; $('bottom-heading').textContent = copy.second; $('answer-heading').textContent = state.random ? 'Answer' : 'Target';
    $('operation-symbol').textContent = state.mode === 'operators' ? 'mix' : visibleOperation();
    $('operation-symbol').classList.toggle('is-word', state.mode === 'operators');
    $('equals-symbol').textContent = '=';
    $('match-grid').classList.toggle('match-fixed-target', !state.random);
    $('mix-operation-settings').classList.toggle('hidden', state.mode !== 'operators');
    $('operator-palette').classList.toggle('hidden', state.mode !== 'operators');
    document.querySelectorAll('.op-choice').forEach((button) => {
      button.classList.toggle('hidden', state.mode === 'operators' && !state.ops.includes(button.dataset.op));
      const selected = button.dataset.op === state.operator;
      button.setAttribute('aria-pressed', String(selected)); button.classList.toggle('ring-4', selected); button.classList.toggle('ring-stone-700', selected);
    });
    renderList('top-list', 'first', state.first);
    renderList('bottom-list', 'second', state.second);
    if (state.random) { $('equals-list').innerHTML = ''; renderList('answer-list', 'answers', state.answers); } else renderFixedTargets();
    $('round-score').textContent = `${state.paths.filter((path) => path.solved).length} of ${state.pairs.length} matches`;
    renderGameStatus(); renderGameMode(); updateFolderView();
    requestAnimationFrame(drawLines);
  }

  function appendAnchor(row, kind, index) {
    const anchor = document.createElement('span');
    anchor.className = 'match-anchor'; anchor.dataset.kind = kind; anchor.dataset.index = String(index); anchor.setAttribute('aria-hidden', 'true');
    row.appendChild(anchor);
  }

  function renderList(id, role, items) {
    const list = $(id); list.innerHTML = '';
    items.forEach((item, index) => {
      const row = document.createElement('div'); row.className = `math-match-row math-match-row-${role}`;
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'math-match-item'; button.dataset.role = role; button.dataset.index = String(index); button.textContent = item.value;
      button.disabled = isUsed(role === 'answers' ? 'answer' : role, index);
      button.setAttribute('aria-label', `${role === 'first' ? 'First' : role === 'second' ? 'Second' : 'Answer'} number ${item.value}`);
      button.addEventListener('click', () => { if (Date.now() >= state.suppressClickUntil) tapChoice(role, index); });
      button.addEventListener('pointerdown', beginDrag);
      button.addEventListener('pointermove', moveDrag);
      button.addEventListener('pointerup', endDrag);
      button.addEventListener('pointercancel', cancelDrag);
      if (role === 'first') { row.classList.add('math-match-row-top'); row.append(button); appendAnchor(row, 'first-out', index); }
      else if (role === 'second') { row.classList.add('justify-center'); appendAnchor(row, 'second-in', index); row.append(button); if (state.random) appendAnchor(row, 'second-out', index); }
      else { row.classList.add('math-match-row-bottom'); appendAnchor(row, 'answer-in', index); row.append(button); }
      list.appendChild(row);
    });
    refreshSelection();
  }

  function renderFixedTargets() {
    const list = $('answer-list'); const equalsList = $('equals-list'); list.innerHTML = ''; equalsList.innerHTML = '';
    state.pairs.forEach(() => {
      const row = document.createElement('div'); row.className = 'math-match-row math-match-row-bottom';
      const card = document.createElement('span'); card.className = 'target-static'; card.textContent = state.target;
      row.append(card); list.appendChild(row);
      const equals = document.createElement('div'); equals.className = 'equals-row'; equals.textContent = '='; equalsList.appendChild(equals);
    });
  }

  function refreshSelection() {
    document.querySelectorAll('.math-match-item').forEach((button) => {
      button.classList.toggle('is-selected', !!state.selected && button.dataset.role === state.selected.role && Number(button.dataset.index) === state.selected.index);
    });
  }

  function tapChoice(role, index) {
    if (state.done || isUsed(role === 'answers' ? 'answer' : role, index)) return;
    if (role === 'first') {
      state.selected = { role, index }; refreshSelection(); return;
    }
    if (role === 'second') {
      if (!state.selected || state.selected.role !== 'first') return say('First tap a number in the left column.', '#9a2f22');
      if (state.mode === 'operators' && !state.operator) return say('Choose an operation first.', '#9a2f22');
      const first = state.selected.index;
      // A fresh connection replaces an unsolved line that used either endpoint, so a number
      // never accumulates several competing lines. Solved paths stay locked in place.
      state.paths = state.paths.filter((existing) => existing.solved || (existing.first !== first && existing.second !== index));
      const path = { first, second: index, op: visibleOperation(), solved: false };
      state.paths.push(path); state.partial = { pathIndex: state.paths.length - 1 }; state.selected = null;
      if (!state.random) { state.partial = null; resolveFixed(path); }
      else say('Now tap an answer choice.', '#3f5f5b');
      render(); return;
    }
    if (!state.partial) return say('First match the two numbers.', '#9a2f22');
    const path = state.paths[state.partial.pathIndex]; path.answer = index; state.partial = null; state.selected = null;
    resolveThreeWay(path); render();
  }

  function pathIsCorrect(path) {
    const first = pairFor('first', path.first); const second = pairFor('second', path.second);
    const answer = path.answer === undefined ? first : pairFor('answers', path.answer);
    return !!first && !!second && !!answer && first.id === second.id && first.id === answer.id && (state.mode !== 'operators' || first.op === path.op);
  }

  function pointsFor(path) {
    const pair = pairFor('first', path.first);
    const equationSize = Math.max(pair.a, pair.b, pair.answer);
    const basePoints = Math.max(1, Math.ceil(equationSize * 0.1));
    const mixedMultiplier = state.mode === 'operators' ? 2 : 1;
    return basePoints * mixedMultiplier + game.streak;
  }

  function awardPath(path) {
    if (!isGameMode()) return 0;
    const pair = pairFor('first', path.first);
    if (!pair || state.awarded.has(pair.id)) return 0;
    const points = pointsFor(path); state.awarded.add(pair.id); state.roundPoints += points; game.score += points;
    saveGame(); renderGameStatus(); return points;
  }

  function loseLife() {
    if (!isGameMode()) return false;
    game.lives = Math.max(0, game.lives - 1); game.streak = 0; saveGame(); renderGameStatus();
    if (!game.lives) {
      recordHighScore(); const endedName = game.name || `Save ${activeSlot + 1}`; const endedScore = game.score;
      saves[activeSlot] = null; activeSlot = null; game = freshGame(); writeSaves(); renderSaveSlots();
      state.done = true; $('again-btn').classList.add('hidden'); say(`Game over — ${endedName} scored ${endedScore}. This save is lost.`, '#9a2f22'); return true;
    }
    return false;
  }

  function resolveFixed(path) {
    path.solved = pathIsCorrect(path);
    if (path.solved) { const points = awardPath(path); say(isGameMode() ? `Correct! +${points} points` : 'Correct!', '#2f6b33'); }
    else if (!loseLife()) say(isGameMode() ? 'That completed equation is not correct. One life was lost.' : 'That equation is not correct. Try another pattern.', '#9a2f22');
    finishIfDone();
  }

  function resolveThreeWay(path) {
    path.solved = pathIsCorrect(path);
    if (path.solved) { const points = awardPath(path); say(isGameMode() ? `Correct! +${points} points` : 'Correct!', '#2f6b33'); }
    else if (!loseLife()) say(isGameMode() ? 'That completed equation is not correct. One life was lost.' : 'That equation is not correct. Try another pattern.', '#9a2f22');
    finishIfDone();
  }

  function say(message, color) { const feedback = $('round-feedback'); feedback.textContent = message; feedback.style.color = color; }
  function finishIfDone() {
    if (state.paths.filter((path) => path.solved).length === state.pairs.length) {
      state.done = true;
      if (!isGameMode()) { say(`All ${state.pairs.length} matches are correct!`, '#2f6b33'); $('again-btn').classList.remove('hidden'); return; }
      game.streak++; game.roundsCompleted++;
      const raisedThreshold = game.roundsCompleted % 3 === 0 && game.threshold < 100;
      if (raisedThreshold) game.threshold = Math.min(100, state.target + 5);
      const gainedLife = game.streak % 5 === 0 && game.lives < 9;
      if (gainedLife) game.lives++;
      $('cfg-target').value = String(game.threshold); saveGame(); renderGameStatus();
      const thresholdMessage = raisedThreshold ? ` Next threshold: ${game.threshold}.` : '';
      const lifeMessage = gainedLife ? ' You earned +1 life!' : '';
      say(`Round clear! ${state.roundPoints} points earned. Your next round gets a +${game.streak} streak bonus per correct match.${thresholdMessage}${lifeMessage}`, '#2f6b33'); $('again-btn').classList.remove('hidden');
    }
  }

  function anchorCenter(kind, index) {
    const anchor = document.querySelector(`.match-anchor[data-kind="${kind}"][data-index="${index}"]`);
    if (!anchor) return null;
    const item = anchor.getBoundingClientRect(); const base = board.getBoundingClientRect();
    return { x: item.left - base.left + item.width / 2, y: item.top - base.top + item.height / 2 };
  }

  function svgLine(a, b, color, label, dashed, pathIndex) {
    if (!a || !b) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x); line.setAttribute('y1', a.y); line.setAttribute('x2', b.x); line.setAttribute('y2', b.y); line.setAttribute('stroke', color); line.setAttribute('stroke-width', dashed ? '4' : '5'); line.setAttribute('stroke-linecap', 'round'); if (dashed) line.setAttribute('stroke-dasharray', '8 7'); svg.appendChild(line);
    if (pathIndex !== undefined) {
      line.style.pointerEvents = 'stroke'; line.style.cursor = 'pointer';
      line.addEventListener('click', (event) => { event.stopPropagation(); erasePath(pathIndex); });
    }
    if (!label) return;
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', (a.x + b.x) / 2); text.setAttribute('y', (a.y + b.y) / 2 + 7); text.setAttribute('text-anchor', 'middle'); text.setAttribute('font-size', '24'); text.setAttribute('font-weight', '800'); text.setAttribute('fill', color); text.setAttribute('stroke', '#f0ead9'); text.setAttribute('stroke-width', '6'); text.setAttribute('paint-order', 'stroke'); text.textContent = label; svg.appendChild(text);
  }

  function drawLineFor(match, pathIndex) {
    const color = match.solved ? (match.op ? OP_COLORS[match.op] : '#4f8c54') : '#859099';
    svgLine(anchorCenter('first-out', match.first), anchorCenter('second-in', match.second), color, match.op || '', false, pathIndex);
    if (state.random && match.answer !== undefined) svgLine(anchorCenter('second-out', match.second), anchorCenter('answer-in', match.answer), color, '=', false, pathIndex);
  }

  function drawLines() {
    const box = board.getBoundingClientRect(); svg.setAttribute('viewBox', `0 0 ${box.width} ${box.height}`); svg.innerHTML = '';
    state.paths.forEach(drawLineFor);
    if (state.drag && state.drag.moved) svgLine(state.drag.start, state.drag.current, '#56636d', '', true);
  }

  function boardPoint(event) { const box = board.getBoundingClientRect(); return { x: event.clientX - box.left, y: event.clientY - box.top }; }
  function dragAnchor(role, index) { return role === 'first' ? anchorCenter('first-out', index) : role === 'second' && state.random ? anchorCenter('second-out', index) : anchorCenter('second-in', index); }

  function erasePath(pathIndex) {
    if (!state.paths[pathIndex]) return;
    state.paths.splice(pathIndex, 1);
    if (state.partial) {
      if (state.partial.pathIndex === pathIndex) state.partial = null;
      else if (state.partial.pathIndex > pathIndex) state.partial.pathIndex--;
    }
    state.done = false; $('again-btn').classList.add('hidden');
    say('Line removed.', '#59646d'); render();
  }

  function beginDrag(event) {
    if (state.done || event.currentTarget.disabled) return;
    event.preventDefault();
    const role = event.currentTarget.dataset.role; const index = Number(event.currentTarget.dataset.index);
    const start = dragAnchor(role, index);
    state.drag = { role, index, start, current: boardPoint(event), moved: false };
    event.currentTarget.setPointerCapture(event.pointerId); drawLines();
  }

  function moveDrag(event) {
    if (!state.drag) return;
    event.preventDefault(); state.drag.current = boardPoint(event);
    if (state.drag.start && Math.hypot(state.drag.current.x - state.drag.start.x, state.drag.current.y - state.drag.start.y) > DRAG_PREVIEW_DISTANCE) state.drag.moved = true;
    drawLines();
  }
  function cancelDrag() { state.drag = null; drawLines(); }

  function nearestDrop(from, event) {
    const targetRole = from.role === 'first' ? 'second' : (from.role === 'second' && state.random ? 'answers' : null);
    const kind = targetRole === 'second' ? 'second-in' : targetRole === 'answers' ? 'answer-in' : null;
    if (!kind) return null;
    let closest = null;
    document.querySelectorAll(`.match-anchor[data-kind="${kind}"]`).forEach((anchor) => {
      const rect = anchor.getBoundingClientRect(); const x = rect.left + rect.width / 2; const y = rect.top + rect.height / 2;
      const distance = Math.hypot(event.clientX - x, event.clientY - y);
      if (!closest || distance < closest.distance) closest = { role: targetRole, index: Number(anchor.dataset.index), distance };
    });
    return closest && closest.distance <= 140 ? closest : null;
  }

  function endDrag(event) {
    if (!state.drag) return;
    const from = state.drag; state.drag = null; state.suppressClickUntil = Date.now() + 350;
    const target = document.elementFromPoint(event.clientX, event.clientY); const button = target && target.closest('.math-match-item');
    if (!from.moved && (!button || button === event.currentTarget)) { tapChoice(from.role, from.index); drawLines(); return; }
    const drop = button && button !== event.currentTarget
      ? { role: button.dataset.role, index: Number(button.dataset.index) }
      : nearestDrop(from, event);
    if (!drop) { say('Release near a dot in the next column.', '#9a2f22'); drawLines(); return; }
    const { role, index } = drop;
    if (from.role === 'first' && role === 'second') { state.selected = { role: 'first', index: from.index }; tapChoice('second', index); return; }
    if (from.role === 'second' && role === 'answers') {
      if (!state.partial || state.paths[state.partial.pathIndex].second !== from.index) { say('Draw from the second number in the current path to an answer.', '#9a2f22'); drawLines(); return; }
      tapChoice('answers', index); return;
    }
    say('Draw from first to second, then second to answer.', '#9a2f22'); drawLines();
  }

  function beginNewGame() {
    const name = isGameMode() ? game.name : '';
    game = freshGame(numberValue('cfg-lives', 5, 1, 9), numberValue('cfg-target', 10, $('cfg-random-target').checked ? 4 : 2, 100));
    game.name = name; game.started = isGameMode();
    saveGame(); renderGameStatus(); startRound();
  }

  function startCasualMode() {
    activeSlot = null;
    game = freshGame(numberValue('cfg-lives', 5, 1, 9), numberValue('cfg-target', 10, $('cfg-random-target').checked ? 4 : 2, 100));
    setPracticeTab('casual');
    startRound();
  }

  function openGameMode() {
    setPracticeTab('game');
  }

  function resetForSettings() {
    if (activeSlot === null) {
      game = freshGame(numberValue('cfg-lives', 5, 1, 9), numberValue('cfg-target', 10, $('cfg-random-target').checked ? 4 : 2, 100));
      renderGameStatus(); startRound(); return;
    }
    const name = game.name;
    game = freshGame(numberValue('cfg-lives', 5, 1, 9), numberValue('cfg-target', 10, $('cfg-random-target').checked ? 4 : 2, 100));
    game.name = name; saveGame(); renderGameStatus(); startRound();
  }

  function scheduleSettingsReset() { clearTimeout(settingTimer); settingTimer = window.setTimeout(resetForSettings, 120); }
  $('cfg-lives').value = String(game.startLives); renderGameStatus();
  $('new-btn').addEventListener('click', beginNewGame); $('reset-btn').addEventListener('click', startRound); $('again-btn').addEventListener('click', startRound);
  $('start-casual-btn').addEventListener('click', startCasualMode);
  $('open-game-mode-btn').addEventListener('click', openGameMode);
  $('rename-active-save').addEventListener('click', () => { if (isGameMode()) renameSaveSlot(activeSlot); });
  $('delete-active-save').addEventListener('click', () => { if (isGameMode()) deleteSaveSlot(activeSlot); });
  ['cfg-mode', 'cfg-target', 'cfg-count', 'cfg-random-target', 'cfg-lives'].forEach((id) => $(id).addEventListener('change', scheduleSettingsReset));
  document.querySelectorAll('.cfg-mix-op').forEach((input) => input.addEventListener('change', () => {
    if (!selectedOps().length) input.checked = true;
    scheduleSettingsReset();
  }));
  document.querySelectorAll('.op-choice').forEach((button) => button.addEventListener('click', () => { state.operator = button.dataset.op; render(); }));
  window.addEventListener('resize', drawLines);
  renderSaveSlots(); setPracticeTab('casual'); startRound();
})();
