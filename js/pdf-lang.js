// Text printed on the generated PDFs, in English, Japanese or Simplified Chinese, plus the "PDF language"
// dropdown that picks between them. Shared by the three Japanese tools.
//
// Every Japanese character used here must exist in assets/fonts/NotoSansJP-Regular.ttf,
// which is a pre-made subset (see README). When you add Japanese text below, rebuild
// the subset from this file's strings - a missing glyph prints as a blank box.
// The Japanese PDF text is kana only (hiragana and katakana, no kanji), with ASCII
// punctuation (": ", "!").
//
// Chinese PDFs are drawn with assets/fonts/NotoSansSC-Regular.ttf instead (a subset that
// also holds every kana the worksheets draw). Every Chinese character in PDF_TEXT.zh must
// be in that subset too; see the README for how both subsets are rebuilt.

const PDF_TEXT = {
  en: {
    'hdr.name': 'Name: _________________________',
    'hdr.date': 'Date: _______________',
    'hdr.teacher': 'Teacher: {name}',
    'hdr.class': 'Class: _______________',

    'practice.defaultHira': 'Hiragana Writing Practice',
    'practice.defaultKata': 'Katakana Writing Practice',
    'practice.defaultKana': 'Kana Writing Practice',
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

    'words.default': 'Kana Word Builder',
    'words.keySuffix': ' - Answer Key',
    'words.intro': 'Use the kana to build words. Each kana can be used once in a word. Write each word in a column of boxes, one letter in each box, from top to bottom. Each letter is worth 1 point, so write the number of letters in the small box under the word: 2 letters is 2 points, 3 letters is 3 points. Add all your points for a total score.',
    'words.keyNote': 'Words from the Learning Lab word list that these kana can make, with their points. Words that use small kana, ー or dakuon, and words in katakana, are included. Any other real word the kana can make is good too.',
    'words.free': 'Small kana (ゃ ゅ ょ っ), ー and dakuon (が ば ぱ) can also be used to create words. For example, if your set has か, you can use が. Katakana is fine too.',
    'words.keyList': 'Words from the list',
    'words.puzzle': 'Puzzle {n}',
    'words.pts': 'Points',
    'words.total': 'Total score:',
    'words.footer': 'Powered by Ys Learning Lab - KANA WORD BUILDER',

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
    'practice.defaultKana': 'かなのかきかたれんしゅう',
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

    'words.default': 'かなことばづくり',
    'words.keySuffix': ' - こたえ',
    'words.intro': 'かなをつかって、ことばをつくりましょう。1つのことばに、おなじかなは1かいだけつかえます。ことばは、はこのたてのれつに、1もじを1はこに、うえからしたへかきます。1もじが1てんなので、ことばのしたのちいさなはこに、もじのかずをかきましょう。2もじなら2てん、3もじなら3てんです。ぜんぶのてんすうをたすと、ごうけいてんになります。',
    'words.keyNote': 'このかなでつくれることばのれいと、そのてんすうです。ちいさいかなや「ー」、だくおんをつかうことばと、カタカナのことばもはいっています。ほかにも、ほんとうにあることばなら、つくってかまいません。',
    'words.free': 'ちいさい「ゃ ゅ ょ っ」、「ー」、だくおん（が ば ぱ）も、ことばをつくるのにつかえます。たとえば、セットに「か」があれば、「が」もつかえます。カタカナもつかえます。',
    'words.keyList': 'ことばのれい',
    'words.puzzle': 'もんだい {n}',
    'words.pts': 'てん',
    'words.total': 'ごうけいてん:',
    'words.footer': 'Ys Learning Lab - かなことばづくり',

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
  zh: {
    // Simplified Chinese PDF text. Drawn with assets/fonts/NotoSansSC-Regular.ttf (see the
    // header note), so every Chinese character used here must be in that subset.
    'hdr.name': '姓名：_________________________',
    'hdr.date': '日期：_______________',
    'hdr.teacher': '老师：{name}',
    'hdr.class': '班级：_______________',

    'practice.defaultHira': '平假名书写练习',
    'practice.defaultKata': '片假名书写练习',
    'practice.defaultKana': '假名书写练习',
    'practice.sample': ' - 参考答案',
    'practice.writeWord': '请写出这个词：',
    'practice.writeFit': '请写出合适的词：',
    'practice.answer': '参考答案：',
    'practice.footer': 'Ys Learning Lab - 书写练习',

    'match.default': '假名配对',
    'match.keySuffix': ' - 答案',
    'match.hira': '平假名',
    'match.kata': '片假名',
    'match.romaji': '罗马字',
    'match.form.h-k': '平假名写成片假名，或片假名写成平假名',
    'match.form.h-r': '平假名写成罗马字，或罗马字写成平假名',
    'match.form.k-r': '片假名写成罗马字，或罗马字写成片假名',
    'match.intro': '从左边的每个方框向右边与之对应的方框画一条线。有些方框可能没有对应项。如果发现，请把它圈出来，并在旁边写出另一种写法（{form}）。',
    'match.keyNote': '标有 X 的方框没有对应项，旁边写着转换后的假名。',
    'match.footer': 'Ys Learning Lab - 假名配对',

    'words.default': '假名拼词游戏',
    'words.keySuffix': ' - 答案',
    'words.intro': '用这些假名拼词。在一个词里，每个假名只能用一次。把每个词竖着写在一列方框里，一格写一个字，从上往下写。每个字算 1 分，所以请在词下面的小方框里写上字数：2 个字就是 2 分，3 个字就是 3 分。把所有分数加起来，就是总分。',
    'words.keyNote': '这些假名能拼出的学习词表中的词及其分数，包括用到小写假名、ー或浊音的词，以及片假名词。这些假名能拼出的其他真实存在的词也都算对。',
    'words.free': '小写假名（ゃ ゅ ょ っ）、ー和浊音（が ば ぱ）也可以用来拼词。例如，组里有か，就可以用が。写成片假名也可以。',
    'words.keyList': '词表中的词',
    'words.puzzle': '第 {n} 题',
    'words.pts': '分数',
    'words.total': '总分：',
    'words.footer': 'Ys Learning Lab - 假名拼词游戏',

    'quiz.default': '假名练习测验',
    'quiz.title.k2h': '片假名 → 平假名 练习',
    'quiz.title.h2k': '平假名 → 片假名 练习',
    'quiz.title.mixed': '平假名 & 片假名 混合',
    'quiz.write.k2h': '请在下面写出对应的平假名。',
    'quiz.write.h2k': '请在下面写出对应的片假名。',
    'quiz.write.mixed': '请在下面写出另一种对应的假名。',
    'quiz.name': '姓名：_________________',
    'quiz.code': '编号：{code}',
    'quiz.docKey': '答案',
    'quiz.docSheet': '练习纸',
    'quiz.page': '第 {n} 页，共 {total} 页',
    'quiz.footer': 'Ys Learning Lab - {doc} - {page}',
    'quiz.printMore': '多打印几份！',
  },
};

function pdfText(lang, key, vars) {
  const table = PDF_TEXT[lang === 'ja' || lang === 'zh' ? lang : 'en'];
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

// Helvetica can't encode Japanese or Chinese. `fonts.notoSansJP` is the non-Latin font:
// the Japanese subset normally, the Simplified Chinese subset when the PDF is Chinese.
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
    // A CJK closing mark (，。、 etc.) never starts a line; it stays on the end of this one.
    const closing = !spaced && '，。、；：！？）」』'.includes(token);
    if (line && !closing && font.widthOfTextAtSize(next, size) > maxWidth) {
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
    if (!chosenByUser) select.value = window.I18N && I18N.getLang() === 'zh' ? 'zh' : I18N.getLang() === 'ja' ? 'ja' : 'en';
  };
  document.addEventListener('i18n:change', follow);
  follow();
}

function getPdfLang() {
  const select = document.getElementById('pdf-lang');
  return select && (select.value === 'ja' || select.value === 'zh') ? select.value : 'en';
}
