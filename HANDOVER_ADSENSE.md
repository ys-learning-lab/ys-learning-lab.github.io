# Handover: AdSense approval work (Ys Learning Lab)

Date: 2026-10-11. Repo: this folder (`ys-learning-lab.github.io`). Do not touch `atlastrack_extension`.
Do not commit or push unless the user asks. Many other files already have uncommitted changes; leave them alone.

## Diagnosis (done, do not redo)
- AdSense site status is 準備中 ("Getting ready"), ads.txt approved, last update 2026-10-05.
- Live site is technically clean: crawlers get 200 on every page, sitemap OK, ads.txt OK, ad requests return 200 (not 403).
- Every ad unit comes back `data-ad-status="unfilled"` because Google has not approved the site. Auto ads also injected a unit (should be OFF in AdSense; user must do that).
- Likely rejection reason: "low value content" (tool pages with thin written content). Not a code bug.

## Already done in the working tree
1. Removed ad-container height caps on all 11 ad pages (`max-h-[...] overflow-hidden` gone; Google serves 100px/280px ads that were being clipped).
2. Removed the `#ad-slot-below-preview` ad under the game in `kana-word-puzzle.html` and `kana-word-search.html` (temporary, for review).
3. Added one new content section each (English in HTML, ja + zh in dictionaries), inserted just before the in-article ad:
   - `kana-word-puzzle.html` (`wp.mix`, confusable kana), `kana-word-search.html` (`ws.tips`), `kana-puzzle-sheet.html` (`ps.ideas`), `kana-search-sheet.html` (`ss.ideas`).
   - Dictionaries edited: `js/i18n-{ja,zh}-{wordpuzzle,wordsearch,puzzlesheet,searchsheet}.js` (all pass `node --check`).

## Original remaining tasks (superseded by the continuation update below)
1. **Bump cache-busting `?v=` numbers** by +1 in the `<script>` tags for the 8 edited dictionaries:
   - `kana-word-puzzle.html`: i18n-ja-wordpuzzle, i18n-zh-wordpuzzle
   - `kana-word-search.html`: i18n-ja-wordsearch, i18n-zh-wordsearch
   - `kana-puzzle-sheet.html`: i18n-ja-puzzlesheet, i18n-zh-puzzlesheet
   - `kana-search-sheet.html`: i18n-ja-puzzlesheet, i18n-zh-puzzlesheet, i18n-ja-searchsheet, i18n-zh-searchsheet
2. **Update README.md "Ads" section** (around lines 221-262):
   - Ad list: `kana-search-sheet.html` belongs with the "two ads each" pages; `kana-word-puzzle.html` and `kana-word-search.html` now have only `#ad-slot-in-article` (below-game ad removed 2026-10-11 during review; can return after approval, never next to a button).
   - Replace the paragraph "All ad slot containers cap their height..." with: slots must NOT cap height (no `max-h`/`overflow-hidden`); unfilled units collapse via the `site.css` rule `ins.adsbygoogle[data-ad-status="unfilled"]`.
3. **Verify**: open each of the 4 edited pages locally, in English, 日本語 and 中文, and check the new section renders, no console errors, no ad cropped. Check mobile width.
4. Follow `C:\Users\Yu\Documents\Project\Design AtlasTrack Application\PUBLIC_CONTENT_RULES.md` for any added public text (no brands/franchises, only true claims).
5. Optional: add more on-page reference content to other thin tool pages (`kana-online`, `kana-chart`, `kana-tap-practice`, `support`). Keep it useful, not filler.

## Continuation update (2026-10-11)
- Completed the cache-busting updates: the edited word-puzzle dictionaries now use `?v=6` / `?v=3`, the word-search dictionaries `?v=3` / `?v=2`, the shared puzzle-sheet dictionaries `?v=3` / `?v=2`, and the search-sheet dictionaries `?v=3` / `?v=2`.
- Updated the README Ads section to match the review-time placements and to prohibit height caps or overflow cropping on ad containers.
- Static validation passed: `node --check` succeeded for all eight edited language dictionaries and `git diff --check` passed for the touched ad/content files.
- Still required: visual verification of the four edited pages in English, Japanese, and Chinese, including a mobile-width check. This continuation did not run browser validation.

## User-only steps (tell the user)
- AdSense: turn Auto ads OFF; check Policy center and account verification.
- Deploy (push) the changes, wait 1-2 weeks for indexing, check Search Console indexed page count, then request review.
- After approval the user may add ads to game pages again, but must keep ads away from buttons/play areas and not styled like game UI.

## Navigation improvement (2026-10-11)
- Added a shared, visible breadcrumb trail and `BreadcrumbList` JSON-LD to content, tool, and utility-information pages. It is localized in English, Japanese, and Chinese; the homepage plus results/answer utility pages intentionally have no trail.
- Implementation: `js/mobile-nav.js` (shared builder and page map), `assets/css/site.css` (text-first trail styling), and the two common language dictionaries. All pages now load `mobile-nav.js?v=5` and `site.css?v=13`; pages using the common dictionaries load their new cache versions.
- Added `id="printables"` to the Japanese hub's printable section, so the breadcrumb's intermediate link reaches a real page section. Static JavaScript and diff checks pass; browser visual verification remains outstanding.

## Task 5 detail: reference content on thin pages (replaces the optional line above)
Status: completed in the working tree on 2026-10-11. Added the planned reference sections to all four priority pages, their Japanese and Chinese dictionaries, and bumped every affected dictionary cache version. `node --check`, key-presence checks, and `git diff --check` pass; visual browser verification remains outstanding.

No standalone blog articles (user called generic articles bloat). Add useful reference text on existing pages, English in HTML, ja + zh in the page dictionaries, ~300-500 new words each, no filler. Use only the site's own kana/word list for examples.
Priority order:
1. `kana-chart.html` (326 words): how rows are organised, dakuten/handakuten, small ゃゅょ and っ, long vowels.
2. `kana-online.html` (215 words): guide to choosing an activity by level, plus a suggested weekly routine.
3. `japanese.html` hub (527 words): a "where to start" path (chart -> writing practice -> quiz and games).
4. `kana-tap-practice.html` (726 words): tips for learning by sound and by shape; how scoring works. Lowest priority.
Skip `index.html` (already ~760 words) and `support.html`.
Check every claim against the code before writing it (PUBLIC_CONTENT_RULES.md section 3). Bump `?v=` on every edited script.
