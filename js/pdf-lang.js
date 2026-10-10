// Text printed on the generated PDFs, in English or Japanese, plus the "PDF language"
// dropdown that picks between them. Shared by the three Japanese tools.
//
// Every Japanese character used here must exist in assets/fonts/NotoSansJP-Regular.ttf,
// which is a pre-made subset (see README). When you add Japanese text below, rebuild
// the subset from this file's strings - a missing glyph prints as a blank box.
// The Japanese PDF text is kana only (hiragana and katakana, no kanji), with ASCII
// punctuation (": ", "!").

const PDF_TEXT = {
  en: {
    'hdr.name': 'Name: _________________________',
    'hdr.date': 'Date: _______________',
    'hdr.teacher': 'Teacher: {name}',
    'hdr.class': 'Class: _______________',

    'practice.defaultHira': 'Hiragana Writing Practice',
    'practice.defaultKata': 'Katakana Writing Practice',
    'practice.sample': ' - Sample Answer',
    'practice.writeWord': 'Write this word:',
    'practice.writeFit': 'Write a word that fits:',
    'practice.answer': 'Sample answer:',
    'practice.footer': 'Powered by Ys Learning Lab - HANDWRITING PRACTICE',

    'match.default': 'Kana Matching',
    'match.keySuffix': ' - Answer Key',
    'match.hira': 'Hiragana',
    'match.kata': 'Katakana',
    'match.romaji': 'Romaji',
    'match.form.h-k': 'hiragana as katakana, or katakana as hiragana',
    'match.form.h-r': 'hiragana as romaji, or romaji as hiragana',
    'match.form.k-r': 'katakana as romaji, or romaji as katakana',
    'match.intro': 'Draw a line from each box on the left to its match on the right. Some boxes may have no match. If you find one, circle it and write it in the other form beside it ({form}).',
    'match.keyNote': 'Boxes marked with an X have no match. The converted kana is written beside each one.',
    'match.footer': 'Powered by Ys Learning Lab - KANA MATCHING',

    'quiz.default': 'Kana Practice Test',
    'quiz.title.k2h': 'カタカナ → ひらがな 練習',
    'quiz.title.h2k': 'ひらがな → カタカナ 練習',
    'quiz.title.mixed': 'ひらがな & カタカナ (Mixed)',
    'quiz.write.k2h': 'Write the Hiragana equivalent below.',
    'quiz.write.h2k': 'Write the Katakana equivalent below.',
    'quiz.write.mixed': 'Write the opposite Kana equivalent below.',
    'quiz.name': '名前 (Name): _________________',
    'quiz.code': 'Code: {code}',
    'quiz.docKey': 'ANSWER KEY',
    'quiz.docSheet': 'PRACTICE SHEET',
    'quiz.page': 'Page {n} of {total}',
    'quiz.footer': 'Powered by Ys Learning Lab - {doc} - {page}',
    'quiz.printMore': 'Print more!',
  },
  ja: {
    // Japanese PDF text is kana only (hiragana and katakana, no kanji), so it reads
    // the same for young children as for anyone else.
    'hdr.name': 'なまえ: _________________________',
    'hdr.date': 'ひづけ: _______________',
    'hdr.teacher': 'せんせい: {name}',
    'hdr.class': 'クラス: _______________',

    'practice.defaultHira': 'ひらがなのかきかたれんしゅう',
    'practice.defaultKata': 'カタカナのかきかたれんしゅう',
    'practice.sample': ' - みほんのこたえ',
    'practice.writeWord': 'このことばをかきましょう:',
    'practice.writeFit': 'あうことばをかきましょう:',
    'practice.answer': 'みほんのこたえ:',
    'practice.footer': 'Ys Learning Lab - かきかたれんしゅう',

    'match.default': 'かなマッチング',
    'match.keySuffix': ' - こたえ',
    'match.hira': 'ひらがな',
    'match.kata': 'カタカナ',
    'match.romaji': 'ローマじ',
    'match.intro': 'ひだりのはこから、みぎのあうはこへ、せんをひきましょう。あわないもじがあるときは、となりにほんとうのこたえをかきましょう。',
    'match.keyNote': 'Xがついたはこは、あうあいてがいません。となりに、ほんとうのこたえがかいてあります。',
    'match.footer': 'Ys Learning Lab - かなマッチング',

    'quiz.default': 'かなれんしゅうテスト',
    'quiz.title.k2h': 'カタカナ → ひらがな れんしゅう',
    'quiz.title.h2k': 'ひらがな → カタカナ れんしゅう',
    'quiz.title.mixed': 'ひらがな & カタカナ ミックス',
    'quiz.write.k2h': 'したに、ひらがなでかきましょう。',
    'quiz.write.h2k': 'したに、カタカナでかきましょう。',
    'quiz.write.mixed': 'したに、もうひとつのかなでかきましょう。',
    'quiz.name': 'なまえ: _________________',
    'quiz.code': 'コード: {code}',
    'quiz.docKey': 'こたえ',
    'quiz.docSheet': 'れんしゅうシート',
    'quiz.page': '{n} / {total} ページ',
    'quiz.footer': 'Ys Learning Lab - {doc} - {page}',
    'quiz.printMore': 'Print more!',
  },
};

function pdfText(lang, key, vars) {
  const table = PDF_TEXT[lang === 'ja' ? 'ja' : 'en'];
  const text = Object.prototype.hasOwnProperty.call(table, key) ? table[key] : PDF_TEXT.en[key];
  return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m)) : text;
}

// A worksheet title left blank, or at one of the built-in English defaults, follows
// the PDF language; a title the user typed is printed as typed. `defaultKey` is the
// default for the current setting; `otherDefaultKeys` are other defaults that count
// as "untouched" (e.g. the Hiragana default while Katakana is selected).
function pdfTitle(lang, rawTitle, defaultKey, otherDefaultKeys = []) {
  const typed = (rawTitle || '').trim();
  const untouched = [defaultKey, ...otherDefaultKeys].map((k) => PDF_TEXT.en[k]);
  return !typed || untouched.includes(typed) ? pdfText(lang, defaultKey) : typed;
}

// Helvetica can't encode Japanese, and the Japanese font is only needed for it.
function pdfFontFor(fonts, text) {
  return /^[\x20-\x7e]*$/.test(text) ? fonts.helvetica : fonts.notoSansJP;
}

// Splits text into lines no wider than maxWidth. Breaks at spaces for English and
// between any two characters for Japanese (which has no spaces).
function pdfWrap(text, font, size, maxWidth) {
  const spaced = text.includes(' ') && /^[ -~]*$/.test(text);
  const tokens = spaced ? text.split(' ') : Array.from(text);
  const joiner = spaced ? ' ' : '';
  const lines = [];
  let line = '';
  for (const token of tokens) {
    const next = line ? line + joiner + token : token;
    if (line && font.widthOfTextAtSize(next, size) > maxWidth) {
      lines.push(line);
      line = token;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// "PDF language" dropdown: starts on the page's own language (so ?lang=ja gives a
// Japanese PDF by default) and keeps following it until the user picks one.
function initPdfLangSelect() {
  const select = document.getElementById('pdf-lang');
  if (!select) return;
  let chosenByUser = false;
  select.addEventListener('change', () => { chosenByUser = true; });
  const follow = () => {
    if (!chosenByUser) select.value = window.I18N && I18N.getLang() === 'ja' ? 'ja' : 'en';
  };
  document.addEventListener('i18n:change', follow);
  follow();
}

function getPdfLang() {
  const select = document.getElementById('pdf-lang');
  return select && select.value === 'ja' ? 'ja' : 'en';
}
