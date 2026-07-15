/* =========================================================================
 * BgMusic — 8-bit 輕快背景音樂（純 Web Audio 即時合成，不載入外部音檔）
 *
 * 一段循環的 I–V–vi–IV 明亮和弦進行（C → G → Am → F），
 * 方波旋律 + 三角波低音，音量偏小、staccato，適合當記帳遊戲 BGM。
 *
 * 用法：
 *   BgMusic.start();          // 開始播放（需在使用者手勢中呼叫才不會被瀏覽器擋）
 *   BgMusic.stop();           // 停止
 *   BgMusic.toggle();         // 切換，回傳是否正在播放
 *   BgMusic.isPlaying();      // 是否播放中
 *   BgMusic.setVolume(0.12);  // 調整音量 0~1（預設 0.09）
 * ========================================================================= */
(function (global) {
  'use strict';

  var ctx = null, master = null;
  var playing = false, timer = null;
  var volume = 0.09;

  var BPM = 138;
  var stepDur = (60 / BPM) / 2;   // 八分音符為一個 step
  var LOOKAHEAD = 0.10;           // 提前排程秒數
  var TICK = 25;                  // 排程器輪詢間隔(ms)
  var step = 0, nextTime = 0;

  /* 旋律（八分音符，32 步＝4 小節）：I–V–vi–IV 明亮進行 */
  var MEL = [
    'G4','E4','G4','C5','E5','C5','G4','E4',   // C
    'D4','G4','B4','D5','G5','D5','B4','G4',   // G
    'A4','C5','E5','A5','E5','C5','A4','E4',   // Am
    'F4','A4','C5','F5','A5','F5','C5','A4'    // F
  ];
  /* 低音（四分音符，落在偶數 step；root/fifth 交替）*/
  var BASS = new Array(32).fill('');
  (function (b) {
    b[0]='C3';  b[2]='G2';  b[4]='C3';  b[6]='G2';   // C
    b[8]='G2';  b[10]='D3'; b[12]='G2'; b[14]='D3';  // G
    b[16]='A2'; b[18]='E3'; b[20]='A2'; b[22]='E3';  // Am
    b[24]='F2'; b[26]='C3'; b[28]='F2'; b[30]='C3';  // F
  })(BASS);

  /* 音名 → 頻率（以 A4=440 為基準）*/
  var NOTE_IDX = { 'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11 };
  function freq(name) {
    var m = /^([A-G]#?)(\d)$/.exec(name);
    if (!m) return 0;
    var semis = NOTE_IDX[m[1]] + (parseInt(m[2], 10) - 4) * 12 - 9; // 相對 A4
    return 440 * Math.pow(2, semis / 12);
  }

  function ensure() {
    if (ctx) return;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
  }

  /* 排一個音符：快速起音 + 指數衰減，做出乾淨的晶片音 */
  function voice(f, start, dur, type, peak) {
    if (!f) return;
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(f, start);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    osc.connect(g); g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);
    osc.onended = function () { try { osc.disconnect(); g.disconnect(); } catch (e) {} };
  }

  function scheduleStep(i, t) {
    var m = MEL[i];
    if (m) voice(freq(m), t, stepDur * 0.72, 'square', 0.42);   // 旋律
    var b = BASS[i];
    if (b) voice(freq(b), t, stepDur * 0.92, 'triangle', 0.55); // 低音
  }

  function scheduler() {
    if (!ctx) return;
    while (nextTime < ctx.currentTime + LOOKAHEAD) {
      scheduleStep(step, nextTime);
      nextTime += stepDur;
      step = (step + 1) % MEL.length;
    }
  }

  var BgMusic = {
    start: function () {
      ensure();
      if (!ctx || playing) return;
      if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      playing = true;
      step = 0;
      nextTime = ctx.currentTime + 0.06;
      if (master) master.gain.value = volume;
      timer = setInterval(scheduler, TICK);
    },
    stop: function () {
      playing = false;
      if (timer) { clearInterval(timer); timer = null; }
      // 讓已排程的尾音自然收掉
      if (master && ctx) {
        try {
          master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.05);
          setTimeout(function () { if (!playing && master) master.gain.value = 0.0001; }, 200);
        } catch (e) {}
      }
    },
    toggle: function () { if (playing) this.stop(); else this.start(); return playing; },
    isPlaying: function () { return playing; },
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master && playing) master.gain.value = volume;
      return volume;
    }
  };

  global.BgMusic = BgMusic;
  if (typeof module !== 'undefined' && module.exports) module.exports = BgMusic;

})(typeof window !== 'undefined' ? window : this);
