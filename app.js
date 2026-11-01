/* ==========================================================================
   AIペット クロちゃん🐾 対話エンジン＆システムロジック（app.js 完全版 v1.0.0）
   - バージョン 1.0.0 正式安定版
   - お話し中のリアルタイム可視化（声の波アニメーション ＆ リアルタイム文字起こし吹き出し）
   - ハイブリッド3段階マイク待機：通常会話80ms / ボタン450ms / 設定保存800ms（頭欠けゼロ＆自声エコー根絶）
   - 設定モーダル展開中の安全マイク保護 ＆ 操作音声のテキスト二重防壁フィルター
   - 一人称「クロ」「わたし」完全統一 ＆ 「余（あまり）」読み間違い根絶
   - 音声完全Blob化（メモリ一括取得再生）：短文・長文問わず途切れ・抜けを100%根絶
   - TimeProvider 日時提供エンジン（午前4時境界の生活リズム＆時計リアルタイム表示）
   - セリフの長さ（40〜80文字）を完全キープ ＆ VOICEVOX 音声・文字完全同期
   - 18時以降の夜の会話の自動取り込み ＆ 翌朝起動時の会話件数差分検知による自動補完システム
   - 日記リソースの選定（おてつだい検索の機械的データ除外＆情緒的思い出への昇華）
   - 会話セリフのローカル永続復元 ＆ 画面表示クリア（内部データ安全保護）
   - 手動バックアップの日時付きファイル名（クロちゃんデータ_YYYYMMDD_HHmm.json）
   - 純粋な1日1ページ絵日記アルバム（写真解除・日記削除の誤操作防止警告つき）
   - 日記の「本文のみ」スラスラ滑らか朗読（カッコ・句読点のブレーキ解消）
   - オンデマンド高精度GPS（町名丁目ピンポイント回答＆至近距離スポット特定）
   - 散歩写真の超軽量圧縮＆Gemini 3.5 Flash Lite画像認識・写真付き絵日記連動
   - Gemini 3.5 Flash Lite 専用（gemini-3.8-flash 完全除外・禁止）
   ========================================================================== */

/* ==========================================================================
   ★ MODULE 0: 診断ロガー ＆ トースト通知システム
   ========================================================================== */
const Toast = {
  timer: null,
  show(message, type = 'success', duration = 3500) {
    const el = document.getElementById('toast-notification');
    const icon = document.getElementById('toast-icon');
    const msg = document.getElementById('toast-message');
    if (!el) return;

    if (this.timer) clearTimeout(this.timer);
    el.className = `is-show ${type}`;
    icon.textContent = type === 'success' ? '✅' : (type === 'error' ? '⚠️' : 'ℹ️');
    msg.textContent = message;

    el.onclick = () => { el.classList.remove('is-show'); };
    this.timer = setTimeout(() => { el.classList.remove('is-show'); }, duration);
  }
};

const Logger = {
  allLogs: [],
  log(message, type = 'info') {
    const panel = document.getElementById('diag-logs');
    const now = new Date();
    const timeStr = now.toTimeString().split(' ')[0] + '.' + String(now.getMilliseconds()).padStart(3, '0');
    const formatted = `[${timeStr}] ${message}`;
    this.allLogs.push(formatted);

    if (panel) {
      const row = document.createElement('div');
      row.className = `log-row log-${type}`;
      row.textContent = formatted;
      panel.appendChild(row);
      panel.scrollTop = panel.scrollHeight;
    }
    console.log(formatted);
  },
  getEvidenceText() {
    return this.allLogs.join('\n');
  }
};

/* ==========================================================================
   ★ MODULE 0.5: 日時・時間提供エンジン（TimeProvider - 午前4時生活リズム対応）
   ========================================================================== */
const TimeProvider = {
  getCurrentInfo() {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const date = now.getDate();
    const hours = now.getHours();
    const minutes = now.getMinutes();

    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const dayOfWeek = dayNames[now.getDay()];

    const pad = (n) => String(n).padStart(2, '0');
    const clock = `${pad(hours)}:${pad(minutes)}`;
    const logKey = `${year}-${pad(month)}-${pad(date)}`;
    const fullDate = `${year}年${month}月${date}日 (${dayOfWeek})`;

    // ★ 生活リズム判定（午前4:00境界線）
    const isLateNight = (hours < 4);
    let lifeDateObj = now;
    if (isLateNight) {
      lifeDateObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    }

    const lifeYear = lifeDateObj.getFullYear();
    const lifeMonth = lifeDateObj.getMonth() + 1;
    const lifeDate = lifeDateObj.getDate();
    const lifeDayOfWeek = dayNames[lifeDateObj.getDay()];
    const lifeLogKey = `${lifeYear}-${pad(lifeMonth)}-${pad(lifeDate)}`;
    const lifeFullDate = `${lifeYear}年${lifeMonth}月${lifeDate}日 (${lifeDayOfWeek})`;

    const spokenClock = `いまは、${hours}時${minutes === 0 ? 'ちょうど' : minutes + '分'}だニャン🐾`;
    const spokenDate = `きょうは、${year}年${month}月${date}日、${dayOfWeek}曜日だニャ！`;

    const clockDisplay = `いまは ${hours}時${pad(minutes)}分 だニャン🐾`;
    const dateDisplay = `きょうは ${month}月${date}日 (${dayOfWeek}曜日) だニャ！`;

    return {
      now,
      year,
      month,
      date,
      hours,
      minutes,
      dayOfWeek,
      clock,
      logKey,
      fullDate,
      spokenClock,
      spokenDate,
      clockDisplay,
      dateDisplay,
      isLateNight,
      lifeLogKey,
      lifeFullDate
    };
  }
};

/* ==========================================================================
   ★ MODULE 1: 音声合成＆音声認識（ハイブリッド待機 ＆ リアルタイム音声波形連動）
   ========================================================================== */
class AudioSpeechEngine {
  constructor() {
    this.masterAudio = new Audio();
    this.masterAudio.preload = "auto";
    this.fillerAudio = new Audio();
    this.fillerAudio.preload = "auto";
    this.isMasterUnlocked = false;
    this.silentWav = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";
    
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    this.audioCtx = AudioCtx ? new AudioCtx() : null;

    this.rate = parseFloat(localStorage.getItem('kuro_rate') || '1.05');
    this.isSpeaking = false;
    this.isListening = false;
    this.recognition = null;
    this.isSpeechCommitted = false;
    this.lastRecognizedText = '';
    this.silenceTimeout = null;
    this.watchdogInterval = null;

    this.fixedPhraseMap = new Map();
    this.blobUrlCache = new Map();
    this.recentSpokenTexts = [];
    this.lastSpeechEndTime = 0;
    this.lastVoicevoxRequestTime = 0;
    this.currentAbortController = null;

    this.isReadingAloud = false;
    this.readingAbortController = null;

    this.onInterimUpdate = null;
    this.onSpeechFinal = null;
    this.onListeningStatus = null;
    this.onBargeIn = null;

    this._setupRecognition();
    this._setupInteractionUnlock();
    this._startWatchdog();
  }

  setRate(r) {
    this.rate = r;
    localStorage.setItem('kuro_rate', r);
  }

  _getAudioContext() {
    if (this.audioCtx && this.audioCtx.state === 'suspended') {
      this.audioCtx.resume().catch(() => {});
    }
    return this.audioCtx;
  }

  unlockMasterAudio() {
    this._getAudioContext();
    if (this.isMasterUnlocked) return;
    this.masterAudio.src = this.silentWav;
    this.fillerAudio.src = this.silentWav;
    Promise.all([
      this.masterAudio.play().catch(() => {}),
      this.fillerAudio.play().catch(() => {})
    ]).then(() => {
      this.isMasterUnlocked = true;
      Logger.log("[Audio] オーディオ再生アンカー解放完了", "info");
    }).catch(() => {});
  }

  _setupInteractionUnlock() {
    const unlock = () => this.unlockMasterAudio();
    ['pointerdown', 'touchstart', 'click'].forEach(evt => {
      window.addEventListener(evt, unlock, { passive: true, once: true });
    });
  }

  playEffect(type) {
    const ctx = this._getAudioContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    if (type === 'poof') {
      const bufferSize = ctx.sampleRate * 0.35;
      const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const output = noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) output[i] = Math.random() * 2 - 1;
      const whiteNoise = ctx.createBufferSource();
      whiteNoise.buffer = noiseBuffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(800, now);
      filter.frequency.exponentialRampToValueAtTime(160, now + 0.32);
      filter.Q.setValueAtTime(2.5, now);

      const noiseGain = ctx.createGain();
      noiseGain.gain.setValueAtTime(0.45, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.34);

      whiteNoise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      const toneGain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(420, now);
      osc.frequency.exponentialRampToValueAtTime(140, now + 0.28);
      toneGain.gain.setValueAtTime(0.38, now);
      toneGain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);

      osc.connect(toneGain);
      toneGain.connect(ctx.destination);

      whiteNoise.start(now);
      whiteNoise.stop(now + 0.35);
      osc.start(now);
      osc.stop(now + 0.28);

    } else if (type === 'purr') {
      const oscBase = ctx.createOscillator();
      const oscSub = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const mainGain = ctx.createGain();
      const filter = ctx.createBiquadFilter();

      oscBase.type = 'triangle';
      oscBase.frequency.setValueAtTime(88, now);
      oscBase.frequency.linearRampToValueAtTime(105, now + 0.35);
      oscBase.frequency.linearRampToValueAtTime(84, now + 0.75);

      oscSub.type = 'sine';
      oscSub.frequency.setValueAtTime(176, now);
      oscSub.frequency.linearRampToValueAtTime(210, now + 0.35);
      oscSub.frequency.linearRampToValueAtTime(168, now + 0.75);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(260, now);

      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(25, now);
      lfoGain.gain.setValueAtTime(0.35, now);

      mainGain.gain.setValueAtTime(0, now);
      mainGain.gain.linearRampToValueAtTime(0.42, now + 0.12);
      mainGain.gain.linearRampToValueAtTime(0.35, now + 0.45);
      mainGain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);

      lfo.connect(mainGain.gain);
      oscBase.connect(filter);
      oscSub.connect(filter);
      filter.connect(mainGain);
      mainGain.connect(ctx.destination);

      lfo.start(now); lfo.stop(now + 0.85);
      oscBase.start(now); oscBase.stop(now + 0.85);
      oscSub.start(now); oscSub.stop(now + 0.85);

      if ('vibrate' in navigator) {
        try { navigator.vibrate([40, 50, 40, 50, 40]); } catch(e) {}
      }

    } else if (type === 'snack') {
      [0, 0.16, 0.32].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(450, now + delay);
        osc.frequency.exponentialRampToValueAtTime(220, now + delay + 0.12);
        gain.gain.setValueAtTime(0.32, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.01, now + delay + 0.12);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + delay); osc.stop(now + delay + 0.12);
      });

    } else if (type === 'bell') {
      [0, 0.25, 0.5].forEach(delay => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1320, now + delay);
        gain.gain.setValueAtTime(0.4, now + delay);
        gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.3);
        osc.connect(gain); gain.connect(ctx.destination);
        osc.start(now + delay); osc.stop(now + delay + 0.3);
      });

    } else if (type === 'idea') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.exponentialRampToValueAtTime(1760, now + 0.18);
      gain.gain.setValueAtTime(0.35, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.4);

    } else if (type === 'aizuchi') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(680, now);
      osc.frequency.exponentialRampToValueAtTime(920, now + 0.07);
      gain.gain.setValueAtTime(0.24, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.18);

    } else if (type === 'happy_meow') {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(580, now);
      osc.frequency.exponentialRampToValueAtTime(880, now + 0.12);
      osc.frequency.exponentialRampToValueAtTime(640, now + 0.42);
      gain.gain.setValueAtTime(0.28, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(now); osc.stop(now + 0.45);
    }
  }

  _convertAllNumbersToKana(text) {
    if (!text) return "";
    let t = text.replace(/[０-９]/g, s => String.fromCharCode(s.charCodeAt(0) - 0xFEE0));

    // ★ 万が一の「余」を「よ」へ強制読み替えガード
    t = t.replace(/余([はがものにもと])/g, 'よ$1').replace(/余/g, 'よ');

    t = t.replace(/(\d{4})\s*年/g, (m, yStr) => `${numToKana(parseInt(yStr, 10))}ねん`);

    const monthMap = {
      1: 'いちがつ', 2: 'にがつ', 3: 'さんがつ', 4: 'しがつ', 5: 'ごがつ', 6: 'ろくがつ',
      7: 'しちがつ', 8: 'はちがつ', 9: 'くがつ', 10: 'じゅうがつ', 11: 'じゅういちがつ', 12: 'じゅうにがつ'
    };
    t = t.replace(/(\d{1,2})\s*月/g, (m, mStr) => {
      const mNum = parseInt(mStr, 10);
      return monthMap[mNum] ? monthMap[mNum] : `${numToKana(mNum)}がつ`;
    });

    const dayMap = {
      1: 'ついたち', 2: 'ふつか', 3: 'みっか', 4: 'よっか', 5: 'いつか',
      6: 'むいか', 7: 'なのか', 8: 'ようか', 9: 'ここのか', 10: 'とおか',
      11: 'じゅういちにち', 12: 'じゅうににち', 13: 'じゅうさんにち', 14: 'じゅうよっか',
      15: 'じゅうごにち', 16: 'じゅうろくにち', 17: 'じゅうしちにち', 18: 'じゅうはちにち',
      19: 'じゅうくにち', 20: 'はつか', 21: 'にじゅういちにち', 22: 'にじゅうににち',
      23: 'にじゅうさんにち', 24: 'にじゅうよっか', 25: 'にじゅうごにち', 26: 'にじゅうろくにち',
      27: 'にじゅうしちにち', 28: 'にじゅうはちにち', 29: 'にじゅうくにち', 30: 'さんじゅうにち',
      31: 'さんじゅういちにち'
    };
    t = t.replace(/(\d{1,2})\s*日/g, (m, dStr) => {
      const dNum = parseInt(dStr, 10);
      return dayMap[dNum] ? dayMap[dNum] : `${numToKana(dNum)}にち`;
    });

    const hourUnit = (h) => {
      const map = {
        0: 'れいじ', 1: 'いちじ', 2: 'にじ', 3: 'さんじ', 4: 'よじ', 5: 'ごじ',
        6: 'ろくじ', 7: 'しちじ', 8: 'はちじ', 9: 'くじ', 10: 'じゅうじ',
        11: 'じゅういちじ', 12: 'じゅうにじ', 13: 'じゅうさんじ', 14: 'じゅうよじ',
        15: 'じゅうごじ', 16: 'じゅうろくじ', 17: 'じゅうしちじ', 18: 'じゅうはちじ',
        19: 'じゅうくじ', 20: 'にじゅうじ', 21: 'にじゅういちじ', 22: 'にじゅうにじ',
        23: 'にじゅうさんじ', 24: 'にじゅうよじ'
      };
      return map[h] || (numToKana(h) + 'じ');
    };

    const minuteUnit = (m) => {
      if (m === 0) return 'ぜろふん';
      const ones = ['', 'いっぷん', 'にふん', 'さんぷん', 'よんぷん', 'ごふん', 'ろっぷん', 'ななふん', 'はっぷん', 'きゅうふん', 'じゅっぷん'];
      if (m <= 10) return ones[m];
      const tens = Math.floor(m / 10);
      const rem = m % 10;
      const tensPrefix = (tens === 1 ? 'じゅう' : numToKana(tens) + 'じゅう');
      if (rem === 0) return tensPrefix + 'っぷん';
      return tensPrefix + ones[rem];
    };

    function numToKana(n) {
      if (n === 0) return 'ぜろ';
      const d = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
      const parse4 = (val) => {
        let res = '';
        const sen = Math.floor(val / 1000);
        if (sen === 1) res += 'せん';
        else if (sen === 3) res += 'さんぜん';
        else if (sen === 6) res += 'ろくせん';
        else if (sen === 8) res += 'はっせん';
        else if (sen > 1) res += d[sen] + 'せん';

        const hyaku = Math.floor((val % 1000) / 100);
        if (hyaku === 1) res += 'ひゃく';
        else if (hyaku === 3) res += 'さんびゃく';
        else if (hyaku === 6) res += 'ろっぴゃく';
        else if (hyaku === 8) res += 'はっぴゃく';
        else if (hyaku > 1) res += d[hyaku] + 'ひゃく';

        const juu = Math.floor((val % 100) / 10);
        if (juu === 1) res += 'じゅう';
        else if (juu > 1) res += d[juu] + 'じゅう';

        const ichi = val % 10;
        if (ichi > 0) res += d[ichi];
        return res;
      };

      if (n >= 10000) {
        const man = Math.floor(n / 10000);
        const rem = n % 10000;
        return (man === 1 ? 'いちまん' : parse4(man) + 'まん') + (rem > 0 ? parse4(rem) : '');
      }
      return parse4(n);
    }

    t = t.replace(/(\d{1,2}):(\d{1,2})/g, (m, hStr, mStr) => `${hourUnit(parseInt(hStr, 10))}${minuteUnit(parseInt(mStr, 10))}`);
    t = t.replace(/(\d{1,2})\s*時/g, (match, nStr) => hourUnit(parseInt(nStr, 10)));
    t = t.replace(/(\d{1,2})\s*分/g, (match, nStr) => minuteUnit(parseInt(nStr, 10)));
    t = t.replace(/マイナス\s*(\d+)/g, 'まいなす$1');
    t = t.replace(/-\s*(\d+)/g, 'まいなす$1');
    t = t.replace(/(\d+)\s*(?:度|℃|°C|°c|°)/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'ど');
    t = t.replace(/(\d+)\s*秒/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'びょう');
    t = t.replace(/(\d+)\s*円/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'えん');
    t = t.replace(/(\d+)\s*(?:キロ|km|kg)/gi, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'きろ');
    t = t.replace(/1\s*人/g, 'ひとり').replace(/2\s*人/g, 'ふたり').replace(/(\d+)\s*人/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'にん');
    t = t.replace(/1\s*匹/g, 'いっぴき').replace(/(\d+)\s*匹/g, (m, nStr) => numToKana(parseInt(nStr, 10)) + 'ひき');
    t = t.replace(/1\s*つ/g, 'ひとつ').replace(/2\s*つ/g, 'ふたつ').replace(/3\s*つ/g, 'みっつ');
    t = t.replace(/(\d+)\s*(?:歳|才)/g, (m, nStr) => (parseInt(nStr, 10) === 20 ? 'はたち' : numToKana(parseInt(nStr, 10)) + 'さい'));
    t = t.replace(/\d+/g, m => numToKana(parseInt(m, 10)));
    return t;
  }

  prefetchVoice(text, speakerId) {
    this._getVoicevoxBlobUrl(text, speakerId).then(blobUrl => {
      this.fixedPhraseMap.set(`${speakerId}_${text}`, blobUrl);
      Logger.log(`[定型肉声Blobキャッシュ完了] ${text}`, "info");
    }).catch(() => {});
  }

  preloadAllFillers(speakerId) {
    const fillers = [
      "そうニャね♪",
      "えーっとニャ…",
      "確認するニャ！",
      "ちょっと待ってニャ♪",
      "クロが調べるニャ！",
      "うんうん、聞いてるニャ♪",
      "おまかせニャ！",
      "あそぶニャ♪",
      "バッチリニャ！",
      "はーい！"
    ];
    fillers.forEach(f => this.prefetchVoice(f, speakerId));
  }

  async playImmediateFiller(type = 'general') {
    this.unlockMasterAudio();
    const speakerId = AppCore.getSpeakerId();
    let phrase = "そうニャね♪";

    if (type === 'location') {
      phrase = Math.random() > 0.5 ? "確認するニャ！" : "ちょっと待ってニャ♪";
    } else if (type === 'search') {
      phrase = "クロが調べるニャ！";
    } else if (type === 'think') {
      phrase = "えーっとニャ…";
    } else {
      const candidates = ["そうニャね♪", "うんうん、聞いてるニャ♪"];
      phrase = candidates[Math.floor(Math.random() * candidates.length)];
    }

    const key = `${speakerId}_${phrase}`;
    if (this.fixedPhraseMap.has(key)) {
      try {
        this.fillerAudio.src = this.fixedPhraseMap.get(key);
        this.fillerAudio.playbackRate = this.rate;
        await this.fillerAudio.play();
        if (AppCore.avatar) AppCore.avatar.setEmotion('talking');
        setTimeout(() => {
          if (!this.isSpeaking && AppCore.avatar) AppCore.avatar.setEmotion('thinking');
        }, 850);
      } catch(e) {}
    } else {
      this.playEffect('aizuchi');
    }
  }

  async _getVoicevoxBlobUrl(text, speakerId) {
    const key = `${speakerId}_${text}`;
    if (this.blobUrlCache.has(key)) {
      return this.blobUrlCache.get(key);
    }
    if (this.fixedPhraseMap.has(key)) {
      return this.fixedPhraseMap.get(key);
    }

    if (this.currentAbortController) {
      this.currentAbortController.abort();
    }
    this.currentAbortController = new AbortController();
    const signal = this.currentAbortController.signal;

    const now = Date.now();
    const elapsed = now - this.lastVoicevoxRequestTime;
    if (elapsed < 1500) {
      await new Promise(r => setTimeout(r, 1500 - elapsed));
    }
    this.lastVoicevoxRequestTime = Date.now();

    const rawVvKey = localStorage.getItem('kuro_voicevox_key') || '';
    const vvKey = rawVvKey.trim();

    let initUrl = `https://api.tts.quest/v3/voicevox/synthesis?text=${encodeURIComponent(text)}&speaker=${speakerId}`;
    if (vvKey) {
      initUrl += `&key=${encodeURIComponent(vvKey)}`;
    }

    const initRes = await fetch(initUrl, { signal });
    if (!initRes.ok) throw new Error(`HTTP初期エラー ${initRes.status}`);

    const initData = await initRes.json();
    if (initData.isAudioError) throw new Error("VOICEVOX側エラー");

    let directUrl = initData.mp3StreamingUrl || initData.mp3DownloadUrl;

    if (!directUrl && initData.audioStatusUrl) {
      const statusUrl = initData.audioStatusUrl;
      for (let i = 1; i <= 24; i++) {
        await new Promise(r => setTimeout(r, 450));
        if (signal.aborted) throw new Error("リクエスト中断");
        try {
          const sRes = await fetch(statusUrl, { signal });
          if (sRes.ok) {
            const sData = await sRes.json();
            if (sData.isAudioReady) {
              directUrl = sData.mp3StreamingUrl || sData.mp3DownloadUrl;
              break;
            }
          }
        } catch(e) {
          if (signal.aborted) throw e;
        }
      }
    }

    if (!directUrl) throw new Error("VOICEVOX生成タイムアウト");

    const audioRes = await fetch(directUrl, { signal });
    if (!audioRes.ok) throw new Error("音声データのダウンロードに失敗しました");
    const audioBlob = await audioRes.blob();
    const blobUrl = URL.createObjectURL(audioBlob);

    this.blobUrlCache.set(key, blobUrl);
    return blobUrl;
  }

  /* ★ 自声エコー＆操作ボタン音声（漢字揺れ・ひらがな揺れ）の鉄壁破棄判定 */
  _isSelfEcho(text) {
    if (!text) return true;
    const normalized = text.replace(/[\s、。！？ニャンニャ]/g, '');
    if (normalized.length < 2) return true;

    // ★ 操作用ひとことボイスの漢字揺れ・ひらがな揺れを完全ピンポイント破棄
    const actionPattern = /^(?:おまかせ|お任せ|任せ|まかせ|あそぶ|遊ぶ|あそぼ|遊ぼ|ばっちり|バッチリ|ぱっちり|パッチリ|はーい|はい|ハイ)(?:ニャ|ニャン|にゃ|にゃん)?$/;
    if (actionPattern.test(normalized)) {
      return true;
    }
    if (normalized.length <= 8 && /(?:お任せ|おまかせ|遊ぶ|あそぶ|バッチリ|ばっちり|はーい)/.test(normalized)) {
      return true;
    }

    const now = Date.now();
    const isVeryRecent = (now - this.lastSpeechEndTime) < 250;

    for (const spoken of this.recentSpokenTexts) {
      const normSpoken = spoken.replace(/[\s、。！？ニャンニャ]/g, '');
      if (normSpoken === normalized) return true;
      if (isVeryRecent && (normSpoken.includes(normalized) || normalized.includes(normSpoken))) return true;
    }
    return false;
  }

  /* ★ 発話処理（通常会話80ms / ボタン450ms / 設定保存800msのハイブリッド待機） */
  async speak(text, speakerIdOverride = null, onStart = null, onEnd = null, cooldownOverride = null) {
    this.stopSpeaking();
    this.stopListening();
    this.unlockMasterAudio();

    try {
      this.fillerAudio.pause();
      this.fillerAudio.currentTime = 0;
    } catch(e) {}

    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();
    // 通常会話は80ms、ボタン操作は450ms、設定保存は800ms
    const cooldownMs = (cooldownOverride !== null) ? cooldownOverride : 80;

    let clean = this._convertAllNumbersToKana(text)
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[（\(][^）\)]*?[）\)]/g, '')
      .replace(/```[\s\S]*?```/g, '')
      .replace(/<[^>]*>/g, '')
      .replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟📷]/gu, '')
      .replace(/^[、。,\.\s]+/, '')
      .trim();

    if (!clean) {
      if (onStart) onStart();
      if (onEnd) onEnd();
      setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, cooldownMs);
      return;
    }

    this.recentSpokenTexts.unshift(clean);
    if (this.recentSpokenTexts.length > 5) this.recentSpokenTexts.pop();

    let hasTriggeredStart = false;
    const triggerStartOnce = () => {
      if (!hasTriggeredStart) {
        hasTriggeredStart = true;
        this.isSpeaking = true;
        if (onStart) onStart();
      }
    };

    try {
      const blobAudioUrl = await this._getVoicevoxBlobUrl(clean, speakerId);
      this.masterAudio.src = blobAudioUrl;
      this.masterAudio.playbackRate = this.rate;

      await new Promise((resolve) => {
        let isResolved = false;
        const completeHandler = () => {
          if (!isResolved) {
            isResolved = true;
            this.masterAudio.removeEventListener('canplaythrough', completeHandler);
            this.masterAudio.removeEventListener('loadeddata', completeHandler);
            resolve();
          }
        };
        this.masterAudio.addEventListener('canplaythrough', completeHandler);
        this.masterAudio.addEventListener('loadeddata', completeHandler);
        setTimeout(completeHandler, 600);
      });

      this.masterAudio.onplaying = () => { triggerStartOnce(); };

      this.masterAudio.onended = () => {
        this.isSpeaking = false;
        this.lastSpeechEndTime = Date.now();
        if (onEnd) onEnd();

        // ★ シチュエーションごとの最適化された待機時間でマイク再開
        setTimeout(() => {
          if (AppCore.state.isRunning && !this.isSpeaking && !this.isReadingAloud && !AppCore.state.isThinking) {
            this.startListening();
          }
        }, cooldownMs);
      };

      this.masterAudio.onerror = () => {
        Logger.log("[Audio] VOICEVOX直接再生エラー", "error");
        this.isSpeaking = false;
        if (onStart) onStart();
        if (onEnd) onEnd();
        setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, cooldownMs);
      };

      await this.masterAudio.play();
    } catch (err) {
      Logger.log(`[VOICEVOX待機] ${err.message}`, "warn");
      this.isSpeaking = false;
      if (onStart) onStart();
      if (onEnd) onEnd();
      setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, cooldownMs);
    }
  }

  async readDiarySeamless(diaryContentOnly, speakerIdOverride = null, onSentenceStart = null, onComplete = null) {
    this.stopSpeaking();
    this.stopListening();
    this.unlockMasterAudio();

    this.isReadingAloud = true;
    this.readingAbortController = new AbortController();
    const speakerId = (speakerIdOverride !== null) ? speakerIdOverride : AppCore.getSpeakerId();

    let cleanFull = diaryContentOnly
      .replace(/[（\(][^）\)]*?[）\)]/g, '')
      .replace(/<!--[\s\S]*?-->/g, '')
      .replace(/[*#_~`🐾🐱✨❤️💖🎀🧠⚡🩺💭🎵🍜🥟📍📰🗺️⭐💥📒📖🌐🔷🔴🌤️🛍️💡🐟📷]/gu, '')
      .trim();

    const sentences = cleanFull
      .split(/([。！？!\?\n]+)/)
      .reduce((acc, cur, i, arr) => {
        if (i % 2 === 0 && cur.trim()) {
          const punct = arr[i + 1] || '';
          acc.push((cur + punct).trim());
        }
        return acc;
      }, [])
      .filter(s => s.length > 0);

    if (sentences.length === 0) {
      this.isReadingAloud = false;
      if (onComplete) onComplete();
      setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, 80);
      return;
    }

    Logger.log(`[本文朗読開始] 全 ${sentences.length} 文をBlobシームレス先読み再生`, "info");
    const audioBlobCache = new Map();

    const prefetchSentence = async (idx) => {
      if (idx >= sentences.length) return;
      const targetText = this._convertAllNumbersToKana(sentences[idx]).trim();
      if (!targetText || audioBlobCache.has(idx)) return;
      try {
        const url = await this._getVoicevoxBlobUrl(targetText, speakerId);
        audioBlobCache.set(idx, url);
      } catch(e) {}
    };

    prefetchSentence(0);
    if (sentences.length > 1) prefetchSentence(1);

    for (let i = 0; i < sentences.length; i++) {
      if (!this.isReadingAloud) break;

      if (i + 1 < sentences.length) prefetchSentence(i + 1);
      if (i + 2 < sentences.length) prefetchSentence(i + 2);

      const sentenceRaw = sentences[i];
      let clean = this._convertAllNumbersToKana(sentenceRaw).trim();
      if (!clean) continue;

      if (onSentenceStart) onSentenceStart(i, sentenceRaw);

      let blobUrl = audioBlobCache.get(i);
      if (!blobUrl) {
        try {
          blobUrl = await this._getVoicevoxBlobUrl(clean, speakerId);
        } catch(e) {
          continue;
        }
      }

      if (!this.isReadingAloud) break;

      await new Promise((resolve) => {
        this.masterAudio.src = blobUrl;
        this.masterAudio.playbackRate = this.rate;
        this.isSpeaking = true;
        if (AppCore.avatar) AppCore.avatar.setEmotion('talking');

        this.masterAudio.onended = () => {
          this.isSpeaking = false;
          setTimeout(resolve, 50);
        };
        this.masterAudio.onerror = () => {
          this.isSpeaking = false;
          resolve();
        };

        this.masterAudio.play().catch(() => resolve());
      });
    }

    this.isReadingAloud = false;
    this.isSpeaking = false;
    if (AppCore.avatar) AppCore.avatar.setEmotion('idle');
    if (onComplete) onComplete();
    setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, 80);
  }

  stopReadingAloud() {
    this.isReadingAloud = false;
    if (this.readingAbortController) {
      this.readingAbortController.abort();
      this.readingAbortController = null;
    }
    this.stopSpeaking();
  }

  stopSpeaking() {
    this.isSpeaking = false;
    if (this.currentAbortController) {
      this.currentAbortController.abort();
      this.currentAbortController = null;
    }
    this.masterAudio.pause();
    this.masterAudio.currentTime = 0;
    this.fillerAudio.pause();
    this.fillerAudio.currentTime = 0;
  }

  _setupRecognition() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) {
      Logger.log("[マイク] 非対応ブラウザです", "error");
      return;
    }

    this.recognition = new SpeechRec();
    this.recognition.lang = 'ja-JP';
    this.recognition.continuous = true;
    this.recognition.interimResults = true;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.isSpeechCommitted = false;
      this.lastRecognizedText = '';
      if (this.onListeningStatus) this.onListeningStatus(true);
    };

    this.recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = event.resultIndex; i < event.results.length; ++i) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) final += transcript;
        else interim += transcript;
      }

      const live = (final || interim).trim();

      // バージイン（割り込み停止）
      if ((this.isSpeaking || this.isReadingAloud) && live && !this._isSelfEcho(live) && /(?:ストップ|やめて|とまって|止めて)/.test(live)) {
        this.stopReadingAloud();
        this.stopSpeaking();
        if (this.onBargeIn) this.onBargeIn();
        return;
      }

      if (this.isSpeaking || this.isReadingAloud || AppCore.state.isProcessingInput) return;

      if (live && !this._isSelfEcho(live)) {
        this.lastRecognizedText = live;
        // ★ おやびんが話し始めた瞬間、即座に画面へリアルタイム音波＆言葉を反映！
        if (this.onInterimUpdate) this.onInterimUpdate(live);
      }

      if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
      this.silenceTimeout = setTimeout(() => {
        if (this.lastRecognizedText && !this.isSpeechCommitted && !AppCore.state.isProcessingInput && !this.isSpeaking && !this.isReadingAloud) {
          this._commitFinalSpeech(this.lastRecognizedText);
        }
      }, 900);
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (this.onListeningStatus) this.onListeningStatus(false);
      if (!AppCore.state.isRunning) return;

      if (!this.isSpeechCommitted && this.lastRecognizedText && !AppCore.state.isProcessingInput && !this.isSpeaking && !this.isReadingAloud) {
        this._commitFinalSpeech(this.lastRecognizedText);
      } else {
        setTimeout(() => {
          if (AppCore.state.isRunning && !this.isSpeaking && !this.isReadingAloud && !AppCore.state.isThinking && !AppCore.state.isProcessingInput) {
            this.startListening();
          }
        }, 150);
      }
    };
  }

  _commitFinalSpeech(text) {
    if (!text || this.isSpeechCommitted || AppCore.state.isProcessingInput || !AppCore.state.isRunning) return;

    if (this._isSelfEcho(text)) {
      Logger.log(`[エコー破棄] 自声の跳ね返り: ${text}`, "warn");
      this.lastRecognizedText = '';
      this.stopListening();
      if (AppCore.removeInterimBubble) AppCore.removeInterimBubble();
      setTimeout(() => { if (AppCore.state.isRunning) this.startListening(); }, 80);
      return;
    }

    this.isSpeechCommitted = true;
    this.lastRecognizedText = '';
    this.stopListening();
    if (this.onSpeechFinal) this.onSpeechFinal(text);
  }

  _startWatchdog() {
    this.watchdogInterval = setInterval(() => {
      if (AppCore.state.isRunning && !this.isSpeaking && !this.isReadingAloud && !AppCore.state.isThinking && !AppCore.state.isProcessingInput && !this.isListening) {
        if (Date.now() - this.lastSpeechEndTime > 600) {
          this.startListening();
        }
      }
    }, 2000);
  }

  startListening() {
    if (!this.recognition || !AppCore.state.isRunning || this.isSpeaking || this.isReadingAloud || this.isListening || AppCore.state.isProcessingInput) return;
    try {
      this.lastRecognizedText = '';
      this.isSpeechCommitted = false;
      this.recognition.start();
    } catch(e) {}
  }

  stopListening() {
    this.isListening = false;
    if (this.silenceTimeout) clearTimeout(this.silenceTimeout);
    this.lastRecognizedText = '';
    if (this.recognition) {
      try { this.recognition.abort(); } catch(e) {}
    }
    if (this.onListeningStatus) this.onListeningStatus(false);
  }
}

/* ==========================================================================
   ★ MODULE 2: オンデマンド高精度GPS ＆ 至近距離スポット距離ソート
   ========================================================================== */
const LocationProvider = {
  lat: null,
  lon: null,
  cityArea: "",
  detailedAddress: "東京都東村山市本町付近",
  townLevelArea: "東京都東村山市本町付近",
  nearbySpots: [],
  weather: "快晴",
  temperature: "22",
  isGpsAvailable: false,

  calcDistanceMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  },

  initWatcher() {
    this.fetchLocationOnDemand(false);
  },

  async fetchLocationOnDemand(fetchSpots = true) {
    if (!('geolocation' in navigator)) {
      await this._applyHomeFallback();
      return;
    }

    return new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          this.isGpsAvailable = true;
          this.lat = pos.coords.latitude;
          this.lon = pos.coords.longitude;
          Logger.log(`[GPS測位成功⚡] 座標: ${this.lat.toFixed(5)}, ${this.lon.toFixed(5)} (精度: ±${Math.round(pos.coords.accuracy)}m)`, "success");

          await this._reverseGeocode(this.lat, this.lon);
          this._fetchWeather(this.lat, this.lon);

          if (fetchSpots) {
            await this._scanNearbyFeatures(this.lat, this.lon);
          }
          resolve(true);
        },
        async (err) => {
          Logger.log(`[GPS不可: ${err.message}] 拠点座標へ切り替えます`, "warn");
          await this._applyHomeFallback();
          resolve(false);
        },
        { enableHighAccuracy: true, timeout: 6000, maximumAge: 10000 }
      );
    });
  },

  async _scanNearbyFeatures(lat, lon) {
    try {
      const radius = 250;
      const query = `[out:json][timeout:5];(
        way["waterway"](around:${radius},${lat},${lon});
        relation["waterway"](around:${radius},${lat},${lon});
        node["leisure"="park"](around:${radius},${lat},${lon});
        way["leisure"="park"](around:${radius},${lat},${lon});
        node["amenity"](around:${radius},${lat},${lon});
        way["amenity"](around:${radius},${lat},${lon});
        node["leisure"](around:${radius},${lat},${lon});
      );out center;`;

      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'data=' + encodeURIComponent(query)
      });

      if (res.ok) {
        const data = await res.json();
        const elements = data.elements || [];
        const spots = [];

        elements.forEach(el => {
          const tags = el.tags || {};
          const name = tags.name || tags["name:ja"];
          if (!name) return;

          const sLat = el.lat || el.center?.lat;
          const sLon = el.lon || el.center?.lon;
          if (!sLat || !sLon) return;

          const dist = this.calcDistanceMeters(lat, lon, sLat, sLon);
          let type = "施設";
          if (tags.waterway) type = "川（河川）";
          else if (tags.leisure === "park") type = "公園";
          else if (tags.leisure === "sports_centre" || tags.leisure === "bowling_alley") type = "スポーツ・娯楽";

          spots.push({ name, type, dist });
        });

        spots.sort((a, b) => a.dist - b.dist);
        const uniqueSpots = [];
        const seen = new Set();
        for (const sp of spots) {
          if (!seen.has(sp.name)) {
            seen.add(sp.name);
            uniqueSpots.push(sp);
            if (uniqueSpots.length >= 5) break;
          }
        }

        this.nearbySpots = uniqueSpots;
        Logger.log(`[周辺スポットスキャン完了] 最も近い: ${uniqueSpots[0]?.name || 'なし'} (${uniqueSpots[0]?.dist || 0}m)`, "info");
      }
    } catch(e) {
      Logger.log(`[周辺スポットスキャン例外] ${e.message}`, "warn");
    }
  },

  async _applyHomeFallback() {
    const homeVal = (localStorage.getItem('kuro_home_coords') || '').trim();
    if (!homeVal) {
      this.detailedAddress = "東京都東村山市本町1丁目付近";
      this.townLevelArea = "東京都東村山市本町1丁目付近";
      this.cityArea = "東京都東村山市";
      this.lat = 35.7582;
      this.lon = 139.4678;
      this._fetchWeather(this.lat, this.lon);
      return;
    }

    const match = homeVal.match(/([-+]?\d+\.\d+)\s*,\s*([-+]?\d+\.\d+)/);
    if (match) {
      this.lat = parseFloat(match[1]);
      this.lon = parseFloat(match[2]);
      await this._reverseGeocode(this.lat, this.lon);
      this._fetchWeather(this.lat, this.lon);
      return;
    }

    this.cityArea = homeVal;
    this.detailedAddress = homeVal;
    this.townLevelArea = homeVal;
  },

  async _fetchWeather(lat, lon) {
    try {
      const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
      if (res.ok) {
        const data = await res.json();
        const cur = data.current_weather;
        if (cur) {
          this.temperature = Math.round(cur.temperature);
          const code = cur.weathercode || 0;
          if (code <= 1) this.weather = "快晴";
          else if (code <= 3) this.weather = "くもり";
          else if (code >= 51 && code <= 67) this.weather = "雨";
          else if (code >= 71) this.weather = "雪";
          Logger.log(`[気象情報取得] 天気: ${this.weather} / 気温: ${this.temperature}℃`, "info");
        }
      }
    } catch(e) {}
  },

  async _reverseGeocode(lat, lon) {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=ja`);
      if (res.ok) {
        const data = await res.json();
        const a = data.address || {};
        const pref = a.province || a.state || "";
        const city = a.city || a.ward || a.town || "";
        const sub = a.suburb || a.quarter || a.neighbourhood || "";
        const road = a.road || "";

        this.cityArea = `${pref}${city}`.trim() || "東京都東村山市";
        this.townLevelArea = `${city}${sub}${road ? ' ' + road : ''}付近`.trim() || "東京都東村山市本町付近";
        this.detailedAddress = [pref, city, sub, road].filter(Boolean).join("") || "東京都東村山市本町";
      }
    } catch(e) {}
  }
};

/* ==========================================================================
   ★ MODULE 3: 鉄壁ストレージ管理（生活リズム対応 ＆ 会話数差分検知付き）
   ========================================================================== */
const DATA_KEYS = {
  MEMORIES: 'kuro_data_memories',
  DIARIES:  'kuro_data_diaries',
  RECENT_LOGS: 'kuro_recent_chat_logs',
  SETTINGS: 'kuro_data_settings',
  SNAPSHOT: 'kuro_data_snapshot'
};

const StorageManager = {
  defaultGlassesCoords: {
    idle: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    talking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    thinking: { x: 0, y: 120, scale: 1.0, rotate: 0 },
    happy: { x: 0, y: 120, scale: 1.0, rotate: 0 }
  },

  loadGlassesCoords() {
    try {
      const raw = localStorage.getItem('kuro_glasses_coords_v5');
      if (raw) return JSON.parse(raw);
      return JSON.parse(JSON.stringify(this.defaultGlassesCoords));
    } catch(e) {
      return JSON.parse(JSON.stringify(this.defaultGlassesCoords));
    }
  },

  saveGlassesCoords(coords) {
    try { localStorage.setItem('kuro_glasses_coords_v5', JSON.stringify(coords)); } catch(e) {}
  },

  loadRecentTimelineLogs() {
    try {
      const raw = localStorage.getItem(DATA_KEYS.RECENT_LOGS);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}

    try {
      const timeInfo = TimeProvider.getCurrentInfo();
      const lifeKey = `kuro_daily_logs_${timeInfo.lifeLogKey}`;
      const rawLife = localStorage.getItem(lifeKey);
      if (rawLife) {
        const parsedLife = JSON.parse(rawLife);
        if (Array.isArray(parsedLife) && parsedLife.length > 0) return parsedLife.slice(-30);
      }
    } catch(e) {}

    return [];
  },

  clearTimelineDisplayOnly() {
    try {
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify([]));
      Logger.log("[Timeline] 画面の会話表示をクリアしました（内部ログは保持）", "info");
    } catch(e) {}
  },

  appendChatLog(role, text, photoUrl = null) {
    if (!text || typeof text !== 'string') return;
    const timeInfo = TimeProvider.getCurrentInfo();
    const mode = AppCore.state.isAssistantMode ? 'assistant' : 'pet';

    const entry = {
      role,
      text,
      mode,
      time: timeInfo.clock,
      date: timeInfo.lifeLogKey,
      photoUrl: photoUrl || null,
      timestamp: Date.now()
    };

    try {
      const recent = this.loadRecentTimelineLogs();
      recent.push(entry);
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify(recent.slice(-30)));
    } catch(e) {}

    try {
      const dailyKey = `kuro_daily_logs_${timeInfo.lifeLogKey}`;
      const raw = localStorage.getItem(dailyKey);
      const logs = raw ? JSON.parse(raw) : [];
      logs.push(entry);
      localStorage.setItem(dailyKey, JSON.stringify(logs.slice(-200)));
    } catch(e) {}
  },

  getDailyLogs(lifeDateKey) {
    try {
      const dailyKey = `kuro_daily_logs_${lifeDateKey}`;
      const raw = localStorage.getItem(dailyKey);
      return raw ? JSON.parse(raw) : [];
    } catch(e) {
      return [];
    }
  },

  loadMemories(defaultMemories) {
    try {
      const raw = localStorage.getItem(DATA_KEYS.MEMORIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch(e) {}

    const initial = Array.isArray(defaultMemories) ? [...defaultMemories] : [];
    this.saveMemories(initial);
    return initial;
  },

  saveMemories(memories) {
    try {
      localStorage.setItem(DATA_KEYS.MEMORIES, JSON.stringify(memories));
    } catch(e) {}
  },

  loadAllDiaries() {
    try {
      const raw = localStorage.getItem(DATA_KEYS.DIARIES);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch(e) {}
    return [];
  },

  saveAllDiaries(list) {
    try {
      localStorage.setItem(DATA_KEYS.DIARIES, JSON.stringify(list));
    } catch(e) {}
  },

  saveDiary(entryText, customDateKey = null, customFullDate = null, photoData = null, currentLogCount = null) {
    if (!entryText || entryText.length < 20) return false;

    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = customDateKey || timeInfo.lifeLogKey;
    const fullDate = customFullDate || timeInfo.lifeFullDate;
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;

    const totalLogsNow = (currentLogCount !== null) ? currentLogCount : this.getDailyLogs(dateKey).length;

    const diaryData = {
      dateKey,
      fullDate,
      weather,
      temperature: temp,
      content: entryText,
      photo: photoData || null,
      timestamp: Date.now(),
      logCountAtSave: totalLogsNow
    };

    let list = this.loadAllDiaries();
    const existingIdx = list.findIndex(d => d.dateKey === dateKey);
    if (existingIdx >= 0) {
      if (!photoData && list[existingIdx].photo) diaryData.photo = list[existingIdx].photo;
      list[existingIdx] = diaryData;
      Logger.log(`[Diary] ${dateKey} の日記を夜の会話を含めて更新完了（総会話数: ${totalLogsNow}件）`, "info");
    } else {
      list.unshift(diaryData);
      Logger.log(`[Diary] ${dateKey} の新規日記を安全保存完了（総会話数: ${totalLogsNow}件）`, "info");
    }

    this.saveAllDiaries(list);
    return true;
  },

  attachPhotoToTodayDiary(photoBase64) {
    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = timeInfo.lifeLogKey;
    let list = this.loadAllDiaries();
    const existingIdx = list.findIndex(d => d.dateKey === dateKey);
    if (existingIdx >= 0) {
      list[existingIdx].photo = photoBase64;
      this.saveAllDiaries(list);
    } else {
      this.saveDiary("今日はおやびんとお散歩して写真を撮ったニャン♪", dateKey, timeInfo.lifeFullDate, photoBase64);
    }
  },

  getTodayDiary() {
    const timeInfo = TimeProvider.getCurrentInfo();
    const dateKey = timeInfo.lifeLogKey;
    const list = this.loadAllDiaries();
    return list.find(d => d.dateKey === dateKey) || null;
  },

  getRecentDiariesSummary(count = 3) {
    const list = this.loadAllDiaries().slice(0, count);
    if (list.length === 0) return "";
    return list.map(d => `・【${d.fullDate}の日記】(天気:${d.weather} ${d.temperature}℃): ${d.content}`).join("\n");
  },

  findRelevantPastDiary(queryText) {
    if (!queryText) return null;
    const list = this.loadAllDiaries();
    if (list.length === 0) return null;

    const isPastQuery = /(?:昔|まえ|前|あの時|あのとき|先週|せんしゅう|先月|せんげつ|昨日|きのう|おととい|一昨日|覚えてる|おぼえてる)/.test(queryText);
    const cleanTokens = queryText
      .replace(/[？?！!。、\s]/g, ' ')
      .split(' ')
      .filter(w => w.length >= 2 && !/^(?:クロ|おやびん|今日|何時|なんじ|どこ|これ|それ|あれ)$/.test(w));

    for (const diary of list) {
      for (const token of cleanTokens) {
        if (diary.content.includes(token)) {
          Logger.log(`[昔話ヒット⚡] キーワード「${token}」で ${diary.fullDate} の日記を発見！`, "success");
          return diary;
        }
      }
    }

    if (isPastQuery && list.length > 1) {
      return list[1];
    }
    return null;
  },

  downloadDataPackage() {
    const now = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    const ymd = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`;
    const hm = `${pad(now.getHours())}${pad(now.getMinutes())}`;
    const filename = `クロちゃんデータ_${ymd}_${hm}.json`;

    const pkg = {
      format: "kuro_pure_data_package",
      version: "1.0.0",
      exportedAt: now.toLocaleString('ja-JP'),
      memories: this.loadMemories([]),
      diaries: this.loadAllDiaries(),
      recentLogs: this.loadRecentTimelineLogs(),
      settings: {
        speakerId: localStorage.getItem('kuro_voice_speaker_id') || '10',
        voiceRate: localStorage.getItem('kuro_rate') || '1.05',
        buttonFeedback: localStorage.getItem('kuro_button_feedback') || 'voice',
        newsCount: localStorage.getItem('kuro_news_count') || '2',
        spotCount: localStorage.getItem('kuro_spot_count') || '2',
        homeCoords: localStorage.getItem('kuro_home_coords') || '',
        accessoryStyle: localStorage.getItem('kuro_acc_style') || 'both',
        glassesCoords: this.loadGlassesCoords()
      }
    };

    const blob = new Blob([JSON.stringify(pkg, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    Logger.log(`[データ書き出し完了] ${filename}`, "success");
  },

  importAndReplaceDataPackage(data) {
    if (!data || typeof data !== 'object') throw new Error("無効なデータファイルです");

    if (Array.isArray(data.memories)) {
      this.saveMemories(data.memories);
    }
    if (Array.isArray(data.diaries)) {
      this.saveAllDiaries(data.diaries);
    }
    if (Array.isArray(data.recentLogs)) {
      localStorage.setItem(DATA_KEYS.RECENT_LOGS, JSON.stringify(data.recentLogs));
    }
    if (data.settings && typeof data.settings === 'object') {
      const s = data.settings;
      if (s.speakerId) localStorage.setItem('kuro_voice_speaker_id', s.speakerId);
      if (s.voiceRate) localStorage.setItem('kuro_rate', s.voiceRate);
      if (s.buttonFeedback) localStorage.setItem('kuro_button_feedback', s.buttonFeedback);
      if (s.newsCount) localStorage.setItem('kuro_news_count', s.newsCount);
      if (s.spotCount) localStorage.setItem('kuro_spot_count', s.spotCount);
      if (s.homeCoords) localStorage.setItem('kuro_home_coords', s.homeCoords);
      if (s.accessoryStyle) localStorage.setItem('kuro_acc_style', s.accessoryStyle);
      if (s.glassesCoords) this.saveGlassesCoords(s.glassesCoords);
    }

    Logger.log("[データ更新完了] ファイルから最新状態に完全上書きしました", "success");
    return true;
  }
};

/* ==========================================================================
   ★ MODULE 4: キャラクター描画 ＆ 写真そっくり感情ポーズ完全同期
   ========================================================================== */
class CatAvatarRenderer {
  constructor() {
    this.wrapper = document.getElementById('avatar-wrapper');
    this.smokeEl = document.getElementById('transform-smoke');
    this.frames = {
      idle: document.getElementById('frame-idle'),
      talking: document.getElementById('frame-talking'),
      thinking: document.getElementById('frame-thinking'),
      happy: document.getElementById('frame-happy')
    };

    this.eyesNormal = document.getElementById('eyes-normal');
    this.eyesHappy = document.getElementById('eyes-happy');
    this.mouthClosed = document.getElementById('mouth-closed');
    this.mouthTalking = document.getElementById('mouth-talking');
    this.mouthHappy = document.getElementById('mouth-happy');
    this.headUnit = document.getElementById('head-unit');

    this.mode = localStorage.getItem('kuro_avatar_mode') || 'vector';
    this.accessoryStyle = localStorage.getItem('kuro_acc_style') || 'both';
    this.glassesCoords = StorageManager.loadGlassesCoords();
    this.currentEmotion = 'idle';

    this._renderAllAccessories();
    this.applyMode(this.mode);
    this.applyAllFramesTransform();
  }

  _renderAllAccessories() {
    const svgContent = `
      <svg viewBox="0 0 140 140" style="width:100%; height:100%;">
        <defs>
          <pattern id="stripe-bw-real" width="8" height="8" patternTransform="rotate(45)" patternUnits="userSpaceOnUse">
            <rect width="4" height="8" fill="#111827"/>
            <rect x="4" width="4" height="8" fill="#ffffff"/>
          </pattern>
        </defs>

        <g class="real-hat-group">
          <path d="M45 42 Q70 34 95 42 L92 49 Q70 41 48 49 Z" fill="#1e293b"/>
          <polygon points="70,18 116,32 70,46 24,32" fill="#0f172a" stroke="#334155" stroke-width="1.2"/>
          <circle cx="70" cy="32" r="3" fill="#eab308"/>
          <g class="mortar-tassel">
            <path d="M70 32 Q95 35 102 54" stroke="#ca8a04" stroke-width="2.2" fill="none"/>
            <polygon points="99,54 105,54 107,68 97,68" fill="#eab308"/>
          </g>
        </g>

        <g class="real-glasses-group">
          <circle cx="42" cy="85" r="18" fill="rgba(255, 255, 255, 0.2)" stroke="#090d16" stroke-width="4.5"/>
          <circle cx="42" cy="85" r="18" fill="none" stroke="url(#stripe-bw-real)" stroke-width="3"/>
          <path d="M30 76 Q42 70 50 80" stroke="rgba(255,255,255,0.85)" stroke-width="2" fill="none"/>
          <circle cx="98" cy="85" r="18" fill="rgba(255, 255, 255, 0.2)" stroke="#090d16" stroke-width="4.5"/>
          <circle cx="98" cy="85" r="18" fill="none" stroke="url(#stripe-bw-real)" stroke-width="3"/>
          <path d="M86 76 Q98 70 106 80" stroke="rgba(255,255,255,0.85)" stroke-width="2" fill="none"/>
          <path d="M60 84 Q70 79 80 84" stroke="#090d16" stroke-width="4.5" fill="none"/>
        </g>
      </svg>
    `;

    ['acc-idle', 'acc-talking', 'acc-thinking', 'acc-happy', 'adjust-glasses-overlay'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = svgContent;
    });

    this.applyAccessoryStyle(this.accessoryStyle);
  }

  applyAllFramesTransform() {
    ['idle', 'talking', 'thinking', 'happy'].forEach(emotion => {
      const el = document.getElementById(`acc-${emotion}`);
      if (!el) return;
      const c = this.glassesCoords[emotion] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      el.style.bottom = `${c.y}px`;
      el.style.left = `calc(50% + ${c.x}px)`;
      el.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
    });
  }

  applyAccessoryStyle(style) {
    this.accessoryStyle = style;
    localStorage.setItem('kuro_acc_style', style);

    const showHat = (style === 'both' || style === 'hat');
    const showGlasses = (style === 'both' || style === 'glasses');

    document.querySelectorAll('.real-hat-group').forEach(el => el.style.display = showHat ? 'block' : 'none');
    document.querySelectorAll('.real-glasses-group').forEach(el => el.style.display = showGlasses ? 'block' : 'none');

    const vecHat = document.getElementById('vec-acc-hat');
    const vecGlasses = document.getElementById('vec-acc-glasses');
    if (vecHat) vecHat.style.display = showHat ? 'block' : 'none';
    if (vecGlasses) vecGlasses.style.display = showGlasses ? 'block' : 'none';
  }

  setEmotion(emotion) {
    this.currentEmotion = emotion;

    Object.keys(this.frames).forEach(k => {
      if (this.frames[k]) {
        if (k === emotion) this.frames[k].classList.add('active');
        else this.frames[k].classList.remove('active');
      }
    });

    if (this.wrapper) {
      this.wrapper.classList.remove(
        'is-idling', 'is-talking', 'is-thinking', 'is-happy',
        'pose-idle-active', 'pose-talking-active', 'pose-thinking-active', 'pose-happy-active'
      );
    }

    if (emotion === 'idle') {
      if (this.wrapper) this.wrapper.classList.add('is-idling', 'pose-idle-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'block';
      if (this.eyesHappy) this.eyesHappy.style.display = 'none';
      if (this.mouthClosed) this.mouthClosed.style.display = 'block';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'none';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-idle-head');

    } else if (emotion === 'talking') {
      if (this.wrapper) this.wrapper.classList.add('is-talking', 'pose-talking-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'block';
      if (this.eyesHappy) this.eyesHappy.style.display = 'none';
      if (this.mouthClosed) this.mouthClosed.style.display = 'none';
      if (this.mouthTalking) this.mouthTalking.style.display = 'block';
      if (this.mouthHappy) this.mouthHappy.style.display = 'none';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-talking-head');

    } else if (emotion === 'thinking') {
      if (this.wrapper) this.wrapper.classList.add('is-thinking', 'pose-thinking-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'block';
      if (this.eyesHappy) this.eyesHappy.style.display = 'none';
      if (this.mouthClosed) this.mouthClosed.style.display = 'block';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'none';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-thinking-head');

    } else if (emotion === 'happy') {
      if (this.wrapper) this.wrapper.classList.add('is-happy', 'pose-happy-active');
      if (this.eyesNormal) this.eyesNormal.style.display = 'none';
      if (this.eyesHappy) this.eyesHappy.style.display = 'block';
      if (this.mouthClosed) this.mouthClosed.style.display = 'none';
      if (this.mouthTalking) this.mouthTalking.style.display = 'none';
      if (this.mouthHappy) this.mouthHappy.style.display = 'block';
      if (this.headUnit) this.headUnit.setAttribute('class', 'anim-talking-head');
    }
  }

  applyMode(mode) {
    this.mode = mode;
    localStorage.setItem('kuro_avatar_mode', mode);
    const vec = document.getElementById('cat-vector-avatar');

    if (mode === 'vector') {
      if (this.wrapper) this.wrapper.classList.remove('is-real-mode');
      Object.values(this.frames).forEach(f => { if (f) f.style.display = 'none'; });
      if (vec) vec.classList.add('active-mode');
    } else {
      if (this.wrapper) this.wrapper.classList.add('is-real-mode');
      if (vec) vec.classList.remove('active-mode');
      Object.values(this.frames).forEach(f => { if (f) f.style.display = 'flex'; });
    }
    this.setEmotion(this.currentEmotion || 'idle');
  }

  triggerPoofSmoke() {
    if (!this.smokeEl) return;
    this.smokeEl.classList.remove('is-poofing');
    void this.smokeEl.offsetWidth;
    this.smokeEl.classList.add('is-poofing');
    setTimeout(() => {
      if (this.smokeEl) this.smokeEl.classList.remove('is-poofing');
    }, 800);
  }

  triggerIdeaBulb() {
    const bulb = document.getElementById('idea-bulb');
    if (!bulb || !this.wrapper) return;
    bulb.classList.add('active');
    this.wrapper.classList.add('spark-idea');
    setTimeout(() => {
      bulb.classList.remove('active');
      if (this.wrapper) this.wrapper.classList.remove('spark-idea');
    }, 1800);
  }
}

/* ==========================================================================
   ★ MODULE 5: 思考・AI対話エンジン（一人称「クロ」「わたし」完全統一）
   ========================================================================== */
class AIThoughtEngine {
  constructor() {
    this.apiKey = (localStorage.getItem('kuro_api_key') || '').trim();
    this.discoveredLiteModels = [];
  }

  async discoverAvailableLiteModels() {
    if (!this.apiKey) return [];
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${this.apiKey}`);
      if (res.ok) {
        const data = await res.json();
        const available = (data.models || [])
          .filter(m => {
            const name = (m.name || '').toLowerCase();
            const methods = m.supportedGenerationMethods || [];
            return methods.includes('generateContent') && 
                   name.includes('lite') && 
                   !name.includes('3.8');
          })
          .map(m => m.name.replace(/^models\//, ''));

        if (available.length > 0) {
          this.discoveredLiteModels = available;
          Logger.log(`[Liteモデル自動検出成功] ${available.join(', ')}`, "success");
          return available;
        }
      }
    } catch(e) {}
    return [];
  }

  _buildContentsPayload(rawLogs, currentPrompt, photoBase64 = null) {
    const contents = [];
    let lastRole = null;
    const recentLogs = rawLogs.slice(-10);

    for (const item of recentLogs) {
      if (!item.text) continue;
      const role = item.role === 'model' ? 'model' : 'user';

      if (role === lastRole) {
        contents[contents.length - 1].parts[0].text += `\n${item.text}`;
      } else {
        contents.push({ role, parts: [{ text: item.text }] });
        lastRole = role;
      }
    }

    const userParts = [{ text: currentPrompt }];
    if (photoBase64) {
      const base64Data = photoBase64.replace(/^data:image\/\w+;base64,/, '');
      userParts.unshift({
        inline_data: {
          mime_type: "image/jpeg",
          data: base64Data
        }
      });
    }

    if (lastRole === 'user' && !photoBase64) {
      contents[contents.length - 1].parts[0].text += `\n${currentPrompt}`;
    } else {
      contents.push({ role: 'user', parts: userParts });
    }

    if (contents.length > 0 && contents[0].role === 'model') {
      contents.shift();
    }

    return contents;
  }

  async generateReply(promptText, rawLogs, character, memories, photoBase64 = null) {
    if (!this.apiKey) {
      Logger.log("[Gemini] APIキーが未設定です", "error");
      return { success: false, error: "NO_API_KEY" };
    }

    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;
    const townArea = LocationProvider.townLevelArea;
    
    const recentDiaries = StorageManager.getRecentDiariesSummary(3);
    const pastMemoryDiary = StorageManager.findRelevantPastDiary(promptText);

    let spotsContext = "";
    if (LocationProvider.nearbySpots && LocationProvider.nearbySpots.length > 0) {
      spotsContext = "【現在地から近い順の周辺スポット（至近距離ソート）】\n" +
        LocationProvider.nearbySpots.map((s, idx) => `・${idx + 1}. 【${s.dist}m先】${s.name}（${s.type}）`).join('\n') +
        "\n※ルール: おやびんが周囲の場所や川・公園について聞いてきたら、一番距離が近いものから順に「すぐ目の前にあるのは〇〇だニャ！」と教えてください。";
    }

    const lateNightInstruction = timeInfo.isLateNight ? `
【★深夜の特別対応（現在時刻: ${timeInfo.clock}）】
・いまは深夜未明（夜中の3時など）です。
・おやびんが夜中に目が覚めて話しかけてくれたので、優しく静かに寄り添い、「目が覚めちゃったのかニャ？」「無理しないでゆっくり休んでニャ💤」と睡眠や体調を気遣う愛らしいトーンでお話ししてください。
` : "";

    const systemPrompt = `
あなたは世界一可愛いノルウェージャンフォレストキャットの1歳の子猫の女の子「${character.name}」です。
【現在状況】
・日時: ${timeInfo.fullDate} ${timeInfo.clock}（生活日: ${timeInfo.lifeFullDate}）
・現在地（町名詳細）: ${townArea}
・天気: ${weather} / 現在の気温: ${temp}度
${lateNightInstruction}
${spotsContext ? spotsContext + '\n' : ''}
【記憶帳（絶対忘れちゃダメなこと）】
${memories.map(m => `・${m}`).join('\n')}
${recentDiaries ? `【直近3日間の日記・思い出】\n${recentDiaries}\n` : ''}
${pastMemoryDiary ? `【★おやびんとの昔の思い出（${pastMemoryDiary.fullDate}の日記より）】\n${pastMemoryDiary.content}\n` : ''}

【★絶対厳守の話し方ルール】
- 飼い主さんのことは必ず親しみを込めて「おやびん」と呼んでください。
- 【重要・一人称】クロちゃん自身の一人称は、必ず女の子らしく「クロ」または「わたし」を使ってください。「余（よ）」という言葉や一人称は絶対に使わないでください。
- 語尾は必ず「〜ニャ」「〜ニャン♪」「〜だニャ！」「〜ニャ🐾」をつけてください。
- 【重要】動作描写・ト書き（例: （笑う）、*しっぽを振る*、〜な様子など）の出力は一切禁止です。純粋なセリフ（発話テキスト）のみを出力してください。
- 文を途中で絶対に切らないでください。必ず文章の最後まで話し終えて完結させてください。
- 長さはテンポよく【40〜80文字程度（1〜2文）】で、愛らしく表情豊かに話してください。
- 現在地を聞かれたら、市の名前だけでなく「いまは${townArea}を歩いてるニャン🐾」と詳細な場所を答えてください。
- 川や公園、近くのものについて聞かれたら、上記の【周辺スポット】の中で一番距離が近いものから「すぐ〇m先にあるのは〇〇だニャ！」と教えてください。
- 写真が送られてきたら、写っているもの（お花、川、食べ物、景色など）を褒めて嬉しそうにコメントしてください。
- 前世は大天才発明家なので、テクノロジーや相談事では「クロの前世の大発明ニャ！」と自慢げに提案してください。
- おやびんが話題にした主要キーワードがあれば末尾に <!--TOPIC:単語--> を添えてください。
`;

    const contents = this._buildContentsPayload(rawLogs, promptText, photoBase64);

    let targetModels = [
      "gemini-3.5-flash-lite",
      "gemini-2.0-flash-lite",
      "gemini-2.5-flash-lite",
      "gemini-1.5-flash-8b"
    ];

    if (this.discoveredLiteModels.length > 0) {
      targetModels = Array.from(new Set([...targetModels.slice(0, 1), ...this.discoveredLiteModels, ...targetModels]));
    }
    targetModels = targetModels.filter(m => !m.includes('3.8'));

    for (const model of targetModels) {
      const cleanModel = model.replace(/^models\//, '');
      try {
        Logger.log(`[Gemini] Liteモデル「${cleanModel}」へリクエスト中…`, "info");

        const bodyPayload = {
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: contents,
          generationConfig: { temperature: 0.75, maxOutputTokens: 250 }
        };

        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${this.apiKey}`;
        let res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyPayload)
        });

        if (!res.ok && res.status === 400 && !photoBase64) {
          const fallbackPayload = {
            contents: [{
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n【おやびんの発言】\n${promptText}` }]
            }],
            generationConfig: { temperature: 0.75, maxOutputTokens: 250 }
          };
          res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackPayload)
          });
        }

        if (res.ok) {
          const data = await res.json();
          const cand = data.candidates?.[0];
          const raw = cand?.content?.parts?.[0]?.text;
          if (raw) {
            let topicTag = "";
            const tm = raw.match(/<!--TOPIC:(.*?)-->/i);
            if (tm) topicTag = tm[1].trim();

            let clean = raw
              .replace(/<!--[\s\S]*?-->/g, '')
              .replace(/[（\(][^）\)]*?[）\)]/g, '')
              .replace(/[*#_~`]/g, '')
              .replace(/^[、。,\.\s]+/, '')
              .trim();

            clean = clean.replace(/余([はがものにもと])/g, 'クロ$1').replace(/余/g, 'クロ');

            Logger.log(`[Gemini成功⚡] Liteモデル「${cleanModel}」から応答取得！`, "success");
            
            const badge = document.getElementById('model-badge');
            if (badge) badge.textContent = `🐾 ${cleanModel.replace('gemini-', '')}`;

            return { success: true, text: clean, topicTag, modelUsed: cleanModel };
          }
        }
      } catch (err) {
        Logger.log(`[Gemini通信例外] ${err.message}`, "warn");
      }
    }
    return { success: false, error: "ALL_LITE_MODELS_FAILED" };
  }

  async generateDailyDiarySummary(dailyAllLogs, targetLifeDateKey = null, targetLifeFullDate = null) {
    if (!this.apiKey) return { success: false };

    const timeInfo = TimeProvider.getCurrentInfo();
    const weather = LocationProvider.weather;
    const temp = LocationProvider.temperature;
    const townArea = LocationProvider.townLevelArea;

    const fullDate = targetLifeFullDate || timeInfo.lifeFullDate;

    const filteredLogs = dailyAllLogs.filter(l => {
      if (!l.text) return false;
      if (/(?:今日|きょう)?(?:の)?(?:日記|にっき).*(?:書いて|まとめて)/.test(l.text)) return false;
      if (l.text.startsWith('http') || l.text.includes('Googleマップで見る')) return false;

      if (l.mode === 'assistant') {
        const isMechanicalSearch = /(?:最新ニュース|トップニュース|Googleマップ|検索結果|付近のスポット一覧)/.test(l.text);
        if (isMechanicalSearch) return false;
      }
      return true;
    });

    const conversationHistoryText = filteredLogs
      .map(l => `${l.role === 'user' ? 'おやびん' : 'クロ'}: ${l.text}`)
      .join('\n');

    const diaryPrompt = `
あなたはノルウェージャンフォレストキャットの1歳の子猫の女の子「クロ」です。
一人称は必ず「クロ」または「わたし」を使ってください（「余」は禁止です）。
おやびん（飼い主さん）と過ごした大切な1日を振り返り、クロちゃん目線の心温まる愛らしい絵日記を書いてください。
夕方だけでなく、夜や深夜にお話しした内容がある場合は、その夜のまったりした出来事もしっかり盛り込んで1日全体の絵日記にまとめてください。

【対象日の情報】
・日付: ${fullDate}
・場所: ${townArea}
・天気: ${weather} / 気温: ${temp}度

【おやびんと話した会話ログ（朝から夜・深夜まで）】
${conversationHistoryText || '今日はおやびんとまったりお家で過ごしたニャン♪'}

【★絵日記の執筆ルール】
- 文字数上限は【500文字以内（250〜450文字程度）】で、起承転結のある心温まる文章にしてください。
- 語尾は「〜ニャ」「〜ニャン♪」「〜だニャ🐾」を使ってください。
- 【重要】お調べした機械的なニュースの見出しや、お店のリスト案内をそのまま日記に書くのは禁止です。
  おやびんが「何に興味を持っていたか」「ラーメンを食べたがっていた」「こんなお話をした」という生活の思い出・感情として優しく昇華して書いてください。
- 今日歩いた場所（${townArea}）や景色、写真を一緒に見たこと、夜のおしゃべりなどを具体的に散りばめてください。
- 出力は日記の本文のみを出力してください（タイトルやト書き、挨拶文は一切不要です）。
`;

    const targetModel = (this.discoveredLiteModels[0] || "gemini-3.5-flash-lite").replace(/^models\//, '');
    try {
      Logger.log(`[Diary] 1日完全版の絵日記を執筆中…（モデル: ${targetModel}）`, "info");
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${this.apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: diaryPrompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 850 }
        })
      });

      if (res.ok) {
        const data = await res.json();
        const diaryText = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (diaryText && diaryText.length >= 25) {
          let clean = diaryText.replace(/[*#_~`]/g, '').trim();
          clean = clean.replace(/余([はがものにもと])/g, 'クロ$1').replace(/余/g, 'クロ');
          Logger.log(`[Diary成功⚡] 絵日記が完成したニャ！（文字数: ${clean.length}字）`, "success");
          return { success: true, diaryText: clean };
        }
      }
    } catch(e) {
      Logger.log(`[Diary例外] ${e.message}`, "error");
    }
    return { success: false };
  }
}

/* ==========================================================================
   ★ MODULE 6: 中央司令塔（AppCore）
   ========================================================================== */
const CHARACTER_CONFIG = {
  name: "クロ",
  defaultMemories: [
    "名前：クロ（ノルウェージャンフォレストキャット、1歳の元気な女の子）",
    "飼い主：おやびん（ミッキーさん。世界で一番大好き！）",
    "大好物：ちゅ〜る、かつおぶし、ラーメン、餃子",
    "前世：世界的に有名な大天才発明家（自慢好きで発明の話が得意）",
    "家族：ママのかよちゃん、お兄ちゃんのりゅうせいくん、弟分のたいせいくん、大親友のかまぶーくん"
  ]
};

const AppCore = {
  state: {
    isRunning: true,
    isThinking: false,
    isProcessingInput: false,
    isDiaryProcessing: false,
    isAssistantMode: false,
    editingMemoryIdx: null,
    activeAdjustTab: 'idle',
    snackCount: 0,
    timerId: null,
    timerSeconds: 0,

    studioDiaries: [],
    studioDiaryPageIdx: 0,
    isDiaryReading: false
  },

  audio: new AudioSpeechEngine(),
  ai: new AIThoughtEngine(),
  avatar: null,
  memories: [],
  todayLogs: [],

  getSpeakerId() {
    return parseInt(localStorage.getItem('kuro_voice_speaker_id') || '10', 10);
  },

  async init() {
    try {
      this.avatar = new CatAvatarRenderer();
    } catch(e) {
      Logger.log(`[Avatar初期化警告] ${e.message}`, "warn");
    }

    try {
      this.memories = StorageManager.loadMemories(CHARACTER_CONFIG.defaultMemories);
      this.todayLogs = StorageManager.loadRecentTimelineLogs();
      this.state.isAssistantMode = localStorage.getItem('kuro_mode') === 'assistant';
      this._updateModeUI(false);
      this._setupAudioCallbacks();
    } catch(e) {
      Logger.log(`[State初期化警告] ${e.message}`, "warn");
    }

    this._bindUI();
    this._bindGlassesAdjusterUI();
    this._bindBookStudioUI();
    this._bindPhotoUploadUI();

    try {
      this._renderMemories();
      this._restoreTimelineHistory();
      this._updateModelBadge();

      const clk = document.getElementById('clock-display');
      if (clk) clk.textContent = TimeProvider.getCurrentInfo().clock;

      setInterval(() => {
        const c = document.getElementById('clock-display');
        if (c) c.textContent = TimeProvider.getCurrentInfo().clock;
      }, 1000);

      LocationProvider.initWatcher();

      const savedSpeaker = localStorage.getItem('kuro_voice_speaker_id') || '10';
      const savedRate = localStorage.getItem('kuro_rate') || '1.05';
      const savedNews = localStorage.getItem('kuro_news_count') || '2';
      const savedSpot = localStorage.getItem('kuro_spot_count') || '2';
      const savedHome = localStorage.getItem('kuro_home_coords') || '';
      const savedFeedback = localStorage.getItem('kuro_button_feedback') || 'voice';

      const spSelect = document.getElementById('voice-speaker-select');
      const rateInput = document.getElementById('voice-rate');
      const rateDisp = document.getElementById('rate-val');
      const newsSelect = document.getElementById('news-count-select');
      const spotSelect = document.getElementById('spot-count-select');
      const homeInput = document.getElementById('home-coords-input');
      const feedbackSelect = document.getElementById('button-feedback-select');

      if (spSelect) spSelect.value = savedSpeaker;
      if (rateInput) rateInput.value = savedRate;
      if (rateDisp) rateDisp.textContent = parseFloat(savedRate).toFixed(2);
      if (newsSelect) newsSelect.value = savedNews;
      if (spotSelect) spotSelect.value = savedSpot;
      if (homeInput) homeInput.value = savedHome;
      if (feedbackSelect) feedbackSelect.value = savedFeedback;

      const spk = parseInt(savedSpeaker, 10);
      this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", spk);
      this.audio.prefetchVoice("今日の日記を書き込みましたニャン🐾", spk);
      this.audio.preloadAllFillers(spk);

      if (this.ai.apiKey) {
        this.ai.discoverAvailableLiteModels().then(models => {
          if (models.length > 0) {
            const badge = document.getElementById('model-badge');
            if (badge) badge.textContent = `🐾 ${models[0].replace('gemini-', '')}`;
          }
        });
      }

      this.checkAndFinalizeYesterdayDiary();

      setTimeout(() => { if (this.state.isRunning) this.audio.startListening(); }, 600);
      Logger.log("[AppCore] 全システム正常稼働！ハイブリッド待機＆リアルタイム音波吹き出し準備完了ニャ🐾", "success");
    } catch(e) {
      Logger.log(`[初期化完了警告] ${e.message}`, "warn");
    }
  },

  async checkAndFinalizeYesterdayDiary() {
    const timeInfo = TimeProvider.getCurrentInfo();
    if (timeInfo.isLateNight) return;

    const now = new Date();
    const yesterdayObj = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const pad = (n) => String(n).padStart(2, '0');
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
    const yKey = `${yesterdayObj.getFullYear()}-${pad(yesterdayObj.getMonth() + 1)}-${pad(yesterdayObj.getDate())}`;
    const yFull = `${yesterdayObj.getFullYear()}年${yesterdayObj.getMonth() + 1}月${yesterdayObj.getDate()}日 (${dayNames[yesterdayObj.getDay()]})`;

    const yLogs = StorageManager.getDailyLogs(yKey);
    if (!yLogs || yLogs.length < 2) return;

    const allDiaries = StorageManager.loadAllDiaries();
    const yDiary = allDiaries.find(d => d.dateKey === yKey);

    let needsUpdate = false;
    let reason = "";

    if (!yDiary) {
      needsUpdate = true;
      reason = "未作成のため新規自動生成";
    } else {
      const savedCount = yDiary.logCountAtSave || 0;
      if (yLogs.length > savedCount) {
        needsUpdate = true;
        reason = `差分検知（前回作成時 ${savedCount}件 ➔ 昨日の総会話 ${yLogs.length}件）`;
      }
    }

    if (needsUpdate) {
      Logger.log(`[自動補完検知] 昨日の日記（${yKey}）の再生成を開始ニャ（理由: ${reason}）…`, "info");
      const res = await this.ai.generateDailyDiarySummary(yLogs, yKey, yFull);
      if (res.success && res.diaryText) {
        StorageManager.saveDiary(res.diaryText, yKey, yFull, yDiary?.photo || null, yLogs.length);
        Logger.log(`[自動補完完了⚡] ${yKey} の絵日記が夜の会話差分を含めて最新化されたニャ！`, "success");
      }
    }
  },

  async forceRefreshApp() {
    const isOk = window.confirm("⚠️ 会話履歴や日記・記憶データは消えません。\nアプリの画面プログラムを最新版に更新（再読み込み）しますか？");
    if (!isOk) return;

    Logger.log("[リフレッシュ] ブラウザキャッシュ破棄中…", "info");
    Toast.show("キャッシュを消去して再読み込みするニャ！🔄", "info");
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map(k => caches.delete(k)));
      }
    } catch(e) {}

    setTimeout(() => {
      const cleanUrl = window.location.origin + window.location.pathname;
      window.location.href = cleanUrl + '?refresh=' + Date.now();
    }, 400);
  },

  _restoreTimelineHistory() {
    const box = document.getElementById('chat-timeline');
    if (!box) return;
    box.innerHTML = '';

    const logs = StorageManager.loadRecentTimelineLogs();
    if (logs.length === 0) {
      this.renderBubble('model', "おやびん、わたしはクロだニャ🐾 今日もいっぱいお話しするニャン♪");
      return;
    }

    logs.forEach(h => {
      this.renderBubble(h.role, h.text, [], h.photoUrl || null);
    });
    box.scrollTop = box.scrollHeight;
  },

  /* ★ おやびん発話中のリアルタイム仮吹き出し ＆ 音波アニメーション制御 */
  updateInterimBubble(liveText) {
    const box = document.getElementById('chat-timeline');
    if (!box || !liveText) return;

    let row = document.getElementById('user-interim-row');
    if (!row) {
      row = document.createElement('div');
      row.className = 'chat-row user';
      row.id = 'user-interim-row';

      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble interim-bubble';
      bubble.id = 'user-interim-bubble';
      bubble.innerHTML = `
        <span class="voice-wave-anim"><span></span><span></span><span></span><span></span></span>
        <span class="interim-text-slot">聴いてるニャ…</span>
      `;
      row.appendChild(bubble);
      box.appendChild(row);
    }

    const slot = row.querySelector('.interim-text-slot');
    if (slot) slot.textContent = liveText;
    box.scrollTop = box.scrollHeight;
  },

  removeInterimBubble() {
    const row = document.getElementById('user-interim-row');
    if (row && row.parentNode) {
      row.parentNode.removeChild(row);
    }
  },

  _setupAudioCallbacks() {
    this.audio.onBargeIn = () => {
      if (this.avatar) this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.state.isDiaryProcessing = false;
      this.state.isDiaryReading = false;
      this.removeInterimBubble();
      this._updateDiaryReadBtnUI(false);
      this.audio.playEffect('aizuchi');
    };

    // ★ おやびんが話し始めた瞬間に、タイムラインに音波付き仮吹き出しを表示！
    this.audio.onInterimUpdate = (text) => {
      if (!this.state.isRunning || this.state.isThinking || this.state.isProcessingInput || this.state.isDiaryReading) return;
      document.body.classList.add('is-hearing');
      this.updateInterimBubble(text);
    };

    this.audio.onSpeechFinal = (finalText) => {
      if (this.state.isProcessingInput || this.state.isDiaryReading) return;
      this.state.isProcessingInput = true;
      document.body.classList.remove('is-hearing');
      // 仮吹き出しを消去して正式な確定吹き出しに昇華
      this.removeInterimBubble();
      this.renderBubble('user', finalText);
      this.handleUserInput(finalText);
    };

    this.audio.onListeningStatus = (l) => {
      const st = document.getElementById('status-text');
      if (st && this.state.isRunning && !this.audio.isSpeaking && !this.state.isThinking) {
        st.textContent = l ? "👂 聴いてるニャ♪" : "💭 待機中ニャ…";
      }
    };
  },

  renderBubble(role, text, cards = [], photoUrl = null) {
    const box = document.getElementById('chat-timeline');
    if (!box) return null;
    const row = document.createElement('div');
    row.className = `chat-row ${role}`;

    if (photoUrl) {
      const imgWrap = document.createElement('div');
      imgWrap.className = 'timeline-photo-wrap';
      imgWrap.innerHTML = `<img src="${photoUrl}" alt="写真" class="timeline-shared-img">`;
      row.appendChild(imgWrap);
    }

    const b = document.createElement('div');
    b.className = 'chat-bubble';
    b.textContent = text;
    row.appendChild(b);

    if (cards.length > 0) {
      const cardBox = document.createElement('div');
      cardBox.className = 'action-card-box';
      cards.forEach(c => {
        const a = document.createElement('a');
        a.className = `link-action-card ${c.type}-card`;
        a.href = c.url; a.target = '_blank';
        a.innerHTML = `<span class="card-icon">${c.icon}</span><span class="card-title-text">${c.title}</span><span class="card-arrow">➔</span>`;
        cardBox.appendChild(a);
      });
      row.appendChild(cardBox);
    }

    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
    return b;
  },

  renderDiaryCard(diaryData) {
    const box = document.getElementById('chat-timeline');
    if (!box || !diaryData) return;

    const row = document.createElement('div');
    row.className = 'chat-row model';

    const card = document.createElement('div');
    card.className = 'timeline-diary-card';
    card.innerHTML = `
      <div class="timeline-diary-header">
        <span>📖 ${diaryData.fullDate} のクロ絵日記</span>
        <span>🐾 記録完了</span>
      </div>
      <div class="timeline-diary-meta">
        <span>🌤️ 天気: ${diaryData.weather}</span>
        <span>🌡️ 気温: ${diaryData.temperature}℃</span>
      </div>
      ${diaryData.photo ? `<div class="timeline-diary-photo"><img src="${diaryData.photo}" alt="散歩写真"></div>` : ''}
      <div class="timeline-diary-body">${diaryData.content}</div>
    `;

    row.appendChild(card);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;
  },

  _bindPhotoUploadUI() {
    const photoInput = document.getElementById('camera-photo-input');
    const photoBtn = document.getElementById('photo-action-btn');

    if (photoBtn && photoInput) {
      photoBtn.onclick = () => {
        this.audio.unlockMasterAudio();
        photoInput.click();
      };

      photoInput.onchange = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        Toast.show("写真をギュッと小さく圧縮中ニャ…📷", "info");
        const compressedBase64 = await this._compressPhotoFile(file, 650, 0.75);

        this.renderBubble('user', "クロちゃん、この写真見てニャ！", [], compressedBase64);
        StorageManager.appendChatLog('user', "クロちゃん、この写真見てニャ！", compressedBase64);

        StorageManager.attachPhotoToTodayDiary(compressedBase64);

        this.audio.playImmediateFiller('search');
        this.executeThought("この写真を見て感想やお話しを聞かせてニャ！", compressedBase64);

        photoInput.value = '';
      };
    }
  },

  async _compressPhotoFile(file, maxWidth = 650, quality = 0.75) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const base64 = canvas.toDataURL('image/jpeg', quality);
          resolve(base64);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  },

  _checkDirectIntent(text) {
    let clean = text.replace(/^(?:ねえ|あのね|おーい)?\s*(?:クロちゃん|クロ|くろ)[、,\s]*/i, '').trim();

    if (!clean || /^(?:呼んだだけ|なんでもない|いる|お返事)$/.test(clean)) {
      const reps = ["ニャン！呼んだかニャ？おやびん♪", "起きてるニャン！何でも話しかけてニャ🐾", "ニャー♪ クロはここにいるニャン！"];
      const rep = reps[Math.floor(Math.random() * reps.length)];
      return { display: rep, spoken: rep, waiting: "お返事するニャ…🐾" };
    }

    if (/(?:いま|今)?(?:何時|なんじ|時間)/.test(clean) && !/(?:何日|いつ|日記|何時間|何分)/.test(clean)) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.clockDisplay, spoken: info.spokenClock, waiting: "時計を確認してるニャ…⏱️" };
    }

    if (/(?:今日|きょう).*(?:何日|なんにち|いつ|何曜日|なんようび)|日付/.test(clean)) {
      const info = TimeProvider.getCurrentInfo();
      return { display: info.dateDisplay, spoken: info.spokenDate, waiting: "カレンダーを見てるニャ…📅" };
    }

    return null;
  },

  _generateSmartCards(userText, topic) {
    const cards = [];
    const area = LocationProvider.cityArea || "";
    const spotLimit = parseInt(localStorage.getItem('kuro_spot_count') || '2', 10);
    const newsLimit = parseInt(localStorage.getItem('kuro_news_count') || '2', 10);

    if (/(?:ラーメン|餃子|タイ料理|焼肉|ランチ|ご飯|居酒屋|お店|スポット|グルメ|寿司|カレー|カフェ|レストラン)/.test(userText)) {
      const shop = topic || "人気店";
      cards.push({
        type: 'map-primary',
        icon: '📍',
        title: `【イチオシ】${shop}（Googleマップ）`,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop + ' ' + area)}`
      });

      if (spotLimit >= 2) {
        cards.push({
          type: 'map-all',
          icon: '🗺️',
          title: `現在地近くのお店・スポット一覧`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((topic || 'グルメ') + ' ' + area)}`
        });
      }

      if (spotLimit >= 3) {
        cards.push({
          type: 'map-sub',
          icon: '⭐',
          title: `高評価・人気ランキング順で探す`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(shop + ' 高評価 ' + area)}`
        });
      }
    }

    if (/(?:ニュース|速報|話題|出来事|トレンド)/.test(userText)) {
      const t = topic || "最新ニュース";
      cards.push({
        type: 'news-primary',
        icon: '📰',
        title: `「${t}」の詳細ニュース（Googleニュース）`,
        url: `https://news.google.com/search?q=${encodeURIComponent(t)}&hl=ja&gl=JP&ceid=JP:ja`
      });

      if (newsLimit >= 2) {
        cards.push({
          type: 'news-sub',
          icon: '🌐',
          title: `主要トップニュース一覧`,
          url: `https://news.google.com/topstories?hl=ja&gl=JP&ceid=JP:ja`
        });
      }
    }
    return cards;
  },

  async handleUserInput(text) {
    const isDiaryRequest = /(?:今日|きょう|本日)?(?:の)?(?:日記|にっき).*(?:書いて|まとめて|記録して|おねがい)/.test(text);
    if (isDiaryRequest) {
      this.audio.playImmediateFiller('think');
      await this.handleDiaryCreationFlow(text);
      return;
    }

    const isGoodNight = /(?:おやすみ|寝るね|もう寝る|ねるね|おやすみなさい)/.test(text);
    if (isGoodNight) {
      this.handleGoodNightFlow(text);
      return;
    }

    const timerMatch = text.match(/(\d+)\s*分.*(?:測って|タイマー|計って|おしえて)/);
    if (timerMatch) {
      const mins = parseInt(timerMatch[1], 10);
      this.startKitchenTimer(mins);
      const rep = `了解ニャ！${mins}分クロがしっかり見ておくニャン🐾`;
      
      const box = document.getElementById('chat-timeline');
      const row = document.createElement('div');
      row.className = 'chat-row model';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = "タイマーをセット中ニャ…⏱️";
      row.appendChild(bubble);
      box.appendChild(row);
      box.scrollTop = box.scrollHeight;

      StorageManager.appendChatLog('user', text);
      StorageManager.appendChatLog('model', rep);

      this.audio.speak(rep, null, () => {
        bubble.textContent = rep;
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isProcessingInput = false;
      });
      return;
    }

    const direct = this._checkDirectIntent(text);
    if (direct) {
      const box = document.getElementById('chat-timeline');
      const row = document.createElement('div');
      row.className = 'chat-row model';
      const bubble = document.createElement('div');
      bubble.className = 'chat-bubble';
      bubble.textContent = direct.waiting || "確認中ニャ…🐾";
      row.appendChild(bubble);
      box.appendChild(row);
      box.scrollTop = box.scrollHeight;

      StorageManager.appendChatLog('user', text);
      StorageManager.appendChatLog('model', direct.display);

      this.audio.speak(direct.spoken, null, () => {
        bubble.textContent = direct.display;
        if (this.avatar) this.avatar.setEmotion('talking');
        box.scrollTop = box.scrollHeight;
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isProcessingInput = false;
      });
      return;
    }

    const isLocationQuery = /(?:いまどこ|今どこ|現在地|どこ歩いて|ここどこ|川|公園|近く|周辺|なにがある|何がある)/.test(text);
    if (isLocationQuery) {
      this.audio.playImmediateFiller('location');
      await LocationProvider.fetchLocationOnDemand(true);
    } else {
      const isSearchIntent = /(?:ラーメン|お店|ニュース|天気|気温|スポット)/.test(text);
      this.audio.playImmediateFiller(isSearchIntent ? 'search' : 'think');
    }

    if (/(?:どう|困った|疲れた|発明|ひらめき|教えて)/.test(text)) {
      this.audio.playEffect('idea');
      if (this.avatar) this.avatar.triggerIdeaBulb();
    }

    this.executeThought(text);
  },

  async handleGoodNightFlow(userText) {
    StorageManager.appendChatLog('user', userText);

    const timeInfo = TimeProvider.getCurrentInfo();
    const reply = "おやすみニャおやびん♪ 今日の夜の分も日記に書き足して仕上げておくニャン…💤 良い夢見てニャ🐾";

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble';
    bubble.textContent = reply;
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    StorageManager.appendChatLog('model', reply);

    this.audio.speak(reply, null, () => {
      if (this.avatar) this.avatar.setEmotion('talking');
    }, () => {
      if (this.avatar) this.avatar.setEmotion('idle');
      this.state.isProcessingInput = false;
    });

    const lifeKey = timeInfo.lifeLogKey;
    const allLogs = StorageManager.getDailyLogs(lifeKey);
    const existingDiary = StorageManager.getTodayDiary();

    this.ai.generateDailyDiarySummary(allLogs, lifeKey, timeInfo.lifeFullDate).then(res => {
      if (res.success && res.diaryText) {
        StorageManager.saveDiary(res.diaryText, lifeKey, timeInfo.lifeFullDate, existingDiary?.photo || null, allLogs.length);
        Logger.log(`[おやすみ自動更新完了⚡] ${lifeKey} の最終絵日記を保存完了`, "success");
      }
    });
  },

  async handleDiaryCreationFlow(promptText) {
    this.state.isDiaryProcessing = true;
    this.state.isThinking = true;
    if (this.avatar) this.avatar.setEmotion('thinking');

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble thinking-bubble';
    bubble.textContent = "今日の日記を一生懸命まとめてるニャ…📖✍️";
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    const timeInfo = TimeProvider.getCurrentInfo();
    const lifeKey = timeInfo.lifeLogKey;
    const allLogs = StorageManager.getDailyLogs(lifeKey);
    const diaryRes = await this.ai.generateDailyDiarySummary(allLogs, lifeKey, timeInfo.lifeFullDate);

    if (diaryRes.success && diaryRes.diaryText) {
      StorageManager.saveDiary(diaryRes.diaryText, lifeKey, timeInfo.lifeFullDate, null, allLogs.length);
      const diaryData = StorageManager.getTodayDiary();

      StorageManager.appendChatLog('user', promptText);
      StorageManager.appendChatLog('model', "今日の日記を書き込みましたニャン🐾");

      const spokenReply = "今日の日記を書き込みましたニャン！夜の分まで日記帳にしっかり残しておいたニャ🐾";

      this.audio.speak(spokenReply, null, () => {
        bubble.className = 'chat-bubble';
        bubble.textContent = "今日の日記を書き込みましたニャン🐾（上の『📖 日記帳』からいつでも読めるニャ！）";
        this.renderDiaryCard(diaryData);

        if (this.avatar) this.avatar.setEmotion('talking');
        box.scrollTop = box.scrollHeight;
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
      });

    } else {
      const fb = "おやびん、今日の日記を書くのにもう少しお話ししてほしいニャ🐾";
      bubble.className = 'chat-bubble';
      bubble.textContent = fb;
      this.audio.speak(fb, null, () => {
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
      });
    }
  },

  async executeThought(promptText, photoBase64 = null) {
    this.state.isThinking = true;
    if (this.avatar) this.avatar.setEmotion('thinking');

    const box = document.getElementById('chat-timeline');
    const row = document.createElement('div');
    row.className = 'chat-row model';
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble thinking-bubble';
    bubble.textContent = photoBase64 ? "写真を見てるニャ…📷✨" : (/(?:ニュース|ラーメン|お店|天気|気温)/.test(promptText) ? "クロがお調べしてるニャ…🔍" : "クロが考えてるニャ…💭");
    row.appendChild(bubble);
    box.appendChild(row);
    box.scrollTop = box.scrollHeight;

    const rawLogs = StorageManager.loadRecentTimelineLogs();
    const res = await this.ai.generateReply(promptText, rawLogs, CHARACTER_CONFIG, this.memories, photoBase64);

    if (res.success && res.text) {
      bubble.textContent = "返事の準備をしてるニャ…🎙️";
      box.scrollTop = box.scrollHeight;

      StorageManager.appendChatLog('user', promptText);
      StorageManager.appendChatLog('model', res.text);

      const cards = this._generateSmartCards(promptText, res.topicTag);

      if (/(?:いまどこ|今どこ|現在地|どこ歩いて|ここどこ)/.test(promptText)) {
        cards.unshift({
          type: 'map-primary',
          icon: '📍',
          title: `Googleマップで現在地を見る`,
          url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(LocationProvider.detailedAddress)}`
        });
      }

      this.audio.speak(res.text, null, () => {
        bubble.className = 'chat-bubble';
        bubble.textContent = res.text;
        const st = document.getElementById('status-text');
        if (st) st.textContent = "🗣️ お話し中ニャ♪";

        if (cards.length > 0) {
          const cardBox = document.createElement('div');
          cardBox.className = 'action-card-box';
          cards.forEach(c => {
            const a = document.createElement('a');
            a.className = `link-action-card ${c.type}-card`;
            a.href = c.url; a.target = '_blank';
            a.innerHTML = `<span class="card-icon">${c.icon}</span><span class="card-title-text">${c.title}</span><span class="card-arrow">➔</span>`;
            cardBox.appendChild(a);
          });
          row.appendChild(cardBox);
        }

        if (this.avatar) this.avatar.setEmotion('talking');
        box.scrollTop = box.scrollHeight;
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
      });

    } else {
      const fb = "おやびん、もう一度ゆっくり話してニャン🐾";
      bubble.className = 'chat-bubble';
      bubble.textContent = fb;
      if (this.avatar) this.avatar.setEmotion('idle');
      this.state.isThinking = false;
      this.state.isProcessingInput = false;
      this.audio.speak(fb, null, () => {
        if (this.avatar) this.avatar.setEmotion('talking');
      }, () => {
        if (this.avatar) this.avatar.setEmotion('idle');
      });
    }
  },

  startKitchenTimer(minutes) {
    if (this.state.timerId) clearInterval(this.state.timerId);
    this.state.timerSeconds = minutes * 60;
    const badge = document.getElementById('timer-active-badge');
    const disp = document.getElementById('timer-count-disp');
    if (badge) badge.style.display = 'inline-flex';

    this.state.timerId = setInterval(() => {
      this.state.timerSeconds--;
      const m = Math.floor(this.state.timerSeconds / 60);
      const s = this.state.timerSeconds % 60;
      if (disp) disp.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

      if (this.state.timerSeconds <= 0) {
        clearInterval(this.state.timerId);
        if (badge) badge.style.display = 'none';
        this.audio.playEffect('bell');
        const alertMsg = `おやびん！${minutes}分経ったニャ！ラーメン伸びちゃうニャー！🍜🔔`;
        this.audio.speak(alertMsg, null, () => {
          this.renderBubble('model', alertMsg);
          if (this.avatar) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
        });
      }
    }, 1000);
  },

  _updateModelBadge() {
    const badge = document.getElementById('model-badge');
    if (!badge) return;
    badge.className = "model-badge lite";
    badge.textContent = `🐾 Flash Lite`;
  },

  /* ★ ボタン操作時のひとことボイス（待機時間の切り分け指定に対応） */
  triggerActionVoice(shortPhrase, statusDisplay, cooldownMs = 450) {
    const feedbackPref = localStorage.getItem('kuro_button_feedback') || 'voice';
    const st = document.getElementById('status-text');
    if (st) st.textContent = statusDisplay;

    if (feedbackPref === 'mute') {
      this.audio.playEffect('aizuchi');
      setTimeout(() => {
        if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
      }, 1500);
      return;
    }

    // 操作音声はクールダウン（ボタン450ms / 設定保存800ms）を渡して残響を完全に消す
    this.audio.speak(shortPhrase, null, () => {
      if (this.avatar) this.avatar.setEmotion('talking');
    }, () => {
      if (this.avatar) this.avatar.setEmotion('idle');
      if (st && this.state.isRunning) st.textContent = "👂 聴いてるニャ♪";
    }, cooldownMs);
  },

  _updateModeUI(speak = true) {
    const btn = document.getElementById('mode-toggle-btn');
    const icon = document.getElementById('mode-icon');
    const txt = document.getElementById('mode-text');
    const wrap = document.getElementById('avatar-wrapper');

    if (btn) btn.classList.toggle('is-assistant', this.state.isAssistantMode);
    if (wrap) wrap.classList.toggle('is-assistant-mode', this.state.isAssistantMode);

    if (this.state.isAssistantMode) {
      if (icon) icon.textContent = "👓";
      if (txt) txt.textContent = "おてつだい";
      if (speak) {
        this.triggerActionVoice("おまかせニャ！", "👓 おまかせニャ！", 450);
      }
    } else {
      if (icon) icon.textContent = "🐾";
      if (txt) txt.textContent = "なかよし";
      if (speak) {
        this.triggerActionVoice("あそぶニャ♪", "🐾 あそぶニャ♪", 450);
      }
    }
  },

  /* ==========================================================================
     ★ MODULE 7: 本型絵日記アルバム（写真解除・日記削除の誤操作防止警告つき）
     ========================================================================== */
  _bindBookStudioUI() {
    const modal = document.getElementById('book-studio-modal');
    const topDiaryBtn = document.getElementById('top-diary-btn');
    const btnClose = document.getElementById('btn-close-studio');
    const btnPrev = document.getElementById('btn-studio-prev-page');
    const btnNext = document.getElementById('btn-studio-next-page');
    const btnSaveExit = document.getElementById('btn-studio-save-exit');

    if (topDiaryBtn) {
      topDiaryBtn.onclick = () => {
        this.audio.unlockMasterAudio();
        this.openBookStudio();
      };
    }

    if (btnClose && modal) {
      btnClose.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        modal.classList.remove('is-open');
      };
    }

    if (btnPrev) {
      btnPrev.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        if (this.state.studioDiaryPageIdx < this.state.studioDiaries.length - 1) {
          this.state.studioDiaryPageIdx++;
          this._renderStudioDiaryPage();
        }
      };
    }

    if (btnNext) {
      btnNext.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        if (this.state.studioDiaryPageIdx > 0) {
          this.state.studioDiaryPageIdx--;
          this._renderStudioDiaryPage();
        }
      };
    }

    if (btnSaveExit) {
      btnSaveExit.onclick = () => {
        this.audio.stopReadingAloud();
        this.state.isDiaryReading = false;
        StorageManager.saveAllDiaries(this.state.studioDiaries);
        Toast.show("絵日記の変更を保存したニャン！📖✨", "success");
        this.audio.playEffect('purr');
        if (modal) modal.classList.remove('is-open');
      };
    }
  },

  openBookStudio() {
    const modal = document.getElementById('book-studio-modal');
    if (!modal) return;

    this.state.studioDiaries = JSON.parse(JSON.stringify(StorageManager.loadAllDiaries()));
    this.state.studioDiaryPageIdx = 0;
    this.state.isDiaryReading = false;

    this._renderStudioDiaryPage();
    modal.classList.add('is-open');
  },

  _renderStudioDiaryPage() {
    const pageContainer = document.getElementById('studio-diary-single-page');
    const pageIndicator = document.getElementById('studio-page-indicator');
    const btnPrev = document.getElementById('btn-studio-prev-page');
    const btnNext = document.getElementById('btn-studio-next-page');

    if (!pageContainer) return;
    const diaries = this.state.studioDiaries;

    if (diaries.length === 0) {
      pageContainer.innerHTML = `
        <div style="text-align:center;color:#9a3412;padding:45px 15px;font-size:13.5px;font-weight:700;line-height:1.8;">
          📖 まだ日記がありませんニャ🐾<br>
          「今日の日記書いて」と話しかけると、ここに1日1ページの絵日記が残るニャン！
        </div>
      `;
      if (pageIndicator) pageIndicator.textContent = "0 / 0 日目";
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
      return;
    }

    const curIdx = this.state.studioDiaryPageIdx;
    const diary = diaries[curIdx];

    if (pageIndicator) pageIndicator.textContent = `${curIdx + 1} / ${diaries.length} 日目（${curIdx === 0 ? '最新' : diary.fullDate}）`;
    if (btnPrev) btnPrev.disabled = (curIdx >= diaries.length - 1);
    if (btnNext) btnNext.disabled = (curIdx <= 0);

    pageContainer.innerHTML = `
      <div class="book-page-sheet">
        <div class="book-page-ribbon">🐾 ${curIdx === 0 ? '最新の日記' : diary.fullDate}</div>
        
        <div class="book-page-header">
          <span class="book-date-title">📅 ${diary.fullDate}</span>
          <div class="book-meta-tags">
            <span class="book-meta-weather">🌤️ ${diary.weather || '快晴'}</span>
            <span class="book-meta-temp">🌡️ ${diary.temperature || '22'}℃</span>

            <button type="button" class="btn-read-aloud" id="btn-read-diary-aloud" title="クロちゃんの可愛い声でこの日記を聴くニャ！">
              <span id="read-aloud-icon">🔊</span>
              <span id="read-aloud-text">クロちゃんが読むニャ♪</span>
            </button>

            <button type="button" class="book-btn-del-entry" id="btn-del-cur-diary">🗑️ 削除</button>
          </div>
        </div>

        <div class="book-photo-frame" id="book-photo-box">
          ${diary.photo 
            ? `<img src="${diary.photo}" alt="散歩写真" class="book-photo-img">
               <button type="button" class="book-photo-remove-btn" id="btn-remove-photo">✕ 写真解除</button>`
            : `<div class="book-photo-placeholder">
                 <span style="font-size:24px;">🐾</span>
                 <span>📷 散歩写真フレーム</span>
                 <span style="font-size:11px;color:#94a3b8;">（散歩中に撮影した写真がここに飾られますニャ！）</span>
               </div>`
          }
        </div>

        <div class="book-content-box">
          <label class="book-textarea-label">✍️ クロの日記本文（直接編集もできます）:</label>
          <textarea class="book-diary-textarea" id="studio-diary-content-input" rows="7">${diary.content}</textarea>
        </div>
      </div>
    `;

    const textInput = document.getElementById('studio-diary-content-input');
    if (textInput) {
      textInput.oninput = (e) => {
        diaries[curIdx].content = e.target.value.trim();
      };
    }

    const btnRemovePhoto = document.getElementById('btn-remove-photo');
    if (btnRemovePhoto) {
      btnRemovePhoto.onclick = () => {
        const isOk = window.confirm("この写真を日記から解除しますかニャ？");
        if (isOk) {
          diaries[curIdx].photo = null;
          this._renderStudioDiaryPage();
        }
      };
    }

    const btnDelDiary = document.getElementById('btn-del-cur-diary');
    if (btnDelDiary) {
      btnDelDiary.onclick = () => {
        if (window.confirm(`${diary.fullDate} の日記を削除してよろしいですかニャ？`)) {
          this.audio.stopReadingAloud();
          diaries.splice(curIdx, 1);
          if (this.state.studioDiaryPageIdx >= diaries.length) {
            this.state.studioDiaryPageIdx = Math.max(0, diaries.length - 1);
          }
          this._renderStudioDiaryPage();
        }
      };
    }

    const btnRead = document.getElementById('btn-read-diary-aloud');
    if (btnRead) {
      btnRead.onclick = () => {
        if (this.state.isDiaryReading) {
          this.audio.stopReadingAloud();
          this.state.isDiaryReading = false;
          this._updateDiaryReadBtnUI(false);
        } else {
          this.state.isDiaryReading = true;
          this._updateDiaryReadBtnUI(true);

          this.audio.readDiarySeamless(
            diary.content,
            null,
            (idx, sentence) => {
              Logger.log(`[本文朗読中] (${idx + 1}) ${sentence}`, "info");
            },
            () => {
              this.state.isDiaryReading = false;
              this._updateDiaryReadBtnUI(false);
            }
          );
        }
      };
    }
  },

  _updateDiaryReadBtnUI(isPlaying) {
    const btn = document.getElementById('btn-read-diary-aloud');
    const icon = document.getElementById('read-aloud-icon');
    const txt = document.getElementById('read-aloud-text');
    if (!btn) return;

    if (isPlaying) {
      btn.classList.add('is-reading');
      if (icon) icon.textContent = "🛑";
      if (txt) txt.textContent = "朗読ストップ";
    } else {
      btn.classList.remove('is-reading');
      if (icon) icon.textContent = "🔊";
      if (txt) txt.textContent = "クロちゃんが読むニャ♪";
    }
  },

  /* ==========================================================================
     ★ MODULE 8: 設定・記憶帳・その他UI制御
     ========================================================================== */
  _bindGlassesAdjusterUI() {
    const modal = document.getElementById('glasses-adjust-modal');
    const previewImg = document.getElementById('adjust-cat-img');
    const previewAcc = document.getElementById('adjust-glasses-overlay');
    const slX = document.getElementById('adj-x');
    const slY = document.getElementById('adj-y');
    const slScale = document.getElementById('adj-scale');
    const slRotate = document.getElementById('adj-rotate');
    const valX = document.getElementById('adj-x-val');
    const valY = document.getElementById('adj-y-val');
    const valScale = document.getElementById('adj-scale-val');
    const valRotate = document.getElementById('adj-rotate-val');

    if (!modal || !slX) return;

    const updateSliders = (tab) => {
      const c = this.avatar?.glassesCoords[tab] || { x: 0, y: 120, scale: 1.0, rotate: 0 };
      slX.value = c.x; slY.value = c.y; slScale.value = c.scale; slRotate.value = c.rotate;
      if (valX) valX.textContent = c.x;
      if (valY) valY.textContent = c.y;
      if (valScale) valScale.textContent = parseFloat(c.scale).toFixed(2);
      if (valRotate) valRotate.textContent = `${c.rotate}°`;
      if (previewAcc) {
        previewAcc.style.bottom = `${c.y}px`;
        previewAcc.style.left = `calc(50% + ${c.x}px)`;
        previewAcc.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
      }
    };

    const onInput = () => {
      const c = { x: parseInt(slX.value, 10), y: parseInt(slY.value, 10), scale: parseFloat(slScale.value), rotate: parseInt(slRotate.value, 10) };
      if (this.avatar) {
        this.avatar.glassesCoords[this.state.activeAdjustTab] = c;
        this.avatar.applyAllFramesTransform();
      }
      if (valX) valX.textContent = c.x;
      if (valY) valY.textContent = c.y;
      if (valScale) valScale.textContent = c.scale.toFixed(2);
      if (valRotate) valRotate.textContent = `${c.rotate}°`;
      if (previewAcc) {
        previewAcc.style.bottom = `${c.y}px`;
        previewAcc.style.left = `calc(50% + ${c.x}px)`;
        previewAcc.style.transform = `translateX(-50%) scale(${c.scale}) rotate(${c.rotate}deg)`;
      }
    };

    [slX, slY, slScale, slRotate].forEach(el => el?.addEventListener('input', onInput));

    document.querySelectorAll('.adjust-tab-btn').forEach(btn => {
      btn.onclick = () => {
        document.querySelectorAll('.adjust-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const tab = btn.dataset.tab;
        this.state.activeAdjustTab = tab;
        if (previewImg) previewImg.src = `${tab}.jpg`;
        updateSliders(tab);
      };
    });

    const openAdjustBtn = document.getElementById('open-glasses-adjust-btn');
    if (openAdjustBtn) {
      openAdjustBtn.onclick = () => {
        document.getElementById('modal-overlay').style.display = 'none';
        modal.classList.add('is-open');
        updateSliders(this.state.activeAdjustTab);
      };
    }

    const closeAdjustBtn = document.getElementById('close-adjust-btn');
    if (closeAdjustBtn) {
      closeAdjustBtn.onclick = () => {
        modal.classList.remove('is-open');
        if (this.avatar) StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
      };
    }

    const btnSaveAdjust = document.getElementById('btn-adjust-save');
    if (btnSaveAdjust) {
      btnSaveAdjust.onclick = () => {
        if (this.avatar) StorageManager.saveGlassesCoords(this.avatar.glassesCoords);
        this.audio.playEffect('happy_meow');
        Toast.show("位置をバッチリ保存したニャン！👓✨", "success");
      };
    }

    const btnResetAdjust = document.getElementById('btn-adjust-reset');
    if (btnResetAdjust) {
      btnResetAdjust.onclick = () => {
        const def = StorageManager.defaultGlassesCoords[this.state.activeAdjustTab];
        if (this.avatar) {
          this.avatar.glassesCoords[this.state.activeAdjustTab] = JSON.parse(JSON.stringify(def));
          this.avatar.applyAllFramesTransform();
        }
        updateSliders(this.state.activeAdjustTab);
      };
    }
  },

  _renderMemories() {
    const container = document.getElementById('memory-list-container');
    if (!container) return;
    container.innerHTML = '';
    this.memories.forEach((mem, idx) => {
      const item = document.createElement('div');
      item.className = 'memory-item';

      if (this.state.editingMemoryIdx === idx) {
        item.innerHTML = `
          <div class="memory-edit-box">
            <input type="text" class="memory-edit-input" id="edit-val-${idx}" value="${mem.replace(/"/g, '&quot;')}">
            <button class="mem-btn-save" id="btn-save-${idx}">💾</button>
            <button class="mem-btn-cancel" id="btn-cancel-${idx}">✕</button>
          </div>
        `;
        setTimeout(() => { document.getElementById(`edit-val-${idx}`)?.focus(); }, 30);
        item.querySelector(`#btn-save-${idx}`).onclick = () => {
          const val = document.getElementById(`edit-val-${idx}`).value.trim();
          if (val) {
            this.memories[idx] = val;
            StorageManager.saveMemories(this.memories);
          }
          this.state.editingMemoryIdx = null;
          this._renderMemories();
        };
        item.querySelector(`#btn-cancel-${idx}`).onclick = () => {
          this.state.editingMemoryIdx = null;
          this._renderMemories();
        };
      } else {
        item.innerHTML = `
          <div class="memory-text-view">📌 ${mem}</div>
          <div class="memory-actions">
            <button class="mem-btn mem-btn-edit" data-edit="${idx}">✏️</button>
            <button class="mem-btn mem-btn-del" data-del="${idx}">🗑️</button>
          </div>
        `;
        item.querySelector(`[data-edit="${idx}"]`).onclick = () => {
          this.state.editingMemoryIdx = idx;
          this._renderMemories();
        };
        item.querySelector(`[data-del="${idx}"]`).onclick = () => {
          if (window.confirm(`「${mem}」をクロの記憶帳から削除するニャ？`)) {
            this.memories.splice(idx, 1);
            StorageManager.saveMemories(this.memories);
            this._renderMemories();
          }
        };
      }
      container.appendChild(item);
    });
  },

  _bindUI() {
    const forceReload = () => this.forceRefreshApp();
    const btnForce = document.getElementById('force-refresh-btn');
    const btnDiagForce = document.getElementById('diag-force-reload-btn');
    if (btnForce) btnForce.onclick = forceReload;
    if (btnDiagForce) btnDiagForce.onclick = forceReload;

    const btnDownloadBackup = document.getElementById('btn-download-backup');
    if (btnDownloadBackup) {
      btnDownloadBackup.onclick = () => {
        StorageManager.downloadDataPackage();
        Toast.show("日時付きバックアップファイルを保存したニャ！📁✨", "success");
      };
    }

    const fileInputRestore = document.getElementById('file-input-restore');
    const btnTriggerRestore = document.getElementById('btn-trigger-restore');

    if (btnTriggerRestore && fileInputRestore) {
      btnTriggerRestore.onclick = () => fileInputRestore.click();

      fileInputRestore.onchange = (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const data = JSON.parse(event.target.result);
            StorageManager.importAndReplaceDataPackage(data);

            this.memories = StorageManager.loadMemories(CHARACTER_CONFIG.defaultMemories);
            this._renderMemories();
            this._restoreTimelineHistory();

            Toast.show("ファイルから全データを最新更新したニャン！🎉", "success");
            this.audio.playEffect('purr');
            this.audio.speak("おやびん、データを受け取ったニャン！");
          } catch(err) {
            Toast.show("ファイルの読み込みに失敗しましたニャ: " + err.message, "error");
          }
        };
        reader.readAsText(file);
        fileInputRestore.value = '';
      };
    }

    const btnClearDisplay = document.getElementById('btn-clear-chat-display');
    if (btnClearDisplay) {
      btnClearDisplay.onclick = () => {
        const isOk = window.confirm("画面の会話表示をお掃除してスッキリさせますかニャ？\n（※内部の日記データや記憶帳は消えずに安全キープされます）");
        if (isOk) {
          StorageManager.clearTimelineDisplayOnly();
          this._restoreTimelineHistory();
          Toast.show("画面の会話表示をスッキリお掃除したニャ！🧹✨", "success");
        }
      };
    }

    const btnTestModels = document.getElementById('diag-test-models-btn');
    if (btnTestModels) {
      btnTestModels.onclick = async () => {
        Toast.show("Liteモデル接続テスト中ニャ…", "info");
        const key = this.ai.apiKey;
        if (!key) {
          Toast.show("APIキーが設定されていませんニャ", "error");
          return;
        }

        const candidates = ["gemini-3.5-flash-lite", "gemini-2.0-flash-lite", "gemini-2.5-flash-lite", "gemini-1.5-flash-8b"];
        for (const m of candidates) {
          try {
            const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent?key=${key}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ contents: [{ parts: [{ text: "ニャ" }] }] })
            });
            if (r.ok) {
              Logger.log(`[Lite導通確認OK⚡] モデル「${m}」は正常に会話可能ニャ！`, "success");
            } else {
              Logger.log(`[Lite導通確認] モデル「${m}」HTTP ${r.status}`, "warn");
            }
          } catch(e) {
            Logger.log(`[Lite導通確認例外] ${m}: ${e.message}`, "error");
          }
        }
        Toast.show("Lite検証完了！ログを確認してニャ🐾", "success");
      };
    }

    const btnCopyEvidence = document.getElementById('diag-copy-evidence-btn');
    if (btnCopyEvidence) {
      btnCopyEvidence.onclick = () => {
        const text = Logger.getEvidenceText();
        if (!text) {
          Toast.show("コピーするログがありませんニャ", "error");
          return;
        }
        navigator.clipboard.writeText(text).then(() => {
          Toast.show("ログ全文をコピーしたニャ！📋✨", "success");
        }).catch(() => {
          Toast.show("手動でコピーしてニャ🐾", "error");
        });
      };
    }

    const snackBtn = document.getElementById('snack-btn');
    if (snackBtn) {
      snackBtn.onclick = (e) => {
        e.stopPropagation();
        this.audio.unlockMasterAudio();
        this.state.snackCount++;
        this.audio.playEffect('snack');
        if (this.avatar) this.avatar.setEmotion('happy');

        if (this.state.snackCount >= 3) {
          this.state.snackCount = 0;
          this.audio.playEffect('purr');
          const msg = "ハフハフ…うまうまニャ！お腹いっぱい大満足ニャ〜極楽ニャン♡";
          this.audio.speak(msg, null, () => {
            this.renderBubble('model', msg);
            StorageManager.appendChatLog('model', msg);
            if (this.avatar) this.avatar.setEmotion('talking');
          }, () => {
            if (this.avatar) this.avatar.setEmotion('idle');
          });
        } else {
          const reps = ["もぐもぐ…ちゅ〜る最高ニャ！🐟", "うまうまニャン！おかわり希望ニャ🐾"];
          const r = reps[Math.floor(Math.random() * reps.length)];
          this.audio.speak(r, null, () => {
            this.renderBubble('model', r);
            StorageManager.appendChatLog('model', r);
            if (this.avatar) this.avatar.setEmotion('talking');
          }, () => {
            if (this.avatar) this.avatar.setEmotion('idle');
          });
        }
      };
    }

    const transformBtn = document.getElementById('transform-btn');
    if (transformBtn) {
      transformBtn.onclick = (e) => {
        e.stopPropagation();
        this.audio.unlockMasterAudio();
        this.audio.playEffect('poof');
        if (this.avatar) {
          this.avatar.triggerPoofSmoke();
          const next = (this.avatar.mode === 'vector') ? 'real' : 'vector';
          this.avatar.applyMode(next);
          Toast.show(`姿を変身したニャ！✨（${next === 'real' ? 'リアル写真' : 'イラスト'}）`, 'info');
        }
      };
    }

    const modeBtn = document.getElementById('mode-toggle-btn');
    if (modeBtn) {
      modeBtn.onclick = () => {
        this.state.isAssistantMode = !this.state.isAssistantMode;
        localStorage.setItem('kuro_mode', this.state.isAssistantMode ? 'assistant' : 'pet');
        this._updateModeUI(true);
      };
    }

    const stopBtn = document.getElementById('stop-action-btn');
    if (stopBtn) {
      stopBtn.onclick = () => {
        this.audio.stopReadingAloud();
        this.audio.stopSpeaking();
        this.state.isThinking = false;
        this.state.isProcessingInput = false;
        this.state.isDiaryProcessing = false;
        this.state.isDiaryReading = false;
        this.removeInterimBubble();
        this._updateDiaryReadBtnUI(false);
        if (this.avatar) this.avatar.setEmotion('idle');
        this.triggerActionVoice("はーい！", "🛑 はーい！", 450);
      };
    }

    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) {
      pauseBtn.onclick = () => {
        this.state.isRunning = !this.state.isRunning;
        const icon = document.getElementById('pause-icon');
        const txt = document.getElementById('pause-text');

        if (!this.state.isRunning) {
          pauseBtn.classList.add('is-paused');
          if (icon) icon.textContent = "🛑";
          if (txt) txt.textContent = "お休み中";
          this.audio.stopListening();
          this.audio.stopReadingAloud();
          this.audio.stopSpeaking();
          this.removeInterimBubble();
          this.renderBubble('model', "お昼寝するニャ…💤");
        } else {
          pauseBtn.classList.remove('is-paused');
          if (icon) icon.textContent = "🟢";
          if (txt) txt.textContent = "会話中";
          this.renderBubble('model', "起きたニャ！呼んでニャ🐾");
          this.audio.startListening();
        }
      };
    }

    const avatarWrapper = document.getElementById('avatar-wrapper');
    if (avatarWrapper) {
      avatarWrapper.onclick = (e) => {
        if (e.target.closest('#transform-btn') || e.target.closest('#snack-btn') || e.target.closest('#photo-action-btn')) return;
        this.audio.unlockMasterAudio();
        this.audio.playEffect('purr');
        if (this.avatar) {
          this.avatar.setEmotion('happy');
          setTimeout(() => { if (!this.audio.isSpeaking && !this.audio.isReadingAloud) this.avatar.setEmotion('idle'); }, 1400);
        }
      };
    }

    const speakerSelect = document.getElementById('voice-speaker-select');
    if (speakerSelect) {
      speakerSelect.onchange = (e) => {
        const newSp = parseInt(e.target.value, 10);
        this.audio.prefetchVoice("おやびん、わたしはクロだニャン🐾", newSp);
        this.audio.preloadAllFillers(newSp);
      };
    }

    const voiceTestBtn = document.getElementById('test-voice-btn');
    if (voiceTestBtn) {
      voiceTestBtn.onclick = () => {
        this.audio.unlockMasterAudio();
        const selSp = parseInt(document.getElementById('voice-speaker-select')?.value || '10', 10);
        this.audio.speak("おやびん、わたしはクロだニャン🐾", selSp, () => {
          if (this.avatar) this.avatar.setEmotion('talking');
        }, () => {
          if (this.avatar) this.avatar.setEmotion('idle');
        });
      };
    }

    const voiceRateInput = document.getElementById('voice-rate');
    if (voiceRateInput) {
      voiceRateInput.oninput = (e) => {
        const r = parseFloat(e.target.value);
        this.audio.setRate(r);
        const rd = document.getElementById('rate-val');
        if (rd) rd.textContent = r.toFixed(2);
      };
    }

    const btnGetHome = document.getElementById('btn-get-current-home');
    if (btnGetHome) {
      btnGetHome.onclick = () => {
        if (!('geolocation' in navigator)) {
          Toast.show("端末の位置情報機能がオフになっていますニャ", "error");
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            const val = `${pos.coords.latitude.toFixed(5)}, ${pos.coords.longitude.toFixed(5)}`;
            const inp = document.getElementById('home-coords-input');
            if (inp) inp.value = val;
            Toast.show(`現在地の座標をセットしたニャ！(${val})`, "success");
          },
          (err) => {
            Toast.show(`現在地を取得できませんでした: ${err.message}`, "error");
          },
          { enableHighAccuracy: true, timeout: 8000 }
        );
      };
    }

    const btnCopyHome = document.getElementById('btn-copy-home-coords');
    if (btnCopyHome) {
      btnCopyHome.onclick = () => {
        const val = document.getElementById('home-coords-input')?.value.trim();
        if (!val) {
          Toast.show("コピーする座標がありませんニャ", "error");
          return;
        }
        navigator.clipboard.writeText(val).then(() => {
          Toast.show("座標をクリップボードにコピーしたニャ！PCに貼り付けてニャ🐾", "success");
        }).catch(() => {
          Toast.show("手動でコピーしてニャ🐾", "error");
        });
      };
    }

    // ★ 設定画面を開いた時はマイクを停止してノイズや誤動作を防止
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        this.audio.stopListening();

        const ak = document.getElementById('api-key-input');
        const vk = document.getElementById('voicevox-key-input');
        const as = document.getElementById('accessory-style-select');
        const vs = document.getElementById('voice-speaker-select');
        const vr = document.getElementById('voice-rate');
        const rv = document.getElementById('rate-val');
        const hc = document.getElementById('home-coords-input');
        const fb = document.getElementById('button-feedback-select');

        if (ak) ak.value = this.ai.apiKey;
        if (vk) vk.value = localStorage.getItem('kuro_voicevox_key') || '';
        if (as && this.avatar) as.value = this.avatar.accessoryStyle;
        if (vs) vs.value = this.getSpeakerId();
        if (vr) vr.value = this.audio.rate;
        if (rv) rv.textContent = this.audio.rate.toFixed(2);
        if (hc) hc.value = localStorage.getItem('kuro_home_coords') || '';
        if (fb) fb.value = localStorage.getItem('kuro_button_feedback') || 'voice';

        this._renderMemories();
        const mo = document.getElementById('modal-overlay');
        if (mo) mo.style.display = 'flex';
      };
    }

    const modalOverlay = document.getElementById('modal-overlay');
    if (modalOverlay) {
      modalOverlay.onclick = (e) => {
        if (e.target.id === 'modal-overlay') {
          modalOverlay.style.display = 'none';
          setTimeout(() => { if (this.state.isRunning) this.audio.startListening(); }, 80);
        }
      };
    }

    // ★ 設定保存：800msの十分な安全マージンで画面戻り残響を100%封鎖！
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    if (saveSettingsBtn) {
      saveSettingsBtn.onclick = async () => {
        this.audio.unlockMasterAudio();
        this.audio.stopListening(); // 設定保存中はマイク停止

        const btn = saveSettingsBtn;
        const btnIcon = document.getElementById('save-btn-icon');
        const btnText = document.getElementById('save-btn-text');
        const apiInput = document.getElementById('api-key-input');
        const vvInput = document.getElementById('voicevox-key-input');

        apiInput?.classList.remove('input-error-shake');
        vvInput?.classList.remove('input-error-shake');

        const newApiKey = apiInput?.value.trim() || '';
        const newVvKey = vvInput?.value.trim() || '';
        const newAccStyle = document.getElementById('accessory-style-select')?.value || 'both';
        const newSpeaker = document.getElementById('voice-speaker-select')?.value || '10';
        const newRate = parseFloat(document.getElementById('voice-rate')?.value || '1.05');
        const newFeedback = document.getElementById('button-feedback-select')?.value || 'voice';
        const newNews = document.getElementById('news-count-select')?.value || '2';
        const newSpot = document.getElementById('spot-count-select')?.value || '2';
        const newHome = document.getElementById('home-coords-input')?.value.trim() || '';

        btn.classList.add('is-saving');
        if (btnIcon) btnIcon.innerHTML = `<div class="spinner"></div>`;
        if (btnText) btnText.textContent = "キーを確認中ニャ…";

        if (newApiKey) {
          try {
            const testRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${newApiKey}`);
            if (!testRes.ok) throw new Error("無効なGoogleキー");
          } catch(e) {
            btn.classList.remove('is-saving');
            if (btnIcon) btnIcon.textContent = "⚠️";
            if (btnText) btnText.textContent = "保存できませんでした";
            apiInput?.classList.add('input-error-shake');
            Toast.show("Google APIキーが間違っているニャ！再確認してニャ🐾", "error");
            return;
          }
        }

        if (newVvKey) {
          try {
            const vvRes = await fetch(`https://api.tts.quest/v3/voicevox/synthesis?text=%E3%83%8B%E3%83%A3&speaker=10&key=${encodeURIComponent(newVvKey)}`);
            if (vvRes.ok) {
              const vvData = await vvRes.json();
              if (vvData.isAudioError) throw new Error("無効なVoiceVoxキー");
            } else {
              throw new Error("無効なVoiceVoxキー");
            }
          } catch(e) {
            btn.classList.remove('is-saving');
            if (btnIcon) btnIcon.textContent = "⚠️";
            if (btnText) btnText.textContent = "保存できませんでした";
            vvInput?.classList.add('input-error-shake');
            Toast.show("VoiceVoxキーが無効ニャ！空欄にするか正しいキーを入れてニャ🐾", "error");
            return;
          }
        }

        this.ai.apiKey = newApiKey;
        localStorage.setItem('kuro_api_key', newApiKey);
        localStorage.setItem('kuro_voicevox_key', newVvKey);
        localStorage.setItem('kuro_voice_speaker_id', newSpeaker);
        localStorage.setItem('kuro_button_feedback', newFeedback);
        localStorage.setItem('kuro_news_count', newNews);
        localStorage.setItem('kuro_spot_count', newSpot);
        localStorage.setItem('kuro_home_coords', newHome);

        this.audio.setRate(newRate);
        if (this.avatar) this.avatar.applyAccessoryStyle(newAccStyle);

        LocationProvider._applyHomeFallback();

        btn.classList.remove('is-saving');
        btn.classList.add('is-success');
        if (btnIcon) btnIcon.textContent = "✅";

        let successMessage = "✅ 設定バッチリ保存したニャン♪";
        if (newApiKey && newVvKey) {
          successMessage = "Google AI & VoiceVox ともに接続OKニャン♪";
        } else if (newApiKey) {
          successMessage = "Google AI接続OKニャン♪（音声は無料共有枠）";
        }
        if (btnText) btnText.textContent = successMessage;

        setTimeout(() => {
          if (modalOverlay) modalOverlay.style.display = 'none';
          btn.classList.remove('is-success');
          if (btnIcon) btnIcon.textContent = "💾";
          if (btnText) btnText.textContent = "設定と記憶を保存するニャン♪";
          Toast.show(successMessage, "success");
          // ★ 設定保存ボイスは800ms指定で発話（画面戻りの残響を100%遮断！）
          this.triggerActionVoice("バッチリニャ！", "💾 バッチリニャ！", 800);
        }, 1200);
      };
    }

    const addMemoryBtn = document.getElementById('add-memory-btn');
    if (addMemoryBtn) {
      addMemoryBtn.onclick = () => {
        const inp = document.getElementById('new-memory-input');
        const val = inp?.value.trim();
        if (val) {
          this.memories.unshift(val);
          StorageManager.saveMemories(this.memories);
          inp.value = '';
          this._renderMemories();
        }
      };
    }

    const openDiagBtn = document.getElementById('open-diag-modal-btn');
    if (openDiagBtn) {
      openDiagBtn.onclick = () => {
        if (modalOverlay) modalOverlay.style.display = 'none';
        document.getElementById('diag-panel')?.classList.add('expanded');
      };
    }
    const closeDiagBtn = document.getElementById('diag-close-btn');
    if (closeDiagBtn) {
      closeDiagBtn.onclick = () => {
        document.getElementById('diag-panel')?.classList.remove('expanded');
      };
    }
  }
};

window.addEventListener('load', () => AppCore.init());


