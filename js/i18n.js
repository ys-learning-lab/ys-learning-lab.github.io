// Tiny UI translation layer. English lives in the HTML itself (so crawlers and
// no-JS visitors still get it); this file only holds the *other* languages.
//
// Markup hooks:
//   data-i18n="key"              replaces textContent
//   data-i18n-html="key"         replaces innerHTML (for strings containing links/markup)
//   data-i18n-placeholder="key"  replaces the placeholder attribute
//   data-i18n-tip="key"          replaces the data-tip attribute (hover text of a .help-tip)
//   data-i18n-aria="key"         replaces the aria-label attribute
//   data-i18n-title="key"        replaces the <title>/title attribute (use on <title> too)
//   <select data-lang-select>    language dropdown; wired automatically
// The original English is captured from the DOM on first apply, so switching back
// to English needs no duplicate English dictionary.
//
// Dynamic strings in JS: I18N.t('key', 'English fallback').
// Re-render dynamic parts by listening for the 'i18n:change' event on document.

(function () {
  const STORAGE_KEY = 'ysll-lang';
  const SUPPORTED = ['en', 'ja', 'zh'];
  const dictionaries = { ja: {}, zh: {} };
  let current = 'en';

  function register(lang, entries) {
    dictionaries[lang] = Object.assign(dictionaries[lang] || {}, entries);
  }

  function detectInitial() {
    try {
      const fromQuery = new URLSearchParams(location.search).get('lang');
      if (SUPPORTED.includes(fromQuery)) return fromQuery;
      const stored = localStorage.getItem(STORAGE_KEY);
      if (SUPPORTED.includes(stored)) return stored;
    } catch (e) { /* storage may be blocked; fall through */ }
    return 'en';
  }

  // Optional vars fill {name} placeholders in either language.
  function t(key, fallback, vars) {
    const dict = dictionaries[current] || {};
    const text = current !== 'en' && Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : fallback;
    return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : text;
  }

  // Cache the English original on each element the first time we touch it.
  function original(el, prop) {
    const cacheKey = `i18nOrig${prop}`;
    if (!(cacheKey in el.dataset)) {
      const value = prop === 'Html' ? el.innerHTML
        : prop === 'Placeholder' ? el.getAttribute('placeholder') || ''
        : prop === 'Title' ? (el.tagName === 'TITLE' ? el.textContent : el.getAttribute('title') || '')
        : el.textContent;
      el.dataset[cacheKey] = value;
    }
    return el.dataset[cacheKey];
  }

  function applyTo(root) {
    root.querySelectorAll('[data-i18n]').forEach((el) => {
      el.textContent = t(el.dataset.i18n, original(el, 'Text'));
    });
    root.querySelectorAll('[data-i18n-html]').forEach((el) => {
      el.innerHTML = t(el.dataset.i18nHtml, original(el, 'Html'));
    });
    root.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
      el.setAttribute('placeholder', t(el.dataset.i18nPlaceholder, original(el, 'Placeholder')));
    });
    root.querySelectorAll('[data-i18n-tip]').forEach((el) => {
      if (!('i18nOrigTip' in el.dataset)) el.dataset.i18nOrigTip = el.getAttribute('data-tip') || '';
      el.setAttribute('data-tip', t(el.dataset.i18nTip, el.dataset.i18nOrigTip));
    });
    root.querySelectorAll('[data-i18n-aria]').forEach((el) => {
      if (!('i18nOrigAria' in el.dataset)) el.dataset.i18nOrigAria = el.getAttribute('aria-label') || '';
      el.setAttribute('aria-label', t(el.dataset.i18nAria, el.dataset.i18nOrigAria));
    });
    root.querySelectorAll('[data-i18n-title]').forEach((el) => {
      const text = t(el.dataset.i18nTitle, original(el, 'Title'));
      if (el.tagName === 'TITLE') el.textContent = text; else el.setAttribute('title', text);
    });
  }

  // The URL is the source of truth for language: this page's own address and every
  // internal .html link carry ?lang=xx, so a language has its own shareable URL and
  // navigating between pages never falls back to English first.
  function withLang(href, lang) {
    if (!/^[\w-]+\.html([?#]|$)/.test(href)) return null; // external, anchor, mailto, etc.
    const url = new URL(href, location.href);
    url.searchParams.set('lang', lang);
    return url.pathname.split('/').pop() + url.search + url.hash;
  }

  function syncUrl(lang) {
    document.querySelectorAll('a[href]').forEach((a) => {
      const next = withLang(a.getAttribute('href'), lang);
      if (next) a.setAttribute('href', next);
    });
    try {
      const url = new URL(location.href);
      url.searchParams.set('lang', lang);
      history.replaceState(null, '', url);
    } catch (e) { /* e.g. file:// in some browsers; links are still updated */ }
  }

  function setLang(lang) {
    if (!SUPPORTED.includes(lang)) return;
    current = lang;
    try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) { /* ignore */ }
    document.documentElement.lang = lang === 'zh' ? 'zh-Hans' : lang;
    if (lang === 'zh' && !document.getElementById('zh-font')) {
      // Same Chinese web font that i18n-boot.js loads when the page opens in Chinese.
      const link = document.createElement('link');
      link.id = 'zh-font';
      link.rel = 'stylesheet';
      link.href = 'https://fonts.googleapis.com/css2?family=Noto+Sans+SC:wght@400..900&display=swap';
      document.head.appendChild(link);
    }
    applyTo(document);
    document.querySelectorAll('select[data-lang-select]').forEach((sel) => { sel.value = lang; });
    syncUrl(lang);
    document.documentElement.classList.remove('i18n-pending');
    document.dispatchEvent(new CustomEvent('i18n:change', { detail: { lang } }));
  }

  function init() {
    document.querySelectorAll('select[data-lang-select]').forEach((sel) => {
      sel.addEventListener('change', () => setLang(sel.value));
    });
    setLang(detectInitial());
  }

  window.I18N = { register, t, setLang, getLang: () => current, init };
})();
