// Plays the sound of one kana. Items are [hiragana, katakana, romaji] rows from MATCH_ROWS.
// The 46 basic kana have recorded clips in audio/kana/<romaji>.wav. Any other kana (voiced and
// semi-voiced ones) falls back to the browser's Japanese voice when it has one.

const KanaSound = (() => {
  const CLIPS = new Set(('a i u e o ka ki ku ke ko sa shi su se so ta chi tsu te to na ni nu ne no '
    + 'ha hi fu he ho ma mi mu me mo ya yu yo ra ri ru re ro wa wo n').split(' '));
  const cache = {};
  let current = null;

  const canSpeak = () => typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';

  function speak(text) {
    if (!canSpeak()) return;
    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch (e) { /* no voice available: stay silent */ }
  }

  function stop() {
    if (current) { current.pause(); current = null; }
    if (canSpeak()) speechSynthesis.cancel();
  }

  return {
    // Whether pressing play can make a sound for this kana.
    canPlay(item) { return CLIPS.has(item[2]) || canSpeak(); },
    play(item) {
      stop();
      if (!CLIPS.has(item[2])) { speak(item[0]); return; }
      const a = cache[item[2]] || (cache[item[2]] = new Audio(`audio/kana/${item[2]}.wav`));
      a.currentTime = 0;
      current = a;
      a.play().catch(() => speak(item[0]));
    },
  };
})();
