(() => {
  const params = new URLSearchParams(window.location.search);
  const phoneLayoutSetting = params.get('phone-demo');
  const forcePhoneLayout = phoneLayoutSetting === '1';
  const disablePhoneLayout = phoneLayoutSetting === '0';
  const portraitPhone = window.matchMedia('(max-width: 700px) and (orientation: portrait)');
  const listenForLayoutChange = (callback) => {
    if (portraitPhone.addEventListener) portraitPhone.addEventListener('change', callback);
    else portraitPhone.addListener(callback);
  };

  if (disablePhoneLayout) return;
  if (!forcePhoneLayout && !portraitPhone.matches) {
    listenForLayoutChange((event) => {
      if (event.matches) window.location.reload();
    });
    return;
  }
  if (!forcePhoneLayout) {
    listenForLayoutChange((event) => {
      if (!event.matches) window.location.reload();
    });
  }

  document.documentElement.classList.add('phone-layout-demo');

  const stylesheet = document.createElement('link');
  stylesheet.rel = 'stylesheet';
  stylesheet.href = 'assets/css/math-worksheets-phone-demo.css?v=11';
  document.head.appendChild(stylesheet);

  function initialisePhoneDemo() {
    const controls = document.getElementById('controls');
    const preview = document.getElementById('preview');
    const tabs = preview?.querySelector('.worksheet-mode-tabs');
    const modeFolder = document.getElementById('worksheet-mode-folder');
    const templates = controls?.querySelector('fieldset');
    const layout = controls?.parentElement;
    if (!controls || !preview || !tabs || !modeFolder || !templates || !layout) return;

    layout.classList.add('phone-demo-layout');

    const templateRegion = document.createElement('section');
    templateRegion.className = 'phone-demo-template-region';
    templateRegion.setAttribute('aria-label', 'Quick templates');
    templateRegion.appendChild(templates);

    const typeRegion = document.createElement('section');
    typeRegion.className = 'phone-demo-type-region';
    const typeHeading = document.createElement('h2');
    typeHeading.className = 'phone-demo-section-title';
    typeHeading.textContent = 'Worksheet type';
    typeRegion.append(typeHeading, tabs, modeFolder);

    layout.insertBefore(templateRegion, controls);
    layout.insertBefore(typeRegion, controls);

    const pageHeading = document.createElement('h2');
    pageHeading.className = 'phone-demo-section-title';
    pageHeading.textContent = 'Page settings';
    controls.insertBefore(pageHeading, controls.firstChild);

    const standardPanel = document.getElementById('panel-standard');
    if (standardPanel) {
      const operationHeading = document.createElement('h2');
      operationHeading.className = 'phone-demo-section-title phone-demo-operation-title';
      operationHeading.textContent = 'Operation settings';
      standardPanel.insertBefore(operationHeading, standardPanel.firstChild);
    }

    const pageLabel = document.getElementById('print-preview-page-label');
    const previewHeading = pageLabel?.parentElement;
    const pageSelect = document.createElement('select');
    pageSelect.className = 'phone-demo-page-select';
    pageSelect.setAttribute('aria-label', 'Preview page');
    const refreshButton = document.getElementById('refresh-preview-btn');
    if (previewHeading && refreshButton) {
      previewHeading.classList.add('phone-demo-preview-meta');
      previewHeading.nextElementSibling?.classList.add('phone-demo-preview-help');
      refreshButton.classList.add('phone-demo-preview-refresh');
    }

    const previewSheet = document.createElement('div');
    previewSheet.className = 'phone-demo-preview-sheet';
    while (preview.firstChild) previewSheet.appendChild(preview.firstChild);

    const overlayHeader = document.createElement('div');
    overlayHeader.className = 'phone-demo-overlay-header';
    const overlayTitle = document.createElement('h2');
    overlayTitle.textContent = 'Worksheet preview';
    const overlayPageControls = document.createElement('div');
    overlayPageControls.className = 'phone-demo-overlay-page-controls';
    if (pageLabel) overlayPageControls.append(pageLabel, pageSelect);
    overlayHeader.append(overlayTitle, overlayPageControls);

    const overlayActions = document.createElement('div');
    overlayActions.className = 'phone-demo-overlay-actions';
    const openPrintPage = document.createElement('button');
    openPrintPage.type = 'button';
    openPrintPage.className = 'btn-key btn-key-primary';
    openPrintPage.textContent = 'Open print page';
    overlayActions.appendChild(openPrintPage);

    previewSheet.insertBefore(overlayHeader, previewSheet.firstChild);
    previewSheet.appendChild(overlayActions);
    const previewShell = document.getElementById('print-preview-shell');
    if (refreshButton && previewShell) previewShell.appendChild(refreshButton);
    preview.appendChild(previewSheet);
    preview.classList.add('phone-demo-preview-overlay', 'phone-demo-pages-hidden');
    preview.setAttribute('role', 'dialog');
    preview.setAttribute('aria-modal', 'true');
    preview.setAttribute('aria-labelledby', 'phone-demo-preview-title');
    overlayTitle.id = 'phone-demo-preview-title';
    preview.setAttribute('aria-hidden', 'true');
    preview.inert = true;
    previewSheet.tabIndex = -1;

    const mobileDock = document.createElement('nav');
    mobileDock.className = 'phone-demo-mobile-dock';
    mobileDock.setAttribute('aria-label', 'Worksheet setup sections');

    const makeDockButton = (label, ariaLabel, className) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `phone-demo-dock-button btn-key ${className}`;
      button.textContent = label;
      button.setAttribute('aria-label', ariaLabel);
      return button;
    };
    const levelsButton = makeDockButton('Levels', 'Go to level selection', 'btn-key-terracotta');
    const typeButton = makeDockButton('Type', 'Go to worksheet type', 'btn-key-gold');
    const pageButton = makeDockButton('Page', 'Go to page settings', 'btn-key-sage');
    const previewButton = makeDockButton('Preview', 'Open worksheet preview', 'btn-key-primary');
    previewButton.setAttribute('aria-controls', 'preview');
    previewButton.setAttribute('aria-expanded', 'false');
    mobileDock.append(levelsButton, typeButton, pageButton, previewButton);
    document.body.appendChild(mobileDock);

    const scrollToRegion = (region) => {
      const headerHeight = document.querySelector('.site-header')?.getBoundingClientRect().height || 0;
      const top = region.getBoundingClientRect().top + window.scrollY - headerHeight - 10;
      window.scrollTo({ top, left: 0, behavior: 'smooth' });
    };

    const showPreview = () => {
      preview.classList.add('is-open');
      preview.setAttribute('aria-hidden', 'false');
      preview.inert = false;
      previewButton.setAttribute('aria-expanded', 'true');
      previewButton.setAttribute('aria-label', 'Close worksheet preview');
      previewButton.textContent = 'Close';
      document.body.classList.add('phone-demo-preview-open');
      previewSheet.focus({ preventScroll: true });
      window.requestAnimationFrame(() => {
        document.querySelector('.print-preview-thumbnail.is-active')?.click();
      });
    };
    const hidePreview = (returnFocus = true) => {
      preview.classList.remove('is-open');
      preview.setAttribute('aria-hidden', 'true');
      preview.inert = true;
      previewButton.setAttribute('aria-expanded', 'false');
      previewButton.setAttribute('aria-label', 'Open worksheet preview');
      previewButton.textContent = 'Preview';
      document.body.classList.remove('phone-demo-preview-open');
      if (returnFocus) previewButton.focus({ preventScroll: true });
    };

    const closeAndScroll = (region) => {
      if (preview.classList.contains('is-open')) hidePreview(false);
      window.requestAnimationFrame(() => scrollToRegion(region));
    };
    levelsButton.addEventListener('click', () => closeAndScroll(templateRegion));
    typeButton.addEventListener('click', () => closeAndScroll(typeRegion));
    pageButton.addEventListener('click', () => closeAndScroll(controls));
    previewButton.addEventListener('click', () => {
      if (preview.classList.contains('is-open')) hidePreview();
      else showPreview();
    });
    preview.addEventListener('click', (event) => {
      if (event.target === preview) hidePreview();
    });
    const thumbnails = document.getElementById('print-preview-thumbnails');
    const syncPageNavigation = () => {
      if (!thumbnails) return;
      const pageButtons = [...thumbnails.querySelectorAll('.print-preview-thumbnail')];
      if (pageSelect.options.length !== pageButtons.length) {
        pageSelect.replaceChildren(...pageButtons.map((button) => {
          const option = document.createElement('option');
          option.value = button.dataset.pageNumber;
          option.textContent = `Page ${button.dataset.pageNumber}`;
          return option;
        }));
      }
      const activePage = thumbnails.querySelector('.print-preview-thumbnail.is-active')?.dataset.pageNumber;
      if (activePage) pageSelect.value = activePage;
      pageSelect.classList.toggle(
        'is-available',
        pageButtons.length > 1,
      );
    };
    pageSelect.addEventListener('change', () => {
      thumbnails?.querySelector(`.print-preview-thumbnail[data-page-number="${pageSelect.value}"]`)?.click();
    });
    if (thumbnails) {
      new MutationObserver(syncPageNavigation).observe(thumbnails, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class'],
      });
    }
    syncPageNavigation();
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && preview.classList.contains('is-open')) hidePreview();
    });
    openPrintPage.addEventListener('click', () => {
      document.getElementById('generate-btn')?.click();
    });

    const installAdaptiveSegmentLayout = (distribution) => {
      if (!distribution) return;
      let updateQueued = false;
      const updateSegments = () => {
        updateQueued = false;
        distribution.querySelectorAll('.operation-segment').forEach((segment) => {
          const percent = Number.parseFloat(segment.querySelector('.operation-segment-percent')?.textContent) || 0;
          const shouldPopOut = percent <= 5 || segment.getBoundingClientRect().width < 64;
          segment.classList.toggle('is-compact', shouldPopOut);
        });
      };
      const queueUpdate = () => {
        if (updateQueued) return;
        updateQueued = true;
        window.requestAnimationFrame(updateSegments);
      };
      new ResizeObserver(queueUpdate).observe(distribution);
      new MutationObserver(queueUpdate).observe(distribution, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style'],
      });
      queueUpdate();
    };
    installAdaptiveSegmentLayout(document.getElementById('operation-distribution'));
    installAdaptiveSegmentLayout(document.getElementById('fraction-operation-distribution'));

    let tabPressScrollY = 0;
    tabs.addEventListener('pointerdown', (event) => {
      if (event.target.closest('.worksheet-mode-tab')) tabPressScrollY = window.scrollY;
    }, true);
    tabs.addEventListener('click', (event) => {
      if (event.target.closest('.worksheet-mode-tab')) tabPressScrollY = window.scrollY;
    }, true);
    tabs.addEventListener('click', (event) => {
      if (!event.target.closest('.worksheet-mode-tab')) return;
      const restorePosition = () => window.scrollTo({ top: tabPressScrollY, left: 0, behavior: 'auto' });
      window.requestAnimationFrame(() => window.requestAnimationFrame(restorePosition));
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialisePhoneDemo);
  } else {
    initialisePhoneDemo();
  }
})();
