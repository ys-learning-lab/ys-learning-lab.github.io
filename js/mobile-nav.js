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
})();
