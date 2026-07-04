/* 寵物對話資料庫 — 依動物種類 × 心情區間管理台詞。
   主程式透過 PetDialogueManager 取用，勿在 index.html 硬寫動物專屬台詞。 */
const PetDialogueManager = (() => {
  const MOOD_LOW = 30;
  const MOOD_COMFORT = 60;

  // 核心對話資料庫：未來可在這個 Map 中直接擴充其他 11 種動物
  const allPetDialogues = {
    // ==========================================
    // 【老虎專屬對話庫 (Tiger Unique Dialogues)】
    // ==========================================
    tiger: {
      low_mood: [ // moodValue < 30%（大哭發抖）
        '錢包在流淚，我也跟著發抖...',
        '主人... 我們是不是要吃土了... 😭😭',
        '這個月預算沒了，島嶼在下雨，我的心也在下雨...',
        '（肚子咕嚕叫）...主人，我們下半月是不是只能喝純水了？',
        '帳單像怪獸一樣撲過來了，哇啊啊！',
        '看到那個紅色的赤字，我嚇得尾巴都直了...',
        '不痛不痛...（摸口袋）...嗚嗚，摸不到私房錢了。',
        '島嶼在震動！那是預算崩塌的聲音嗎？😱',
      ],
      mid_mood: [ // moodValue 30% - 60%（沮喪嘆氣）
        '雖然超支了... 但主人陪我玩，心裡好過一點點了... 🥺',
        '唉，希望下一筆記帳是收入進來... 😮‍💨',
        '我們要開始省錢了喔，打勾勾！',
        '雖然數字是紅色的，但看到主人這麼努力陪我，我會撐住的！',
        '（拍拍胸口）剛剛差點哭出來，還好有主人摸摸我。',
        '下一筆記帳，我們可以偷偷記「收入」嗎？期待...',
        '預算雖然緊繃，但我們的感情不能緊繃！再陪我一下嘛～',
        '摸摸我的耳朵... 這樣我就有勇氣面對下一張發票了。',
      ],
      high_mood: [ // moodValue > 60%（晴天自由）
        '今天也乖乖記帳，最棒了！',
        '浮島的天氣真好～主人今天過得怎麼樣？',
        '看我跳得高高的！主人要繼續保持好習慣喔！',
        '今天的記帳任務達成了！我是不是天底下最聰明的記帳虎？',
        '看著預算滿滿的，心情就像飛上雲端一樣～',
        '主人今天花錢很有節制喔，給你一個大大的讚！👍',
        '（在草地上打滾）每一筆誠實的記帳，都是島嶼的養分！',
        '吼鳴～今天也是充滿理財智慧的一天！',
      ],
      high_platform: [ // 第二層高台：散步／跑步／看風景
        '看我跳得高高的！主人要繼續保持好習慣喔！',
        '上面的空氣真新鮮～',
        '這裡視野超好，整片浮島都在腳下！',
        '在高台上跑跑跑，心情也飛起來啦～',
        '主人快看！我站在雲端旁邊耶！☁️',
        '小小高台，大大成就感！',
      ],
    },

    // ==========================================
    // 【未來擴充區】在此處留白，以便後續新增其他 11 種動物
    // ==========================================
    // dragon: { low_mood: [...], mid_mood: [...], high_mood: [...] },
    // rabbit: { low_mood: [...], mid_mood: [...], high_mood: [...] },
  };

  function moodTier(moodValue) {
    if (moodValue < MOOD_LOW) return 'low_mood';
    if (moodValue <= MOOD_COMFORT) return 'mid_mood';
    return 'high_mood';
  }

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  return {
    MOOD_LOW,
    MOOD_COMFORT,
    allPetDialogues,
    hasDialogues(petType) {
      const pack = allPetDialogues[petType];
      return !!(pack && pack.low_mood && pack.mid_mood && pack.high_mood);
    },
    /** 依動物類型與心情值，隨機取得一句台詞；找不到動物時以老虎為預設 */
    getRandomDialogue(petType, moodValue) {
      const pack = allPetDialogues[petType] || allPetDialogues.tiger;
      const tier = moodTier(moodValue);
      const pool = pack[tier] || pack.high_mood;
      return pick(pool);
    },
    /** 指定心情區間（low_mood | mid_mood | high_mood） */
    getDialogueByTier(petType, tier) {
      const pack = allPetDialogues[petType] || allPetDialogues.tiger;
      const pool = pack[tier] || pack.high_mood;
      return pick(pool);
    },
    /** 高台專屬台詞（無 high_platform 時回退 high_mood） */
    getPlatformDialogue(petType) {
      const pack = allPetDialogues[petType] || allPetDialogues.tiger;
      const pool = pack.high_platform || pack.high_mood;
      return pick(pool);
    },
  };
})();
