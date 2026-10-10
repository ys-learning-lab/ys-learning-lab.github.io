// Shared "can this spell something inappropriate?" check for the kana worksheets.
//
// Kana are placed at random (quiz grids, matching columns) or typed by the teacher
// (writing-practice words), so nothing stops a run of kana from reading as an insult,
// a slur or a crude word. Everything here is compared in hiragana: katakana is folded
// to hiragana and the long-vowel mark is dropped, because they read the same.
//
// This is a curated list of clearly inappropriate words for a classroom handout, not
// general profanity filtering. Add to it freely; keep entries in hiragana. Two-kana
// entries are only matched as whole words in the practice-word check (so はげしい is
// fine) but are matched anywhere in a grid or column, where neighbours are random.
// Encoded on purpose: the list is plain data for the filter only. Keeping it out of the
// page text means it can never be read as page content (ads, search indexing, screenshots).
// To edit: decode, change, re-encode - see README, "Kana safety list". Plain copy is kept
// outside this repository.
const KANA_BLOCKED_WORDS = (() => {
  const bin = atob('44GX44GtCuOBl+OCk+OBmOOBvuOBiArjgY/jgZ/jgbDjgowK44GT44KN44GZCuOBk+OCjeOBmwrjgbDjgYsK44Gw44GL44KE44KN44GGCuOBguOBuwrjgYLjgbvjgpPjgaDjgokK44G844GRCuOBvuOBrOOBkQrjgY/jgZ0K44GP44GaCuOBtuOBmQrjgbbjgZXjgYTjgY8K44Gn44G2CuOBr+OBkgrjgY3jgoLjgYQK44GN44GX44KH44GECuOBhuOBluOBhArjgaHjgY/jgZfjgofjgYYK44G744KCCuOBiuOBi+OBvgrjgY3jgaHjgYzjgYQK44GL44Gf44KPCuOCgeOBj+OCiQrjgaTjgpPjgbwK44GG44KT44GTCuOBhuOCk+OBoQrjgYrjgZfjgaPjgZMK44GX44KH44KT44G544KTCuOBoeOCk+OBkwrjgaHjgpPjgb0K44Gh44KT44Gh44KTCuOBvuOCk+OBkwrjgYrjgb7jgpPjgZMK44GK44Gj44Gx44GECuOBoeOBj+OBswrjgY3jgpPjgZ/jgb4K44G844Gj44GNCuOBkeOBpOOBguOBqgrjgZvjgaPjgY/jgZkK44GI44Gj44GhCuOBiOOCjQrjgYrjgarjgasK44KE44KK44G+44KTCuOChOOCiuOBoeOCkwrjgbXjgYfjgokK44G144GB44Gj44GPCuOBoeOBi+OCkwrjgZTjgYbjgYvjgpMK44KM44GE44G3CuOCjeOCiuOBk+OCkwrjgbHjgYTjgZrjgooK44Gq44GL44Gg44GXCuOBtuOBo+OBi+OBkQrjgZXjgaTjgZjjgpMK44GY44GV44GkCuOBlOOBhuOCguOCkwrjgb7jgoTjgY8K44GS44GECuOCjOOBmgrjgozjgZrjgbPjgYLjgpMK44G644Gr44GZCuOBuuOBq+OBg+OBmQrjgo/jgY7jgaoK44Gw44GO44GqCuOBsOOBmOOBqgrjgYLjgarjgosK44G344Gj44GX44O8CuOBs+OBo+OBoQrjgafjgYPjgovjgakK44G944KL44GuCuOBguOBoOOCi+OBqArjgbXjgZ/jgarjgooK44GW44O844KB44KTCuOBm+OBhOOBiOOBjQrjgaHjgpPjgYvjgZkK44G+44KT44GL44GZCuOBj+OCk+OBqwrjgb7jgZnjgZ/jgbkK44GK44Gq44G7CuOBl+OBk+OBl+OBkwrjgYTjgpPjgonjgpMK44GE44KT44KC44GGCuOBseOBhOOBseOCkwrjgbDjgYTjgZfjgoXjgpMK44Gh44GY44KHCuOBjeOCk+OBn+OBvuOBj+OCkwrjgZPjgo3jgZfjgaYK44GU44G/44GP44GaCuOBj+OBn+OBsOOCiuOBnuOBk+OBquOBhArjgZjjgoPjgpPjgY3jg7wK44KE44GP44Gh44KF44GGCuOBlOOBj+OBpOOBtuOBlwrjgZnjgZHjgbkK44KA44Gj44Gk44KK44GZ44GR44G5CuOBiuOBi+OBvuOChOOCjeOBhgrjgZLjgYTjgoTjgo3jgYYK44Gv44KB44Gp44KKCuOBkOOCieOBs+OBggrjgbXjgYHjgaPjgYvjg7wK44GP44Gd44GM44GNCuOBj+OBneOChOOCjeOBhgrjgY/jgZ3jgbDjgbDjgYIK44GP44Gd44GY44GY44GECuOBvOOCk+OBj+OCiQrjgajjgpPjgb4K44GG44GZ44Gu44KNCuOBtuOBn+OChOOCjeOBhgrjgafjgbbjgZnjgY4K44Gy44KN44G944KTCuOBguOBuOOCkwrjgb7jgorjgbXjgYHjgaoK44GT44GL44GE44KTCuOBuOOCjeOBhOOCkwrjgYvjgY/jgZvjgYTjgZbjgYQK44GV44Gk44GM44GECuOBq+OBkOOCjQrjgZbjgYTjgavjgaEK44G444KT44Gf44GECuOBl+OCg+OBtgrjgZvjgYTjgY0K44GP44KN44KT44G8CuOBoeOCg+OCk+OBk+OCjQrjgaHjgofjgpPjgZPjgYYK44GX44Gq44Gh44GPCuOBmOOCg+OBo+OBtwrjgaHjgoPjgYTjgarjgb7jgpMK44GV44KT44GU44GP44GY44KTCuOBtuOCieOBj+OBv+OCkwrjgYjjgZ/jgbLjgavjgpMK44GM44GE44GYCuOBjeOBhOOCjeOBhOOBleOCiwrjgZfjgarjgZjjgpMK44GC44GE44Gu44GTCuOBkeOBqOOBhgrjgYLjgoHjgZPjgYYK44KN44GZ44GRCuOBsOOCk+OBmOOCkw==');
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return new TextDecoder('utf-8').decode(bytes).split(String.fromCharCode(10)).filter(Boolean);
})();

// Hiragana, NFKC-normalised, long-vowel marks and spaces removed.
function kanaFold(text) {
  const norm = String(text == null ? '' : text).normalize('NFKC');
  let out = '';
  for (const ch of norm) {
    const code = ch.codePointAt(0);
    if (ch === 'ー' || /\s/.test(ch)) continue;
    out += code >= 0x30A1 && code <= 0x30F6 ? String.fromCodePoint(code - 0x60) : ch;
  }
  return out;
}

// For a run of kana that sits together (a grid line, a matching column): the blocked
// word it contains, or null.
function kanaFindBlocked(text) {
  const folded = kanaFold(text);
  return KANA_BLOCKED_WORDS.find((w) => folded.includes(w)) || null;
}

// For a single typed word (writing practice): the blocked word it is or contains, or
// null. Short (two-kana) entries only count when they are the whole word.
function kanaWordBlocked(word) {
  const folded = kanaFold(word);
  return KANA_BLOCKED_WORDS.find((w) => folded === w || (w.length >= 3 && folded.includes(w))) || null;
}
