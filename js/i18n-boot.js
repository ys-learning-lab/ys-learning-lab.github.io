// Loaded synchronously in <head>, before first paint. If the URL (or saved choice)
// asks for a non-English language, hide the page until i18n.js has translated it,
// so visitors never see English flash into Japanese. i18n.js removes the class;
// the timeout is a safety net in case the translation scripts fail to load.
(function () {
  try {
    var lang = new URLSearchParams(location.search).get('lang');
    if (lang !== 'en' && lang !== 'ja' && lang !== 'zh') lang = localStorage.getItem('ysll-lang');
    if (lang === 'ja' || lang === 'zh') {
      var root = document.documentElement;
      root.lang = lang;
      root.classList.add('i18n-pending');
      var style = document.createElement('style');
      style.textContent = 'html.i18n-pending body{visibility:hidden}';
      document.head.appendChild(style);
      setTimeout(function () { root.classList.remove('i18n-pending'); }, 1500);
    }
  } catch (e) { /* storage blocked: render English normally */ }
})();
