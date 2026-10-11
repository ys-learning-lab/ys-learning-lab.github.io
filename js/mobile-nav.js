// Phone layout for the top bar: the Math and Japanese keys leave the header and sit on the left of a
// row under it, with the language dropdown (if the page has one) on the right. Wider screens get the
// original markup back.
// Loaded synchronously in <head>: it hides the page on phones until the keys have moved (see
// .mnav-pending in site.css), so nothing visibly jumps between pages.
(function () {
  const root = document.documentElement;
  const mq = window.matchMedia('(max-width: 639px)');
  if (mq.matches) root.classList.add('mnav-pending');
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setup);
  else setup();

  function setup() {
  try { build(); } finally { root.classList.remove('mnav-pending'); }
  // i18n initialization is registered later in each page. Waiting one task lets
  // it set the active language before the visible trail and JSON-LD are built.
  window.setTimeout(buildBreadcrumbs, 0);
  }

  function build() {
  const header = document.querySelector('header.site-header');
  if (!header) return;
  const keys = Array.from(header.querySelectorAll('a.nav-key'));
  if (!keys.length) return;
  const keyHome = keys[0].parentNode;
  const keyNext = keys[keys.length - 1].nextSibling;
  const sel0 = document.querySelector('select[data-lang-select]');
  const select = sel0 && (sel0.closest('[data-lang-wrap]') || sel0);
  const selHome = select && select.parentNode;
  const selNext = select && select.nextSibling;
  let bar = null;

  function apply() {
    if (mq.matches && !bar) {
      bar = document.createElement('div');
      bar.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:0.5rem;padding:0.75rem 1rem 0;max-width:72rem;margin:0 auto;width:100%';
      const left = document.createElement('div');
      left.style.cssText = 'display:flex;align-items:center;gap:0.5rem';
      keys.forEach((k) => left.appendChild(k));
      bar.appendChild(left);
      if (select) bar.appendChild(select);
      header.insertAdjacentElement('afterend', bar);
    } else if (!mq.matches && bar) {
      keys.forEach((k) => keyHome.insertBefore(k, keyNext));
      if (select) selHome.insertBefore(select, selNext);
      bar.remove();
      bar = null;
    }
  }
  apply();
  mq.addEventListener('change', apply);
  }

  function buildBreadcrumbs() {
    const main = document.querySelector('main');
    const title = main && main.querySelector('h1');
    if (!main || !title || document.querySelector('.site-breadcrumb')) return;

    const page = location.pathname.split('/').pop() || 'index.html';
    const config = breadcrumbConfig(page);
    if (!config) return;

    const text = (key) => {
      const fallback = BREADCRUMB_TEXT[key] || key;
      return window.I18N && typeof I18N.t === 'function' ? I18N.t(`bc.${key}`, fallback) : fallback;
    };
    const items = [{ href: 'index.html', key: 'home' }].concat(config.ancestors || []);
    const trail = document.createElement('nav');
    trail.className = 'site-breadcrumb';
    trail.setAttribute('aria-label', text('label'));

    const list = document.createElement('ol');
    const schemaItems = [];
    items.forEach((item, index) => {
      const li = document.createElement('li');
      const link = document.createElement('a');
      link.href = item.href;
      link.textContent = text(item.key);
      li.appendChild(link);
      list.appendChild(li);
      schemaItems.push(schemaItem(index + 1, link.href, link.textContent));
    });

    const current = document.createElement('li');
    current.setAttribute('aria-current', 'page');
    current.textContent = text(config.current);
    list.appendChild(current);
    schemaItems.push(schemaItem(schemaItems.length + 1, `${location.origin}${location.pathname}`, current.textContent));
    trail.appendChild(list);
    title.before(trail);

    const data = document.createElement('script');
    data.type = 'application/ld+json';
    data.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: schemaItems });
    document.head.appendChild(data);
  }

  function schemaItem(position, href, name) {
    return { '@type': 'ListItem', position, name, item: new URL(href, location.href).href };
  }

  function breadcrumbConfig(page) {
    const japanese = { href: 'japanese.html', key: 'japanese' };
    const printables = { href: 'japanese.html#printables', key: 'printables' };
    const online = { href: 'kana-online.html', key: 'online' };
    const pages = {
      'about.html': { current: 'about' },
      'contact.html': { current: 'contact' },
      'privacy.html': { current: 'privacy' },
      'support.html': { current: 'support' },
      'math.html': { current: 'math' },
      'japanese.html': { current: 'japanese' },
      'kana-online.html': { ancestors: [japanese], current: 'online' },
      'kana-study-plan.html': { ancestors: [japanese], current: 'plan' },
      'kana-chart.html': { ancestors: [japanese, printables], current: 'chart' },
      'japanese-practice.html': { ancestors: [japanese, printables], current: 'practice' },
      'kana-matching.html': { ancestors: [japanese, printables], current: 'matching' },
      'kana-quiz.html': { ancestors: [japanese, printables], current: 'quiz' },
      'kana-word-builder.html': { ancestors: [japanese, printables], current: 'builder' },
      'kana-puzzle-sheet.html': { ancestors: [japanese, printables], current: 'puzzleSheet' },
      'kana-search-sheet.html': { ancestors: [japanese, printables], current: 'searchSheet' },
      'kana-tap-practice.html': { ancestors: [japanese, online], current: 'tap' },
      'kana-word-puzzle.html': { ancestors: [japanese, online], current: 'wordPuzzle' },
      'kana-word-search.html': { ancestors: [japanese, online], current: 'wordSearch' },
    };
    return pages[page] || null;
  }

  const BREADCRUMB_TEXT = {
    label: 'Breadcrumb', home: 'Home', japanese: 'Japanese', math: 'Math', printables: 'Charts and printables',
    online: 'Online Learning', plan: 'Study Plan', chart: 'Kana Chart', practice: 'Writing Practice',
    matching: 'Kana Matching', quiz: 'Kana Conversion Quiz', builder: 'Kana Word Builder',
    puzzleSheet: 'Kana Word Puzzle Worksheet', searchSheet: 'Kana Word Search Worksheet', tap: 'Tap Practice',
    wordPuzzle: 'Kana Word Puzzle', wordSearch: 'Kana Word Search', about: 'About', privacy: 'Privacy Policy',
    contact: 'Contact', support: 'Support',
  };
})();
