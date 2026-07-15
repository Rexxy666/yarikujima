/* =========================================================================
 * SoundManager — 8-bit 復古音效管理器
 * 純 Web Audio API 即時合成，不載入任何外部音檔。
 *
 * 用法：
 *   SoundManager.play('success');  // 記帳成功（上揚雙音符）
 *   SoundManager.play('delete');   // 刪除／消去（音調下滑）
 *   SoundManager.play('click');    // 一般點擊／寵物嗶嗶講話（短促音）
 *   SoundManager.play('error');    // 錯誤／警告（低沉嘟嘟聲）
 *
 * 其他 API：
 *   SoundManager.setVolume(0.2);   // 調整主音量（0~1）
 *   SoundManager.mute();           // 靜音
 *   SoundManager.unmute();         // 解除靜音
 *   SoundManager.toggle();         // 切換靜音，回傳目前是否開啟
 *   SoundManager.isEnabled();      // 目前是否開啟
 *   SoundManager.register('coin', api => api.tone({type:'square', f0:988, dur:0.08}));
 *   SoundManager.tone({...});      // 直接排一顆音（進階／自訂用）
 * ========================================================================= */
(function (global) {
  'use strict';

  var ctx = null;         // AudioContext（延遲建立）
  var master = null;      // 主音量 GainNode
  var unlocked = false;   // 是否已被使用者手勢解鎖
  var enabled = true;     // 總開關（靜音）
  var volume = 0.1;       // 預設音量偏小，避免過大

  /* ---- 建立 / 取得 AudioContext ---- */
  function ensureContext() {
    if (ctx) return ctx;
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return null; // 瀏覽器不支援時安靜失敗，不影響其他功能
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = volume;
    master.connect(ctx.destination);
    return ctx;
  }

  /* ---- 解鎖音訊環境（需在使用者手勢中呼叫）---- */
  function unlock() {
    ensureContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    // 播一段極短無聲 buffer，徹底解鎖 iOS Safari
    try {
      var buf = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.connect(ctx.destination);
      src.start(0);
    } catch (e) {}
    unlocked = true;
  }

  /* ---- 第一次任何互動即自動解鎖，之後移除監聽 ---- */
  function bindAutoUnlock() {
    if (!global || typeof global.addEventListener !== 'function') return;
    var events = ['pointerdown', 'mousedown', 'touchstart', 'keydown'];
    function handler() {
      unlock();
      events.forEach(function (ev) {
        global.removeEventListener(ev, handler, true);
      });
    }
    events.forEach(function (ev) {
      global.addEventListener(ev, handler, true);
    });
  }

  /* ---- 核心：排程一顆 8-bit 音（方波為主）----
   * def: {
   *   type:  'square' | 'triangle' | 'sawtooth' | 'sine'  (預設 square)
   *   f0:    起始頻率(Hz)
   *   f1:    結束頻率(Hz，做滑音時使用；省略則固定音高)
   *   slide: 'exp' | 'lin'   (滑音方式，預設 exp)
   *   dur:   長度(秒)
   *   gain:  音量峰值 0~1 (預設 0.8)
   *   when:  相對於現在的延遲(秒，預設 0，用來排出連續音符)
   * }
   */
  function tone(def) {
    ensureContext();
    if (!ctx || !enabled) return;
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }

    var start = ctx.currentTime + (def.when || 0);
    var dur = def.dur || 0.1;
    var peak = def.gain == null ? 0.8 : def.gain;
    var atk = def.attack == null ? 0.008 : def.attack; // 起音時間，越短越清脆

    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = def.type || 'square';

    osc.frequency.setValueAtTime(def.f0, start);
    if (def.f1 != null) {
      if (def.slide === 'lin') {
        osc.frequency.linearRampToValueAtTime(def.f1, start + dur);
      } else {
        // 指數滑音頻率不可為 0
        osc.frequency.exponentialRampToValueAtTime(Math.max(1, def.f1), start + dur);
      }
    }

    // 音量包絡：快速起音 + 指數衰減，做出乾淨俐落的晶片音
    g.gain.setValueAtTime(0.0001, start);
    g.gain.exponentialRampToValueAtTime(peak, start + atk);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    osc.connect(g);
    g.connect(master);
    osc.start(start);
    osc.stop(start + dur + 0.02);

    // 播完自動斷開，避免節點堆積
    osc.onended = function () {
      try { osc.disconnect(); g.disconnect(); } catch (e) {}
    };
  }

  /* ---- 內建音效庫 ---- */
  var LIB = {
    // 一般點擊：清脆短促的「嗒」聲（三角波主體 + 高頻 sine 亮點，快起快收）
    click: function () {
      tone({ type: 'triangle', f0: 2100, f1: 1300, slide: 'exp', dur: 0.038, gain: 0.5, attack: 0.001 });
      tone({ type: 'sine',     f0: 3200,             dur: 0.022, gain: 0.22, attack: 0.001 }); // 一點點高頻亮點增加清脆感
    },
    // 記帳成功：上揚雙音符（Do → 高音 So 感）
    success: function () {
      tone({ type: 'square', f0: 660, dur: 0.10, gain: 0.7, when: 0.00 });
      tone({ type: 'square', f0: 988, dur: 0.16, gain: 0.7, when: 0.11 });
    },
    // 刪除／消去：音調下滑
    delete: function () {
      tone({ type: 'square', f0: 660, f1: 150, slide: 'exp', dur: 0.22, gain: 0.6 });
    },
    // 錯誤／警告：低沉嘟嘟兩聲
    error: function () {
      tone({ type: 'square', f0: 160, dur: 0.14, gain: 0.75, when: 0.00 });
      tone({ type: 'square', f0: 120, dur: 0.20, gain: 0.75, when: 0.16 });
    }
  };

  /* ---- 對外 API ---- */
  var SoundManager = {
    /** 播放音效；未知名稱安靜略過 */
    play: function (name) {
      if (!enabled) return;
      var fn = LIB[name];
      if (typeof fn !== 'function') {
        if (global.console) console.warn('[SoundManager] 未知音效：' + name);
        return;
      }
      ensureContext();
      if (ctx && ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
      fn();
    },

    /** 註冊自訂音效：builder 收到 { tone } 可自由排音 */
    register: function (name, builder) {
      if (typeof builder !== 'function') return;
      LIB[name] = function () { builder({ tone: tone }); };
    },

    /** 直接排一顆音（進階用） */
    tone: tone,

    /** 手動解鎖（通常不需要，會自動處理） */
    unlock: unlock,

    /** 設定主音量 0~1 */
    setVolume: function (v) {
      volume = Math.max(0, Math.min(1, Number(v) || 0));
      if (master) master.gain.value = volume;
      return volume;
    },
    getVolume: function () { return volume; },

    mute: function () { enabled = false; },
    unmute: function () { enabled = true; },
    /** 切換開關；可傳 true/false 指定，回傳目前狀態 */
    toggle: function (force) {
      enabled = (force == null) ? !enabled : !!force;
      return enabled;
    },
    isEnabled: function () { return enabled; }
  };

  // 載入即掛上自動解鎖監聽
  bindAutoUnlock();

  // 匯出：全域物件 + （若有模組系統）module.exports
  global.SoundManager = SoundManager;
  if (typeof module !== 'undefined' && module.exports) module.exports = SoundManager;

})(typeof window !== 'undefined' ? window : this);
