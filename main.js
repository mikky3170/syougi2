/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   【ファイル 3 / 3：main.js - 本丸合戦・盤面UI制御完全版】
   ========================================================= */

/* 音響エンジン */
let audioCtx = null, soundEnabled = true, isPageHidden = false;
let realKomaAudioBuffer = null, realKomaAudioElement = null;

function preloadRealKomaSound() {
  try {
    realKomaAudioElement = new Audio('koma_sound.wav');
    realKomaAudioElement.preload = 'auto';
    realKomaAudioElement.volume = 0.95;
  } catch(e) { realKomaAudioElement = null; }

  const isLocal = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:');
  if (!isLocal && window.fetch && (window.AudioContext || window.webkitAudioContext)) {
    fetch('koma_sound.wav')
      .then(res => { if (!res.ok) throw new Error(); return res.arrayBuffer(); })
      .then(buf => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx.decodeAudioData(buf);
      })
      .then(decoded => { realKomaAudioBuffer = decoded; })
      .catch(() => { realKomaAudioBuffer = null; });
  }
}
preloadRealKomaSound();

const bgmAudio = document.getElementById('bgm-audio');
if (bgmAudio) bgmAudio.volume = 0.35;
const BGM_TRACKS = { normal: 'nobunaga_song.mp3', rivalry: 'nobunaga_song.mp3', boss: 'nobunaga_song.mp3' };
let currentBgmTrack = 'normal';

function updateWarlordBGM(level) {
  let target = (level >= 8) ? 'boss' : ((level >= 6) ? 'rivalry' : 'normal');
  if (currentBgmTrack === target) return;
  currentBgmTrack = target;
  if (bgmAudio && soundEnabled && !isPageHidden) {
    bgmAudio.src = BGM_TRACKS[target] || 'nobunaga_song.mp3';
    bgmAudio.play().catch(() => {});
  }
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended' && !isPageHidden) audioCtx.resume();
  if (!isPageHidden && soundEnabled && bgmAudio && bgmAudio.paused) bgmAudio.play().catch(() => {});
}

function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('sound-toggle');
  if (btn) btn.textContent = `♪ ${soundEnabled ? '奏楽入' : '奏楽切'}`;
  if (soundEnabled) { initAudio(); playUiClickSound(); if (bgmAudio) bgmAudio.play().catch(() => {}); }
  else if (bgmAudio) { bgmAudio.pause(); }
}

function playPieceSound() {
  if (!soundEnabled || isPageHidden) return;
  initAudio();
  if (audioCtx && realKomaAudioBuffer) {
    try {
      const src = audioCtx.createBufferSource();
      src.buffer = realKomaAudioBuffer; src.connect(audioCtx.destination); src.start(0); return;
    } catch(e) {}
  }
  if (realKomaAudioElement) {
    try {
      realKomaAudioElement.currentTime = 0;
      realKomaAudioElement.play().catch(() => playSynthesizedKomaSound());
      return;
    } catch(e) {}
  }
  playSynthesizedKomaSound();
}

function playUiClickSound() {
  if (!soundEnabled || isPageHidden || !audioCtx) return;
  try {
    const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), g = audioCtx.createGain();
    osc.type = 'sine'; osc.frequency.setValueAtTime(620, now); osc.frequency.exponentialRampToValueAtTime(140, now + 0.038);
    g.gain.setValueAtTime(0.12, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.038);
    osc.connect(g); g.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.038);
  } catch(e) {}
}

function playSynthesizedKomaSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    const size = Math.floor(audioCtx.sampleRate * 0.035);
    const buf = audioCtx.createBuffer(1, size, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (size * 0.22));
    const node = audioCtx.createBufferSource(); node.buffer = buf;
    const flt = audioCtx.createBiquadFilter(); flt.type = 'bandpass'; flt.frequency.setValueAtTime(420, now); flt.Q.setValueAtTime(3.0, now);
    const gain = audioCtx.createGain(); gain.gain.setValueAtTime(0.85, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    node.connect(flt); flt.connect(gain); gain.connect(audioCtx.destination); node.start(now);
  } catch(e) {}
}

function playCheckSound() {
  if (!soundEnabled || isPageHidden) return; initAudio();
  const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), g = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(110, now); osc.frequency.exponentialRampToValueAtTime(38, now + 0.5);
  g.gain.setValueAtTime(0.7, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc.connect(g); g.connect(audioCtx.destination); osc.start(now); osc.stop(now + 0.55);
}

function playVictorySound() {
  if (!soundEnabled || isPageHidden) return; initAudio();
  const now = audioCtx.currentTime;
  [{f:220,t:0.0,d:0.18},{f:261,t:0.16,d:0.18},{f:293,t:0.32,d:0.22},{f:392,t:0.52,d:0.30},{f:440,t:0.78,d:0.75}].forEach(m => {
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(m.f, now + m.t);
    g.gain.setValueAtTime(0.0, now + m.t); g.gain.linearRampToValueAtTime(0.25, now + m.t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + m.t + m.d);
    osc.connect(g); g.connect(audioCtx.destination); osc.start(now + m.t); osc.stop(now + m.t + m.d);
  });
}

function triggerCutin(text, isSpecial = false, isRivalry = false) {
  playUiClickSound();
  const slot = document.getElementById('cutin-slot'), banner = document.getElementById('cutin-banner'), textEl = document.getElementById('cutin-text');
  if (!slot || !banner || !textEl) return;
  textEl.textContent = text;
  banner.classList.toggle('rivalry', isRivalry);
  slot.classList.add('cutin-active');
  setTimeout(() => slot.classList.remove('cutin-active'), isSpecial ? 3500 : (isRivalry ? 3000 : 1800));
}

/* 祝勝花火 */
const canvasCelebration = document.getElementById('celebration-canvas');
const ctxCelebration = canvasCelebration.getContext('2d');
function launchFireworksCelebration() {
  canvasCelebration.width = window.innerWidth; canvasCelebration.height = window.innerHeight;
  let particles = [];
  for (let i = 0; i < 90; i++) {
    particles.push({
      x: canvasCelebration.width / 2, y: canvasCelebration.height * 0.4,
      vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
      col: ['#ffd700', '#ff3b30', '#ffffff', '#ff9500'][Math.floor(Math.random() * 4)],
      alpha: 1, size: Math.random() * 3 + 2
    });
  }
  let st = Date.now();
  function loop() {
    ctxCelebration.clearRect(0, 0, canvasCelebration.width, canvasCelebration.height);
    particles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.alpha -= 0.015;
      if (p.alpha > 0) {
        ctxCelebration.fillStyle = p.col; ctxCelebration.globalAlpha = p.alpha;
        ctxCelebration.beginPath(); ctxCelebration.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctxCelebration.fill();
      }
    });
    if (Date.now() - st < 3500) requestAnimationFrame(loop);
    else ctxCelebration.clearRect(0, 0, canvasCelebration.width, canvasCelebration.height);
  }
  loop();
}

/* 思考Worker初期化 */
let aiWorker = null;
function initAiWorker() {
  if (aiWorker) aiWorker.terminate();
  try {
    aiWorker = new Worker('ai_engine.js');
    aiWorker.onmessage = handleWorkerMessage;
  } catch(e) { aiWorker = null; }
}
initAiWorker();

/* ゲーム状態変数群 */
let currentMyWarlordId = 'sanada', currentAiLevel = 1, clearedProvinces = [];
let board = [], hands = { PLAYER: {}, AI: {} }, turn = null, isGameOver = true;
let selectedPos = null, currentValidMoves = [], moveObjectsHistory = [], historyStates = [], reviewingIndex = -1, evalScoresHistory = [0];
let hintSourceCell = null, hintTargetCell = null, pendingMove = null, isAiThinking = false, isHintThinking = false;
let boardHashHistory = [], checkHistory = [], lastMove = null;

let hintUsedCount = 0, awakenedHintCount = 0, battleStartTurn = 'PLAYER';
let tacticsCandidates = [], currentTacticIndex = 0, isCurrentHintAwakened = false;

let autoReplayTimer = null, isAutoReplaying = false;
const REPLAY_SPEEDS = [1500, 750, 350], REPLAY_SPEED_LABELS = ['1x', '2x', '4x'];
let replaySpeedIndex = 0;

let isPastReplayActive = false, savedActiveBattle = null;
let isExhibitionActive = false, exhibitionTimer = null, exhibitionSafetyTimer = null, exhibitionSpeed = 'normal';
const EXHIBITION_DELAYS = { normal: 1200, fast: 650 };
const EXHIBITION_TIME_LIMITS = { normal: 8500, fast: 2500 };
let exhibitionSenteTarget = 'lvl_1', exhibitionGoteTarget = 'lvl_10', exhibitionRandomStrategistWarlordKey = 'sanada';
let exhibitionMobileCurrentTab = 'sente';
let exhibitionAchievedDepth = 1, exhibitionTargetDepth = 3;

let moveMetricsHistory = [], isPieceAnimating = false, currentHistoryTab = 'player';
let turnStartTime = 0, turnTimerInterval = null, currentThinkingSide = 'PLAYER';
let totalTimeSpentMs = { PLAYER: 0, AI: 0 }, movesCountBySide = { PLAYER: 0, AI: 0 };
let lastSettledMoveInfo = { PLAYER: null, AI: null };

/* 音声朗読（Web Speech API）制御 */
let currentVoiceGender = 'male', isSpeakingActive = false, currentReadingCardId = null;

function setGuideVoiceGender(gender) {
  playUiClickSound(); currentVoiceGender = gender;
  document.getElementById('btn-voice-male').classList.toggle('active', gender === 'male');
  document.getElementById('btn-voice-female').classList.toggle('active', gender === 'female');
  if (isSpeakingActive) stopGuideSpeech();
}

function stopGuideSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  isSpeakingActive = false;
  if (currentReadingCardId) {
    const card = document.getElementById(currentReadingCardId);
    if (card) {
      card.classList.remove('reading-active');
      const b = card.querySelector('.card-speech-btn'); if (b) b.textContent = '🔊 朗読';
    }
    currentReadingCardId = null;
  }
}

function toggleCardSpeech(cardId) {
  initAudio(); playUiClickSound();
  if (isSpeakingActive && currentReadingCardId === cardId) { stopGuideSpeech(); return; }
  stopGuideSpeech();

  const card = document.getElementById(cardId); if (!card) return;
  const clone = card.cloneNode(true);
  const btn = clone.querySelector('.card-speech-btn'); if (btn) btn.remove();
  let txt = clone.innerText.replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ').trim();
  txt = txt.replace(/([１-９1-9])([一二三四五六七八九])/g, '$1$2 ').replace(/▲/g, 'せんて ').replace(/☗/g, 'せんて ').replace(/△/g, 'ごて ').replace(/☖/g, 'ごて ');

  if (!window.speechSynthesis) { alert('お使いの環境は音声朗読に対応しておりません。'); return; }

  const uttr = new SpeechSynthesisUtterance(txt);
  uttr.lang = 'ja-JP';
  uttr.pitch = (currentVoiceGender === 'male') ? 0.85 : 1.25;
  uttr.rate = 1.0;

  const voices = window.speechSynthesis.getVoices();
  const jpVoices = voices.filter(v => v.lang.includes('ja') || v.lang.includes('JP'));
  if (jpVoices.length > 0) {
    if (currentVoiceGender === 'male') {
      uttr.voice = jpVoices.find(v => v.name.includes('Male') || v.name.includes('Ichiro') || v.name.includes('Otoya')) || jpVoices[0];
    } else {
      uttr.voice = jpVoices.find(v => v.name.includes('Female') || v.name.includes('Kyoko') || v.name.includes('Ayumi') || v.name.includes('Nanami')) || jpVoices[0];
    }
  }

  card.classList.add('reading-active');
  currentReadingCardId = cardId;
  const triggerBtn = card.querySelector('.card-speech-btn'); if (triggerBtn) triggerBtn.textContent = '⏹ 停止';
  isSpeakingActive = true;

  uttr.onend = () => stopGuideSpeech();
  uttr.onerror = () => stopGuideSpeech();
  window.speechSynthesis.speak(uttr);
}

/* 棋譜・時間フォーマット */
function formatTimeMinutesSeconds(totalSec) {
  const m = Math.floor(totalSec / 60), s = Math.floor(totalSec % 60);
  return m === 0 ? `${s}秒` : `${m}分${s.toString().padStart(2, '0')}秒`;
}

function formatOfficialKifuMove(m, idx, isKifFile = false) {
  if (!m) return '';
  const isSenteMove = (m.owner === (battleStartTurn === 'PLAYER' ? 'PLAYER' : 'AI'));
  const markChar = isSenteMove ? '☗' : '☖';
  const rawCode = m.code || 'FU';
  const pieceName = KIF_PIECE_NAMES[rawCode] || '歩';

  let isSame = false;
  if (idx > 0 && moveObjectsHistory[idx - 1]) {
    const prev = moveObjectsHistory[idx - 1];
    if (prev.to.r === m.to.r && prev.to.c === m.to.c) isSame = true;
  }
  const squareTxt = isSame ? '同　' : `${ZENKAKU_NUMS[8 - m.to.c]}${KANJI_NUMS[m.to.r]}`;

  let actionTxt = '';
  if (m.type === 'drop') {
    actionTxt = `${pieceName}打`;
  } else {
    const fromCoord = `(${9 - m.from.c}${m.from.r + 1})`;
    if (m.promote) {
      actionTxt = `${pieceName}成${fromCoord}`;
    } else {
      const canP = PROMOTE_MAP[rawCode] && (m.owner === 'AI' ? (m.from.r >= 6 || m.to.r >= 6) : (m.from.r <= 2 || m.to.r <= 2));
      actionTxt = `${pieceName}${canP ? '不成' : ''}${fromCoord}`;
    }
  }
  return isKifFile ? `${squareTxt}${actionTxt}` : `${markChar}${squareTxt}${actionTxt}`;
}

function getTargetAIData(targetKey) {
  if (INSTRUCTORS_DATA[targetKey]) return INSTRUCTORS_DATA[targetKey];
  if (targetKey && targetKey.startsWith('lvl_')) {
    const lvl = parseInt(targetKey.replace('lvl_', ''), 10);
    return WARLORDS_DATA[lvl];
  }
  if (targetKey === 'strategist') {
    const p = PLAYER_WARLORDS[exhibitionRandomStrategistWarlordKey] || PLAYER_WARLORDS['sanada'];
    return {
      id: `strategist_${p.id}`, name: `${p.name}（軍師:${p.strategistShort}）`,
      clan: `${p.clan} ｜ 神算鬼謀・軍師AI`, maxTroops: 180000, baseTroops: 180000, targetDepth: 5,
      depthSpec: `深さ5＋${p.strategistShort}の神算鬼謀`, featureShort: '豪快傾奇・変幻自在の奇襲',
      strategistImgId: p.strategistImgId, customImg: `images/${p.strategistImgId}`,
      quotes: p.quotes, portraitSvg: p.portraitSvg
    };
  }
  return WARLORDS_DATA[1];
}

function getPlayerMaxTroops() {
  if (isExhibitionActive) {
    const data = getTargetAIData(exhibitionSenteTarget);
    return data.baseTroops || data.maxTroops || 10000;
  }
  const base = PLAYER_WARLORDS[currentMyWarlordId]?.baseTroops || 3000;
  let bonus = 0;
  clearedProvinces.forEach(lvl => {
    bonus += Math.round(((WARLORDS_DATA[lvl]?.maxTroops || 0) * 0.40) / 500) * 500;
  });
  return base + bonus;
}

function getAiMaxTroops() {
  if (isExhibitionActive) {
    const data = getTargetAIData(exhibitionGoteTarget);
    return data.maxTroops || data.baseTroops || 10000;
  }
  return WARLORDS_DATA[currentAiLevel]?.maxTroops || 3000;
}

function calculateTroopsPercentages(bd, hd) {
  let pLost = 0, aiLost = 0;
  for (const c in hd.AI) pLost += (hd.AI[c] || 0) * (PIECE_WEIGHTS[c] || 1.5);
  for (const c in hd.PLAYER) aiLost += (hd.PLAYER[c] || 0) * (PIECE_WEIGHTS[c] || 1.5);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = bd[r][c]; if (!p) continue;
      if (p.owner === 'PLAYER') {
        if (p.code === 'RY') aiLost += 7; else if (p.code === 'UM') aiLost += 5;
        else if (r <= 2 && PROMOTED_PIECES.includes(p.code)) aiLost += 3;
      } else {
        if (p.code === 'RY') pLost += 7; else if (p.code === 'UM') pLost += 5;
        else if (r >= 6 && PROMOTED_PIECES.includes(p.code)) pLost += 3;
      }
    }
  }

  if (isCheckState('PLAYER', bd)) pLost += 20;
  if (isCheckState('AI', bd)) aiLost += 20;

  return {
    pPct: Math.max(25, Math.min(100, Math.round(100 - (pLost / TOTAL_FORCE_POINTS) * 75))),
    aiPct: Math.max(25, Math.min(100, Math.round(100 - (aiLost / TOTAL_FORCE_POINTS) * 75)))
  };
}

/* 盤面ルール判定関数群 */
function getValidBoardMoves(r, c, owner, targetBoard = board) {
  const item = targetBoard[r][c]; if (!item) return [];
  const dir = owner === 'AI' ? 1 : -1, moves = [];
  const canT = (nr, nc) => !targetBoard[nr][nc] || targetBoard[nr][nc].owner !== owner;
  const ray = dirs => dirs.forEach(([dr, dc]) => {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      if (!targetBoard[nr][nc]) moves.push({r: nr, c: nc});
      else { if (canT(nr, nc)) moves.push({r: nr, c: nc}); break; }
      nr += dr; nc += dc;
    }
  });
  const step = offs => offs.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && canT(nr, nc)) moves.push({r: nr, c: nc});
  });
  const gold = [[dir, -1], [dir, 0], [dir, 1], [0, -1], [0, 1], [-dir, 0]];
  switch(item.code) {
    case 'FU': step([[dir, 0]]); break;
    case 'KY': ray([[dir, 0]]); break;
    case 'KE': step([[dir * 2, -1], [dir * 2, 1]]); break;
    case 'GI': step([[dir, -1], [dir, 0], [dir, 1], [-dir, -1], [-dir, 1]]); break;
    case 'KI': case 'TO': case 'NY': case 'NK': case 'NG': step(gold); break;
    case 'OU': step([[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]); break;
    case 'HI': ray([[-1,0],[1,0],[0,-1],[0,1]]); break;
    case 'KA': ray([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
    case 'RY': ray([[-1,0],[1,0],[0,-1],[0,1]]); step([[-1,-1],[-1,1],[1,-1],[1,1]]); break;
    case 'UM': ray([[-1,-1],[-1,1],[1,-1],[1,1]]); step([[-1,0],[1,0],[0,-1],[0,1]]); break;
  }
  return moves;
}

function findKing(owner, targetBoard = board) {
  for (let r=0; r<9; r++) for (let c=0; c<9; c++) if (targetBoard[r][c]?.owner === owner && targetBoard[r][c]?.code === 'OU') return {r, c};
  return null;
}

function isCheckState(owner, targetBoard = board) {
  const kp = findKing(owner, targetBoard); if (!kp) return false;
  const enemy = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
  for (let r=0; r<9; r++) {
    for (let c=0; c<9; c++) {
      if (targetBoard[r][c]?.owner === enemy) {
        if (getValidBoardMoves(r, c, enemy, targetBoard).some(m => m.r === kp.r && m.c === kp.c)) return true;
      }
    }
  }
  return false;
}

function checkGameOverState(owner, targetBoard = board) {
  for (let r=0; r<9; r++) for (let c=0; c<9; c++) if (targetBoard[r][c]?.owner === owner && targetBoard[r][c]?.code === 'OU') return false;
  return true;
}

function makeMove(m) {
  const undo = { m };
  if (m.type === 'drop') {
    hands[m.owner][m.code]--;
    board[m.to.r][m.to.c] = { code: m.code, owner: m.owner };
  } else {
    const item = board[m.from.r][m.from.c], target = board[m.to.r][m.to.c];
    undo.fromCode = item.code;
    if (target) {
      undo.cap = target.code;
      if (target.code !== 'OU') hands[m.owner][UNPROMOTE_MAP[target.code]] = (hands[m.owner][UNPROMOTE_MAP[target.code]] || 0) + 1;
    }
    if (m.promote) item.code = PROMOTE_MAP[item.code];
    board[m.to.r][m.to.c] = item;
    board[m.from.r][m.from.c] = null;
  }
  return undo;
}

function unmakeMove(undo) {
  const m = undo.m;
  if (m.type === 'drop') {
    hands[m.owner][m.code]++;
    board[m.to.r][m.to.c] = null;
  } else {
    const item = board[m.to.r][m.to.c];
    item.code = undo.fromCode;
    board[m.from.r][m.from.c] = item;
    if (undo.cap) {
      board[m.to.r][m.to.c] = { code: undo.cap, owner: m.owner === 'AI' ? 'PLAYER' : 'AI' };
      if (undo.cap !== 'OU') hands[m.owner][UNPROMOTE_MAP[undo.cap]]--;
    } else board[m.to.r][m.to.c] = null;
  }
}

function getLegalMoves(owner) {
  const pseudo = [];
  for (let r=0; r<9; r++) {
    for (let c=0; c<9; c++) {
      if (board[r][c]?.owner === owner) {
        const item = board[r][c];
        getValidBoardMoves(r, c, owner).forEach(m => {
          const target = board[m.r][m.c], isCap = (target && target.owner !== owner);
          const inCamp = (owner === 'AI' ? (r >= 6 || m.r >= 6) : (r <= 2 || m.r <= 2));
          const canP = PROMOTE_MAP[item.code] && inCamp;
          const mustP = owner === 'AI' ? ((item.code === 'FU' || item.code === 'KY') && m.r === 8 || (item.code === 'KE' && m.r >= 7))
                                       : ((item.code === 'FU' || item.code === 'KY') && m.r === 0 || (item.code === 'KE' && m.r <= 1));
          if (mustP) pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: true, isCap });
          else if (canP) {
            pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: true, isCap });
            pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: false, isCap });
          } else pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: false, isCap });
        });
      }
    }
  }

  for (const code in hands[owner]) if (hands[owner][code] > 0) {
    for (let r=0; r<9; r++) {
      if ((code === 'FU' || code === 'KY') && ((owner === 'AI' && r === 8) || (owner === 'PLAYER' && r === 0))) continue;
      if (code === 'KE' && ((owner === 'AI' && r >= 7) || (owner === 'PLAYER' && r <= 1))) continue;
      for (let c=0; c<9; c++) {
        if (!board[r][c]) {
          if (code === 'FU') {
            let nifu = false;
            for(let kr=0; kr<9; kr++) if (board[kr][c]?.owner === owner && board[kr][c]?.code === 'FU') { nifu = true; break; }
            if (nifu) continue;
          }
          pseudo.push({ type: 'drop', code, to: {r, c}, owner, isCap: false });
        }
      }
    }
  }

  return pseudo.filter(m => {
    const undo = makeMove(m);
    const safe = !isCheckState(owner);
    unmakeMove(undo);
    return safe;
  });
}

function cloneBoardState(b) { return b.map(row => row.map(cell => cell ? {...cell} : null)); }
function getBoardHash(b, h, t) {
  let s = t + ':';
  for(let r=0; r<9; r++) for(let c=0; c<9; c++) {
    const p = b[r][c]; if (p) s += `${r}${c}${p.code}${p.owner[0]}|`;
  }
  for (const ow of ['PLAYER','AI']) for (const k in h[ow]) {
    if (h[ow][k] > 0) s += `${ow[0]}${k}${h[ow][k]}`;
  }
  return s;
}

function updateTurnLabels() {
  const pDock = document.getElementById('player-dock-label');
  const aiDock = document.getElementById('ai-dock-label');
  const pNameEl = document.getElementById('player-name-disp');
  const aiNameEl = document.getElementById('ai-name-disp');

  if (isExhibitionActive) {
    const sData = getTargetAIData(exhibitionSenteTarget);
    const gData = getTargetAIData(exhibitionGoteTarget);
    if (pDock) pDock.innerHTML = `☗ 先手陣`;
    if (aiDock) aiDock.innerHTML = `☖ 後手陣`;
    if (pNameEl) pNameEl.innerHTML = `☗ ${getWarlordDisplayNameHtml(sData)}`;
    if (aiNameEl) aiNameEl.innerHTML = `☖ ${getWarlordDisplayNameHtml(gData)}`;
    return;
  }
  const p = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];
  const w = WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1];
  const isSente = (battleStartTurn === 'PLAYER');
  if (pDock) pDock.innerHTML = `${isSente ? '☗' : '☖'} 自駒`;
  if (aiDock) aiDock.innerHTML = `${isSente ? '☖' : '☗'} 敵駒`;
  if (pNameEl) pNameEl.innerHTML = `${isSente ? '☗' : '☖'} ${p.name}`;
  if (aiNameEl) aiNameEl.innerHTML = `${isSente ? '☖' : '☗'} ${w.name}`;
}

function updateTurnFocus(activeTurn) {
  const pPanel = document.getElementById('player-panel'), aiPanel = document.getElementById('ai-panel');
  if (pPanel) pPanel.classList.toggle('turn-focus-player', activeTurn === 'PLAYER');
  if (aiPanel) aiPanel.classList.toggle('turn-focus-enemy', activeTurn === 'AI');
}

function clearWarlordResultPlaques() {
  const pP = document.getElementById('player-result-plaque'), aiP = document.getElementById('ai-result-plaque');
  const pPan = document.getElementById('player-panel'), aiPan = document.getElementById('ai-panel');
  if (pP) { pP.style.display = 'none'; pP.className = 'warlord-result-plaque'; }
  if (aiP) { aiP.style.display = 'none'; aiP.className = 'warlord-result-plaque'; }
  if (pPan) pPan.classList.remove('is-victor', 'is-vanquished');
  if (aiPan) aiPan.classList.remove('is-victor', 'is-vanquished');
}

function showWarlordResultPlaque(winnerSide) {
  clearWarlordResultPlaques();
  const pP = document.getElementById('player-result-plaque'), aiP = document.getElementById('ai-result-plaque');
  const pPan = document.getElementById('player-panel'), aiPan = document.getElementById('ai-panel');
  const winTxt = isExhibitionActive ? '【勝者】' : '【大勝利】';
  const loseTxt = isExhibitionActive ? '【敗者】' : '【本陣陥落】';

  if (winnerSide === 'PLAYER') {
    if (pP) { pP.textContent = winTxt; pP.className = 'warlord-result-plaque plaque-win'; pP.style.display = 'inline-flex'; }
    if (aiP) { aiP.textContent = loseTxt; aiP.className = 'warlord-result-plaque plaque-lose'; aiP.style.display = 'inline-flex'; }
    if (pPan) pPan.classList.add('is-victor');
    if (aiPan) aiPan.classList.add('is-vanquished');
  } else {
    if (aiP) { aiP.textContent = winTxt; aiP.className = 'warlord-result-plaque plaque-win'; aiP.style.display = 'inline-flex'; }
    if (pP) { pP.textContent = loseTxt; pP.className = 'warlord-result-plaque plaque-lose'; pP.style.display = 'inline-flex'; }
    if (aiPan) aiPan.classList.add('is-victor');
    if (pPan) pPan.classList.add('is-vanquished');
  }
}

/* タイマー制御（完全修正：御前試合対応＆永久進行防止） */
function startTurnTimer(side) {
  stopTurnTimer();
  currentThinkingSide = side;
  turnStartTime = Date.now();
  updateTurnFocus(side);
  updateThinkingTimerDisplay();
  turnTimerInterval = setInterval(updateThinkingTimerDisplay, 100);
}

function stopTurnTimer() {
  if (turnTimerInterval) { clearInterval(turnTimerInterval); turnTimerInterval = null; }
  const pDisp = document.getElementById('player-thinking-disp'), aiDisp = document.getElementById('ai-thinking-disp');
  if (pDisp) pDisp.style.display = 'none';
  if (aiDisp) aiDisp.style.display = 'none';
}

function updateThinkingTimerDisplay() {
  if (isGameOver || isReviewingPast()) return;
  const elapsedSec = Math.max(0.1, (Date.now() - turnStartTime) / 1000).toFixed(1);
  const pDisp = document.getElementById('player-thinking-disp'), aiDisp = document.getElementById('ai-thinking-disp');

  if (currentThinkingSide === 'PLAYER') {
    if (pDisp) {
      pDisp.style.display = 'inline-flex'; pDisp.className = 'warlord-thinking-inline timer-gold-box';
      if (isExhibitionActive) {
        const sData = getTargetAIData(exhibitionSenteTarget);
        pDisp.innerHTML = `☗ ${sData.name}思考 <b>${elapsedSec}秒</b>`;
      } else {
        pDisp.innerHTML = `🪭 采配思案 <b>${elapsedSec}秒</b>`;
      }
    }
    if (aiDisp) {
      if (lastSettledMoveInfo.AI) {
        aiDisp.style.display = 'inline-flex'; aiDisp.className = 'warlord-thinking-inline timer-confirmed-box';
        aiDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo.AI.timeSec}秒</b> (深さ${lastSettledMoveInfo.AI.depth})`;
      } else aiDisp.style.display = 'none';
    }
  } else {
    if (aiDisp) {
      aiDisp.style.display = 'inline-flex'; aiDisp.className = 'warlord-thinking-inline timer-gold-box';
      const curD = Math.max(1, exhibitionAchievedDepth);
      const targetD = isExhibitionActive ? (getTargetAIData(exhibitionGoteTarget).targetDepth || 4) : (WARLORDS_DATA[currentAiLevel]?.targetDepth || 4);
      if (isExhibitionActive) {
        const gData = getTargetAIData(exhibitionGoteTarget);
        aiDisp.innerHTML = `☖ ${gData.name}熟慮 <b>${elapsedSec}秒</b> (深さ ${curD}/${targetD})`;
      } else {
        aiDisp.innerHTML = `🧠 敵将熟慮 <b>${elapsedSec}秒</b> (深さ ${curD}/${targetD})`;
      }
    }
    if (pDisp) {
      if (lastSettledMoveInfo.PLAYER) {
        pDisp.style.display = 'inline-flex'; pDisp.className = 'warlord-thinking-inline timer-confirmed-box';
        pDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo.PLAYER.timeSec}秒</b>`;
      } else pDisp.style.display = 'none';
    }
  }
}

function recordTurnTime(side, customElapsedMs = null) {
  stopTurnTimer();
  const spentMs = (typeof customElapsedMs === 'number' && customElapsedMs > 0) ? customElapsedMs : Math.max(100, Date.now() - turnStartTime);
  totalTimeSpentMs[side] = (totalTimeSpentMs[side] || 0) + spentMs;
  movesCountBySide[side] = (movesCountBySide[side] || 0) + 1;
  return (spentMs / 1000).toFixed(1);
}

/* 再生バー同期管理 */
function isReviewingPast() {
  return isPastReplayActive || (reviewingIndex !== -1 && reviewingIndex !== historyStates.length - 1);
}

function updateReviewModeUI() {
  const isReplay = isReviewingPast();
  const showControls = (isReplay || (isExhibitionActive && isGameOver));

  ['replay-controls-tablet', 'replay-controls-mobile'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = showControls ? 'flex' : 'none';
  });

  const sitBadge = document.getElementById('situation-badge');
  const sitText = document.getElementById('situation-text');
  if (sitBadge && sitText && isReplay) {
    sitBadge.className = 'situation-badge badge-gokaku';
    sitBadge.textContent = '【鑑賞】';
    const curStep = (reviewingIndex >= 0) ? reviewingIndex : (historyStates.length - 1);
    const snap = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex] : historyStates[historyStates.length - 1];
    const { pPct, aiPct } = calculateTroopsPercentages(snap.board, snap.hands);
    const pCur = Math.round(getPlayerMaxTroops() * (pPct / 100));
    const aiCur = Math.round(getAiMaxTroops() * (aiPct / 100));
    sitText.textContent = `第${curStep}手 ［残存兵力：我が軍 ${pCur.toLocaleString()} 兵 vs 敵軍 ${aiCur.toLocaleString()} 兵］`;
  }
}

function toggleAutoReplay() {
  if (isAutoReplaying) stopAutoReplay(); else startAutoReplay();
}

function startAutoReplay() {
  if (historyStates.length <= 1) return;
  initAudio(); isAutoReplaying = true;
  document.querySelectorAll('.btn-auto-replay').forEach(b => { b.innerHTML = '⏸ 停止'; b.classList.add('is-playing'); });

  if (reviewingIndex === historyStates.length - 1 || reviewingIndex === -1) {
    reviewingIndex = 0;
    const snap = historyStates[0];
    board = cloneBoardState(snap.board); hands = JSON.parse(JSON.stringify(snap.hands));
    lastMove = null;
    renderBoard(); updateTroopsAndSituation(); updateReviewModeUI();
  }
  runAutoReplayStep();
}

function runAutoReplayStep() {
  if (!isAutoReplaying) return;
  autoReplayTimer = setTimeout(() => {
    if (!isAutoReplaying) return;
    if (reviewingIndex >= historyStates.length - 1) {
      stopAutoReplay();
      setOrderMessage('合戦絵巻の自動再生が結びとなり候。', false, 'settle');
      return;
    }
    stepReview(1, true);
    runAutoReplayStep();
  }, REPLAY_SPEEDS[replaySpeedIndex]);
}

function stopAutoReplay() {
  if (autoReplayTimer) { clearTimeout(autoReplayTimer); autoReplayTimer = null; }
  isAutoReplaying = false;
  document.querySelectorAll('.btn-auto-replay').forEach(b => { b.innerHTML = '▶ 自動'; b.classList.remove('is-playing'); });
}

function cycleReplaySpeed() {
  playUiClickSound();
  replaySpeedIndex = (replaySpeedIndex + 1) % REPLAY_SPEEDS.length;
  document.querySelectorAll('.btn-replay-speed').forEach(b => { b.textContent = REPLAY_SPEED_LABELS[replaySpeedIndex]; });
  if (isAutoReplaying) {
    if (autoReplayTimer) clearTimeout(autoReplayTimer);
    runAutoReplayStep();
  }
}

function stepReview(dir, isAuto = false) {
  if (historyStates.length <= 1) return;
  if (!isAuto) stopAutoReplay();
  if (!isAuto || replaySpeedIndex === 0) playPieceSound();

  if (reviewingIndex === -1) reviewingIndex = historyStates.length - 1;
  const targetIdx = reviewingIndex + dir;
  if (targetIdx < 0 || targetIdx >= historyStates.length) {
    if (isAuto) stopAutoReplay();
    return;
  }
  reviewingIndex = targetIdx;
  const snap = historyStates[reviewingIndex];
  board = cloneBoardState(snap.board); hands = JSON.parse(JSON.stringify(snap.hands));
  lastMove = (reviewingIndex > 0) ? snap.moveObjectsHistory[snap.moveObjectsHistory.length - 1] : null;

  renderBoard(); updateTroopsAndSituation(); updateReviewModeUI();
  setOrderMessage(`【合戦絵巻鑑賞中】第 ${reviewingIndex} 手目の布陣を再現しております。`, false, 'player');
}

function stepReviewToStart() {
  stopAutoReplay(); if (historyStates.length <= 1) return;
  playUiClickSound(); reviewingIndex = 0;
  const snap = historyStates[0];
  board = cloneBoardState(snap.board); hands = JSON.parse(JSON.stringify(snap.hands));
  lastMove = null;
  renderBoard(); updateTroopsAndSituation(); updateReviewModeUI();
  setOrderMessage('【合戦絵巻鑑賞中】開戦前・初期布陣を表示中。', false, 'player');
}

function stepReviewToEnd() {
  stopAutoReplay(); if (historyStates.length <= 1) return;
  playUiClickSound(); reviewingIndex = historyStates.length - 1;
  const snap = historyStates[reviewingIndex];
  board = cloneBoardState(snap.board); hands = JSON.parse(JSON.stringify(snap.hands));
  lastMove = snap.moveObjectsHistory[snap.moveObjectsHistory.length - 1] || null;
  renderBoard(); updateTroopsAndSituation(); updateReviewModeUI();
  setOrderMessage(`【合戦絵巻鑑賞中】最終手（第 ${reviewingIndex} 手目）の布陣を表示中。`, false, 'player');
}

/* ゲーム初期化 ＆ 復帰制御 */
function initBoardState() {
  stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer();
  if (!isExhibitionActive) isPastReplayActive = false;
  board = Array.from({length: 9}, () => Array(9).fill(null));
  hands = { PLAYER: {}, AI: {} };
  moveObjectsHistory = []; historyStates = []; boardHashHistory = []; checkHistory = [];
  moveMetricsHistory = []; evalScoresHistory = [0]; reviewingIndex = -1; lastMove = null;
  hintSourceCell = null; hintTargetCell = null; selectedPos = null; currentValidMoves = [];
  isAiThinking = false; isHintThinking = false; isPieceAnimating = false;
  tacticsCandidates = []; currentTacticIndex = 0;
  totalTimeSpentMs = { PLAYER: 0, AI: 0 }; movesCountBySide = { PLAYER: 0, AI: 0 };
  exhibitionAchievedDepth = 1; exhibitionTargetDepth = 3;
  lastSettledMoveInfo = { PLAYER: null, AI: null };

  clearWarlordResultPlaques();
  updateTurnFocus(null);
  updateStrategistUI();
  updateWarlordBGM(currentAiLevel);

  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  const playerChangeBtn = document.getElementById('btn-player-change');
  if (enemyChangeBtn) enemyChangeBtn.style.display = isExhibitionActive ? 'none' : 'inline-flex';
  if (playerChangeBtn) playerChangeBtn.style.display = isExhibitionActive ? 'none' : 'inline-flex';

  if (isExhibitionActive) {
    const sData = getTargetAIData(exhibitionSenteTarget);
    const gData = getTargetAIData(exhibitionGoteTarget);
    const sMax = sData.baseTroops || sData.maxTroops || 10000;
    const gMax = gData.maxTroops || gData.baseTroops || 10000;
    document.getElementById('player-name-disp').innerHTML = `☗ ${getWarlordDisplayNameHtml(sData)}`;
    document.getElementById('player-clan-disp').textContent = sData.clan;
    document.getElementById('player-quote-disp').textContent = sData.quotes.default;
    document.getElementById('player-troops-disp').textContent = `${sMax.toLocaleString()} / ${sMax.toLocaleString()} 兵`;

    document.getElementById('ai-name-disp').innerHTML = `☖ ${getWarlordDisplayNameHtml(gData)}`;
    document.getElementById('ai-clan-disp').textContent = gData.clan;
    document.getElementById('ai-quote-disp').textContent = gData.quotes.default;
    document.getElementById('ai-troops-disp').textContent = `${gMax.toLocaleString()} / ${gMax.toLocaleString()} 兵`;
  } else {
    const p = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];
    const w = WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1];
    const pMax = getPlayerMaxTroops();
    document.getElementById('player-name-disp').textContent = p.name;
    document.getElementById('player-clan-disp').textContent = p.clan;
    document.getElementById('player-quote-disp').textContent = p.quotes.default;
    document.getElementById('player-troops-disp').textContent = `${pMax.toLocaleString()} / ${pMax.toLocaleString()} 兵`;

    document.getElementById('ai-name-disp').textContent = w.name;
    document.getElementById('ai-clan-disp').textContent = `${w.clan} (Lv.${currentAiLevel})`;
    document.getElementById('ai-quote-disp').textContent = w.quotes.default;
    document.getElementById('ai-troops-disp').textContent = `${w.maxTroops.toLocaleString()} / ${w.maxTroops.toLocaleString()} 兵`;
  }

  updateTurnLabels();
  renderMainPortraits();
  updateRivalryButton();
  updateReviewModeUI();
  renderDynamicTacticsGuide();

  // 初期配置
  board[0] = [{code:'KY',owner:'AI'},{code:'KE',owner:'AI'},{code:'GI',owner:'AI'},{code:'KI',owner:'AI'},{code:'OU',owner:'AI'},{code:'KI',owner:'AI'},{code:'GI',owner:'AI'},{code:'KE',owner:'AI'},{code:'KY',owner:'AI'}];
  board[1][1] = {code:'KA',owner:'AI'}; board[1][7] = {code:'HI',owner:'AI'};
  for(let c=0; c<9; c++) board[2][c] = {code:'FU',owner:'AI'};
  for(let c=0; c<9; c++) board[6][c] = {code:'FU',owner:'PLAYER'};
  board[7][1] = {code:'KA',owner:'PLAYER'}; board[7][7] = {code:'HI',owner:'PLAYER'};
  board[8] = [{code:'KY',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'OU',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'KY',owner:'PLAYER'}];

  historyStates.push({ board: cloneBoardState(board), hands: JSON.parse(JSON.stringify(hands)), turn, moveObjectsHistory: [] });
  boardHashHistory.push(getBoardHash(board, hands, turn || 'START'));
  renderBoard(); updateTroopsAndSituation();
}

function renderMainPortraits() {
  const pBox = document.getElementById('player-avatar-container');
  const aiBox = document.getElementById('ai-avatar-container');
  if (isExhibitionActive) {
    const sData = getTargetAIData(exhibitionSenteTarget);
    const gData = getTargetAIData(exhibitionGoteTarget);
    if (pBox) pBox.innerHTML = getWarlordPortraitHtml(sData, false);
    if (aiBox) aiBox.innerHTML = getWarlordPortraitHtml(gData, false);
    return;
  }
  const p = PLAYER_WARLORDS[currentMyWarlordId], w = WARLORDS_DATA[currentAiLevel];
  if (pBox) pBox.innerHTML = getWarlordPortraitHtml(p, true, 'player');
  if (aiBox) aiBox.innerHTML = getWarlordPortraitHtml(w, true, 'ai');
}

function updateStrategistUI() {
  const badge = document.getElementById('player-strategist-badge');
  if (isExhibitionActive) { if (badge) badge.style.display = 'none'; return; }
  const p = PLAYER_WARLORDS[currentMyWarlordId];
  if (badge) { badge.style.display = 'inline-block'; badge.textContent = `軍師:${p.strategistShort}`; }
  const hintBtn = document.getElementById('btn-master-hint');
  if (hintBtn) { hintBtn.classList.remove('awakened'); hintBtn.textContent = '💡 軍師進言'; }
}

function updateRivalryButton() {
  const btn = document.getElementById('btn-rivalry-story');
  if (!btn) return;
  const rivalKey = `${currentMyWarlordId}_${currentAiLevel}`;
  btn.style.display = (RIVALRIES[rivalKey] && !isPastReplayActive && !isExhibitionActive) ? 'inline-block' : 'none';
}

function openRivalryInGuide() {
  playUiClickSound(); openGuideModal(); switchGuideTab(4);
  const rivalKey = `${currentMyWarlordId}_${currentAiLevel}`;
  const cardId = `rivalry-card-${rivalKey}`;
  setTimeout(() => {
    const el = document.getElementById(cardId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      el.classList.add('highlight-rivalry-card');
      setTimeout(() => el.classList.remove('highlight-rivalry-card'), 2500);
    }
  }, 200);
}

function renderDynamicTacticsGuide() {
  const container = document.getElementById('dynamic-tactics-content');
  if (!container) return;
  const w = WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1];
  const p = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];
  container.innerHTML = `
    <div class="guide-card-box beginner-highlight-box" id="guide-card-dynamic-intro">
      <div class="guide-card-header-row">
        <h4>⚔ 対【${w.name}】兵法指南（軍師：${p.strategistShort}進言）</h4>
        <button class="card-speech-btn btn-3d" onclick="toggleCardSpeech('guide-card-dynamic-intro')">🔊 朗読</button>
      </div>
      敵将「${w.name}」（${w.clan}）の陣容と気風に対する秘策でござる。<br><br>
      ・<b class="kw-gold">敵の特徴</b>：${w.featureShort}<br>
      ・<b class="kw-crimson">軍師の心得</b>：${w.tacticsHint}<br>
      ・<b class="kw-blue">弱点攻略</b>：${w.tacticsWeakness || '敵の焦りを誘い、カウンターを狙え！'}<br>
      ・<b class="kw-green">おすすめ開戦五手</b>：<span style="letter-spacing:1px; font-weight:900;">${w.tacticsOpenFive || '▲７六歩 ➡ ▲２六歩 ➡ ▲２五歩 ➡ ▲４八銀 ➡ ▲５六歩'}</span>
    </div>
  `;
}

function exitReplayMode() {
  playUiClickSound();
  stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer();

  if (savedActiveBattle) {
    if (savedActiveBattle.isExhibitionActive) {
      isExhibitionActive = true; isPastReplayActive = false;
      exhibitionSenteTarget = savedActiveBattle.exhibitionSenteTarget;
      exhibitionGoteTarget = savedActiveBattle.exhibitionGoteTarget;
      exhibitionSpeed = savedActiveBattle.exhibitionSpeed || 'normal';
      board = cloneBoardState(savedActiveBattle.board); hands = JSON.parse(JSON.stringify(savedActiveBattle.hands));
      turn = savedActiveBattle.turn; battleStartTurn = savedActiveBattle.battleStartTurn || 'PLAYER';
      isGameOver = false;
      moveObjectsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveObjectsHistory));
      historyStates = JSON.parse(JSON.stringify(savedActiveBattle.historyStates));
      evalScoresHistory = JSON.parse(JSON.stringify(savedActiveBattle.evalScoresHistory));
      boardHashHistory = JSON.parse(JSON.stringify(savedActiveBattle.boardHashHistory));
      checkHistory = JSON.parse(JSON.stringify(savedActiveBattle.checkHistory));
      moveMetricsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveMetricsHistory || []));
      lastMove = savedActiveBattle.lastMove; reviewingIndex = historyStates.length - 1;
      savedActiveBattle = null;
      initBoardState();
      renderBoard(); updateTroopsAndSituation(); updateWarlordQuotes(); updateReviewModeUI();
      scheduleNextExhibitionTurn();
    } else {
      currentMyWarlordId = savedActiveBattle.currentMyWarlordId;
      currentAiLevel = savedActiveBattle.currentAiLevel;
      setPlayerWarlord(currentMyWarlordId); selectConquestProvince(currentAiLevel);
      board = cloneBoardState(savedActiveBattle.board); hands = JSON.parse(JSON.stringify(savedActiveBattle.hands));
      turn = savedActiveBattle.turn; battleStartTurn = savedActiveBattle.battleStartTurn || 'PLAYER';
      isGameOver = false;
      moveObjectsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveObjectsHistory));
      historyStates = JSON.parse(JSON.stringify(savedActiveBattle.historyStates));
      evalScoresHistory = JSON.parse(JSON.stringify(savedActiveBattle.evalScoresHistory));
      boardHashHistory = JSON.parse(JSON.stringify(savedActiveBattle.boardHashHistory));
      checkHistory = JSON.parse(JSON.stringify(savedActiveBattle.checkHistory));
      moveMetricsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveMetricsHistory || []));
      lastMove = savedActiveBattle.lastMove; reviewingIndex = historyStates.length - 1;
      savedActiveBattle = null; isPastReplayActive = false; isExhibitionActive = false;
      renderBoard(); updateTroopsAndSituation(); updateWarlordQuotes(); updateReviewModeUI();
      startTurnTimer(turn);
    }
  } else {
    isPastReplayActive = false; isExhibitionActive = false; isGameOver = true;
    setPlayerWarlord(currentMyWarlordId); selectConquestProvince(currentAiLevel); initBoardState();
    setOrderMessage({ line1: '合戦絵巻の鑑賞が結びとなり候。', line2: '「対局開始」を押して新たな合戦を始められよ！' }, false, 'player');
  }
}

/* 盤面レンダリング ＆ 駒操作 */
function renderBoard() {
  const el = document.getElementById('board'); if (!el) return;
  el.innerHTML = '';
  const pKingPos = isCheckState('PLAYER') ? findKing('PLAYER') : null;
  const aiKingPos = isCheckState('AI') ? findKing('AI') : null;

  for(let r=0; r<9; r++) {
    for(let c=0; c<9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell'; cell.dataset.r = r; cell.dataset.c = c;
      const targetP = board[r][c];

      if (lastMove && lastMove.to.r === r && lastMove.to.c === c) cell.classList.add('last-move-to');
      if (selectedPos?.r === r && selectedPos?.c === c) cell.classList.add('selected');
      if (currentValidMoves.some(m => m.r === r && m.c === c)) {
        if (targetP && targetP.owner === 'AI') cell.classList.add('target-capture');
        else cell.classList.add('target-move');
      }
      if ((pKingPos && pKingPos.r === r && pKingPos.c === c) || (aiKingPos && aiKingPos.r === r && aiKingPos.c === c)) cell.classList.add('in-check-king');
      if (hintSourceCell?.r === r && hintSourceCell?.c === c) cell.classList.add('hint-source');
      if (hintTargetCell?.r === r && hintTargetCell?.c === c) cell.classList.add('hint-target');

      if (targetP) {
        const pDiv = document.createElement('div');
        const isProm = PROMOTED_PIECES.includes(targetP.code);
        pDiv.className = `piece ${targetP.owner === 'PLAYER' ? 'player' : 'ai'} ${isProm ? 'promoted' : ''}`;
        const name2 = PIECES[targetP.code];
        pDiv.innerHTML = `<span class="piece-char-top">${name2[0]}</span><span class="piece-char-bottom">${name2[1]}</span>`;
        cell.appendChild(pDiv);
      }
      cell.onclick = () => onCellClick(r, c);
      el.appendChild(cell);
    }
  }

  for (let s = 1; s <= 4; s++) {
    const starEl = document.createElement('div');
    starEl.className = 'board-star'; starEl.id = `star-${s}`;
    el.appendChild(starEl);
  }
  renderHands();
}

function renderHands() {
  ['PLAYER', 'AI'].forEach(ow => {
    const box = document.getElementById(ow === 'PLAYER' ? 'player-hand' : 'ai-hand');
    if (!box) return;
    box.innerHTML = '';
    for(let code in hands[ow]) {
      const cnt = hands[ow][code];
      if (cnt > 0) {
        const d = document.createElement('div');
        d.className = `hand-piece ${ow === 'PLAYER' ? 'player' : 'ai'} ${selectedPos?.handCode === code ? 'selected' : ''}`;
        d.dataset.code = code; d.dataset.owner = ow;
        const name2 = PIECES[code];
        d.innerHTML = `<span class="piece-char-top">${name2[0]}</span><span class="piece-char-bottom">${name2[1]}</span>`;
        if (cnt > 1) {
          const s = document.createElement('span'); s.className = 'hand-piece-count'; s.textContent = cnt;
          d.appendChild(s);
        }
        if (ow === 'PLAYER' && !isExhibitionActive) d.onclick = () => onHandClick(code);
        box.appendChild(d);
      }
    }
  });
}

function onHandClick(code) {
  if (isGameOver || turn !== 'PLAYER' || isAiThinking || isExhibitionActive || isPieceAnimating) return;
  stopAutoReplay(); initAudio(); playUiClickSound();
  hintSourceCell = null; hintTargetCell = null; tacticsCandidates = [];
  document.getElementById('btn-alt-tactic').style.display = 'none';

  if (selectedPos?.handCode === code) { selectedPos = null; currentValidMoves = []; }
  else {
    selectedPos = { handCode: code };
    currentValidMoves = getLegalMoves('PLAYER').filter(m => m.type === 'drop' && m.code === code).map(m => m.to);
  }
  renderBoard();
}

function onCellClick(r, c) {
  if (isGameOver || turn !== 'PLAYER' || isAiThinking || isExhibitionActive || isPieceAnimating) return;
  stopAutoReplay(); initAudio();
  hintSourceCell = null; hintTargetCell = null; tacticsCandidates = [];
  document.getElementById('btn-alt-tactic').style.display = 'none';

  if (selectedPos?.handCode && currentValidMoves.some(m => m.r === r && m.c === c)) {
    const timeSpent = recordTurnTime('PLAYER');
    lastSettledMoveInfo.PLAYER = { timeSec: timeSpent, depth: 1 };
    const moveData = { type:'drop', code:selectedPos.handCode, to:{r,c}, owner:'PLAYER' };
    selectedPos = null; currentValidMoves = [];
    animateAndExecuteMove(moveData, { timeSec: timeSpent, depth: 1 }, finishTurn);
    return;
  }

  if (selectedPos?.r !== undefined && currentValidMoves.some(m => m.r === r && m.c === c)) {
    const p = board[selectedPos.r][selectedPos.c];
    const canP = PROMOTE_MAP[p.code] && (selectedPos.r <= 2 || r <= 2);
    const mustP = (p.code === 'FU' || p.code === 'KY') && r === 0 || (p.code === 'KE' && r <= 1);
    if (canP && !mustP) {
      pendingMove = { type:'move', code: p.code, from:selectedPos, to:{r,c}, owner:'PLAYER' };
      playUiClickSound();
      document.getElementById('promote-modal').style.display = 'flex';
      return;
    }
    const timeSpent = recordTurnTime('PLAYER');
    lastSettledMoveInfo.PLAYER = { timeSec: timeSpent, depth: 1 };
    const moveData = { type:'move', code: p.code, from:selectedPos, to:{r,c}, owner:'PLAYER', promote: canP || mustP };
    selectedPos = null; currentValidMoves = [];
    animateAndExecuteMove(moveData, { timeSec: timeSpent, depth: 1 }, finishTurn);
    return;
  }

  if (board[r][c]?.owner === 'PLAYER') {
    playUiClickSound(); selectedPos = {r, c};
    currentValidMoves = getLegalMoves('PLAYER').filter(m => m.type === 'move' && m.from.r === r && m.from.c === c).map(m => m.to);
  } else { selectedPos = null; currentValidMoves = []; }
  renderBoard();
}

document.getElementById('btn-promote-yes').onclick = () => {
  if (pendingMove) {
    playUiClickSound(); const timeSpent = recordTurnTime('PLAYER');
    lastSettledMoveInfo.PLAYER = { timeSec: timeSpent, depth: 1 };
    const m = {...pendingMove, promote:true}; pendingMove = null;
    document.getElementById('promote-modal').style.display = 'none';
    animateAndExecuteMove(m, { timeSec: timeSpent, depth: 1 }, finishTurn);
  }
};
document.getElementById('btn-promote-no').onclick = () => {
  if (pendingMove) {
    playUiClickSound(); const timeSpent = recordTurnTime('PLAYER');
    lastSettledMoveInfo.PLAYER = { timeSec: timeSpent, depth: 1 };
    const m = {...pendingMove, promote:false}; pendingMove = null;
    document.getElementById('promote-modal').style.display = 'none';
    animateAndExecuteMove(m, { timeSec: timeSpent, depth: 1 }, finishTurn);
  }
};

function animateAndExecuteMove(m, metric = null, onComplete = null) {
  isPieceAnimating = true;
  const targetCellEl = document.querySelector(`#board .cell[data-r="${m.to.r}"][data-c="${m.to.c}"]`);
  if (!targetCellEl) {
    executeMove(m, metric); isPieceAnimating = false; if (onComplete) onComplete(); return;
  }
  const toRect = targetCellEl.getBoundingClientRect();
  let fromRect = null, animPieceCode = m.code;

  if (m.type === 'drop') {
    const handBoxId = (m.owner === 'PLAYER') ? 'player-hand' : 'ai-hand';
    const handPieceEl = document.querySelector(`#${handBoxId} .hand-piece[data-code="${m.code}"]`);
    if (handPieceEl) fromRect = handPieceEl.getBoundingClientRect();
  } else {
    const fromCellEl = document.querySelector(`#board .cell[data-r="${m.from.r}"][data-c="${m.from.c}"]`);
    if (fromCellEl) {
      fromRect = fromCellEl.getBoundingClientRect();
      const p = board[m.from.r][m.from.c]; if (p) animPieceCode = p.code;
    }
  }

  if (!fromRect) {
    executeMove(m, metric); isPieceAnimating = false; if (onComplete) onComplete(); return;
  }

  const animPiece = document.createElement('div');
  const isProm = m.promote || PROMOTED_PIECES.includes(animPieceCode);
  const displayCode = m.promote ? (PROMOTE_MAP[animPieceCode] || animPieceCode) : animPieceCode;
  const name2 = PIECES[displayCode] || PIECES[animPieceCode] || '歩兵';

  animPiece.className = `piece anim-flying-piece ${m.owner === 'AI' ? 'ai' : 'player'} ${isProm ? 'promoted' : ''}`;
  animPiece.innerHTML = `<span class="piece-char-top">${name2[0]}</span><span class="piece-char-bottom">${name2[1]}</span>`;
  animPiece.style.position = 'fixed';
  animPiece.style.left = `${fromRect.left}px`; animPiece.style.top = `${fromRect.top}px`;
  animPiece.style.width = `${fromRect.width}px`; animPiece.style.height = `${fromRect.height}px`;

  document.body.appendChild(animPiece);
  void animPiece.offsetWidth;

  const flyTime = (isAutoReplaying && replaySpeedIndex >= 1) ? 120 : 200;
  animPiece.style.transition = `left ${flyTime}ms cubic-bezier(0.25, 0.9, 0.35, 1), top ${flyTime}ms cubic-bezier(0.38, 0.05, 0.25, 1)`;
  animPiece.style.left = `${toRect.left}px`; animPiece.style.top = `${toRect.top}px`;

  setTimeout(() => {
    playPieceSound();
    if (animPiece && animPiece.parentElement) animPiece.remove();
    executeMove(m, metric); updateWarlordQuotes(); isPieceAnimating = false;
    if (onComplete) onComplete();
  }, flyTime);
}

function executeMove(m, metric = null) {
  if (m.type === 'move' && !m.code && board[m.from.r][m.from.c]) m.code = board[m.from.r][m.from.c].code;
  moveObjectsHistory.push(m); lastMove = m;
  moveMetricsHistory.push(metric || { timeSec: '0.1', depth: 1 });

  let isKingCaptured = false, capturedOwner = null;
  if (m.type === 'drop') {
    hands[m.owner][m.code]--;
    board[m.to.r][m.to.c] = { code: m.code, owner: m.owner };
  } else {
    const fp = board[m.from.r][m.from.c], tp = board[m.to.r][m.to.c];
    if (tp) {
      if (tp.code === 'OU') { isKingCaptured = true; capturedOwner = tp.owner; }
      else hands[m.owner][UNPROMOTE_MAP[tp.code]] = (hands[m.owner][UNPROMOTE_MAP[tp.code]] || 0) + 1;
    }
    if (m.promote) {
      fp.code = PROMOTE_MAP[fp.code];
      if (fp.code === 'RY') triggerCutin('龍王顕現！ 敵陣を薙ぎ払え！', true);
      else if (fp.code === 'UM') triggerCutin('龍馬咆哮！ 神速の刃！', true);
    }
    board[m.to.r][m.to.c] = fp; board[m.from.r][m.from.c] = null;
  }

  const inCheck = isCheckState(m.owner === 'PLAYER' ? 'AI' : 'PLAYER');
  checkHistory.push(inCheck);

  const { pPct, aiPct } = calculateTroopsPercentages(board, hands);
  evalScoresHistory.push(pPct - aiPct);

  historyStates.push({ board: cloneBoardState(board), hands: JSON.parse(JSON.stringify(hands)), turn: m.owner === 'PLAYER' ? 'AI' : 'PLAYER', moveObjectsHistory: JSON.parse(JSON.stringify(moveObjectsHistory)) });
  reviewingIndex = historyStates.length - 1;
  renderBoard(); updateTroopsAndSituation(); updateWarlordQuotes(); updateReviewModeUI();

  if (document.getElementById('kifu-modal').style.display === 'flex') {
    renderKifuModalLive();
  }

  if (isKingCaptured && capturedOwner) checkGameOver(capturedOwner);
}

function finishTurn() {
  tacticsCandidates = []; document.getElementById('btn-alt-tactic').style.display = 'none';
  if (isGameOver) return;
  if (checkSennichite('AI')) return;
  if (isCheckState('AI')) { playCheckSound(); triggerCutin('敵将へ王手！'); }
  if (checkGameOver('AI')) return;

  turn = 'AI'; updateTurnFocus('AI');
  startTurnTimer('AI');
  setTimeout(aiTurn, 200);
}

function aiTurn() {
  if (isGameOver) return;
  isAiThinking = true;
  const safeLimit = isExhibitionActive ? (EXHIBITION_TIME_LIMITS[exhibitionSpeed] || 8500) : 9000;
  const payload = {
    board, hands, level: currentAiLevel,
    engineType: `warlord_${currentAiLevel}`,
    history: moveObjectsHistory, hashHistory: boardHashHistory, checkHist: checkHistory,
    isExhibition: isExhibitionActive, owner: 'AI', targetOwner: 'AI', timeLimit: safeLimit
  };

  if (aiWorker) {
    aiWorker.postMessage(payload);
  } else if (window.thinkShogiMoveDirect) {
    setTimeout(() => {
      const res = window.thinkShogiMoveDirect(payload);
      handleWorkerMessage({ data: res });
    }, 50);
  }
}

function handleWorkerMessage(e) {
  clearTimeout(exhibitionSafetyTimer);
  const data = e.data;
  if (data.type === 'progress') {
    exhibitionAchievedDepth = data.depth || 1;
    exhibitionTargetDepth = data.targetDepth || exhibitionTargetDepth;
    return;
  }
  if (data.type === 'hintDone') {
    isHintThinking = false;
    tacticsCandidates = filterThreeTacticsPlans(data.allScoredMoves);
    currentTacticIndex = 0;
    isCurrentHintAwakened = !!data.isAwakened;
    if (tacticsCandidates.length > 0) {
      renderTacticProposal(0);
      document.getElementById('btn-alt-tactic').style.display = tacticsCandidates.length > 1 ? 'inline-block' : 'none';
    }
    return;
  }

  isAiThinking = false;
  exhibitionAchievedDepth = data.depth || exhibitionAchievedDepth;
  const elapsedSec = recordTurnTime(turn, data.timeSpentMs);
  lastSettledMoveInfo[turn] = { timeSec: elapsedSec, depth: exhibitionAchievedDepth };
  const bm = data.bestMove;
  if (!bm) { checkGameOver(turn); return; }

  animateAndExecuteMove(bm, { timeSec: elapsedSec, depth: exhibitionAchievedDepth }, () => {
    if (isGameOver) return;
    const nextTurn = (bm.owner === 'PLAYER') ? 'AI' : 'PLAYER';
    if (checkSennichite(nextTurn)) return;

    if (isExhibitionActive) {
      if (!checkGameOver(nextTurn)) { turn = nextTurn; updateTurnFocus(turn); scheduleNextExhibitionTurn(); }
      return;
    }
    if (!checkGameOver('PLAYER')) {
      turn = 'PLAYER'; updateTurnFocus('PLAYER');
      if (isCheckState('PLAYER')) { playCheckSound(); triggerCutin('敵の奇襲！ 王手！'); }
      startTurnTimer('PLAYER');
    }
  });
}

function filterThreeTacticsPlans(moves) {
  if (!moves || moves.length === 0) return [];
  const plans = [{ move: moves[0].move, planName: '王道の一手', aimDesc: '局面の急所を制する最善手' }];
  if (moves.length > 1) plans.push({ move: moves[1].move, planName: '積極の一手', aimDesc: '敵陣へ踏み込み主導権を握る強襲' });
  if (moves.length > 2) plans.push({ move: moves[2].move, planName: '堅陣の一手', aimDesc: '自陣の守りを固め反撃に備える堅陣' });
  return plans;
}

function renderTacticProposal(idx) {
  if (!tacticsCandidates || tacticsCandidates.length === 0) return;
  const item = tacticsCandidates[idx], bm = item.move;
  const toCoord = `${9 - bm.to.c}${KANJI_NUMS[bm.to.r]}`;
  const pName = PIECES[bm.code];
  const p = PLAYER_WARLORDS[currentMyWarlordId];

  const linePrimary = `<span class="tactics-plan-tag">【${item.planName}】</span><span class="tactics-move-highlight">${bm.type === 'drop' ? `${pName}打` : `${toCoord}${pName}${bm.promote ? '成' : ''}`}</span><span class="tactics-aim-tag">${item.aimDesc}</span>`;
  setOrderMessage({ line1: linePrimary, line2: `「${p.strategistShort}の進言。盤上の急所を見極めて放たれよ。」` }, true, isCurrentHintAwakened ? 'hint-awakened' : 'hint');

  hintSourceCell = bm.type === 'move' ? { r: bm.from.r, c: bm.from.c } : null;
  hintTargetCell = { r: bm.to.r, c: bm.to.c };
  renderBoard();
}

function cycleNextTacticsHint() {
  if (tacticsCandidates.length <= 1) return;
  playUiClickSound();
  currentTacticIndex = (currentTacticIndex + 1) % tacticsCandidates.length;
  renderTacticProposal(currentTacticIndex);
}

function showMasterHint() {
  if (isGameOver || turn !== 'PLAYER' || isHintThinking || isExhibitionActive || isPieceAnimating) return;
  stopAutoReplay(); playUiClickSound(); isHintThinking = true; hintUsedCount++;
  const isAwakenedNow = document.getElementById('btn-master-hint').classList.contains('awakened');
  if (isAwakenedNow) awakenedHintCount++;

  setOrderMessage({ line1: '軍師が盤上深奥を凝視中…', line2: '天機を伺っております。少々お待ちあれ。' }, false, 'hint');

  aiWorker.postMessage({
    board, hands, level: isAwakenedNow ? 10 : 8,
    isHintRequest: true, isAwakened: isAwakenedNow,
    history: moveObjectsHistory, hashHistory: boardHashHistory, checkHist: checkHistory,
    owner: 'PLAYER', targetOwner: 'PLAYER', timeLimit: 5000
  });
}

function undoMove() {
  if (isGameOver || historyStates.length <= 1 || isExhibitionActive || isPieceAnimating) return;
  stopAutoReplay(); playUiClickSound();
  const steps = (historyStates.length > 2) ? 2 : 1;
  for (let s = 0; s < steps; s++) {
    historyStates.pop(); if (evalScoresHistory.length > 1) evalScoresHistory.pop();
    if (boardHashHistory.length > 1) boardHashHistory.pop();
    if (moveMetricsHistory.length > 0) moveMetricsHistory.pop();
    if (checkHistory.length > 0) checkHistory.pop();
  }
  const snap = historyStates[historyStates.length - 1];
  board = cloneBoardState(snap.board); hands = JSON.parse(JSON.stringify(snap.hands));
  moveObjectsHistory = JSON.parse(JSON.stringify(snap.moveObjectsHistory));
  lastMove = moveObjectsHistory.length > 0 ? moveObjectsHistory[moveObjectsHistory.length - 1] : null;
  reviewingIndex = historyStates.length - 1; turn = 'PLAYER';
  updateTurnLabels(); updateTurnFocus('PLAYER'); renderBoard(); updateTroopsAndSituation();
  startTurnTimer('PLAYER');
}

function surrenderGame() {
  if (isGameOver || isExhibitionActive) return;
  stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer();
  isGameOver = true; triggerCutin('無念… 降伏いたす…');
  showWarlordResultPlaque('AI'); updateTroopsAndSituation();
  setOrderMessage('再起の陣を敷き、雪辱を期されよ！', false, 'settle');
  saveBattleRecord('lose', '降伏(投了)'); updateReviewModeUI();
}

function checkGameOver(nextOwner) {
  if (moveObjectsHistory.length >= 256) {
    isGameOver = true; stopAutoReplay(); stopTurnTimer();
    triggerCutin('二百五十六手！ 引き分け！', true);
    saveBattleRecord(isExhibitionActive ? 'exhibition' : 'draw', '256手引分');
    updateReviewModeUI(); return true;
  }
  const isKingGone = checkGameOverState(nextOwner, board);
  const legalsEmpty = getLegalMoves(nextOwner).length === 0;

  if (isKingGone || legalsEmpty) {
    isGameOver = true; playVictorySound(); stopAutoReplay(); stopTurnTimer();
    const winnerSide = (nextOwner === 'AI') ? 'PLAYER' : 'AI';
    showWarlordResultPlaque(winnerSide);
    if (nextOwner === 'AI') {
      saveProgress(currentAiLevel); launchFireworksCelebration(); triggerCutin('敵将討ち取ったり！', true);
      saveBattleRecord('win', '大勝利');
    } else {
      triggerCutin('本陣陥落… 敗北に候…');
      saveBattleRecord('lose', '本陣陥落');
    }
    updateReviewModeUI(); return true;
  }
  return false;
}

function checkSennichite(targetTurn) {
  const hash = getBoardHash(board, hands, targetTurn);
  boardHashHistory.push(hash);
  const matchIndices = [];
  boardHashHistory.forEach((h, idx) => { if (h === hash) matchIndices.push(idx); });

  if (matchIndices.length >= 4) {
    isGameOver = true; playCheckSound(); stopAutoReplay(); stopTurnTimer();

    let playerAllCheck = true, aiAllCheck = true;
    for (let i = matchIndices[0]; i < matchIndices[3]; i++) {
      const mover = moveObjectsHistory[i]?.owner;
      const isChk = checkHistory[i];
      if (mover === 'PLAYER' && !isChk) playerAllCheck = false;
      if (mover === 'AI' && !isChk) aiAllCheck = false;
    }

    if (playerAllCheck) {
      triggerCutin('連続王手の千日手！ 我が軍の反則負け！', true);
      showWarlordResultPlaque('AI');
      saveBattleRecord('lose', '反則負け(連続王手)');
    } else if (aiAllCheck) {
      triggerCutin('連続王手の千日手！ 敵将の反則負け！', true);
      showWarlordResultPlaque('PLAYER');
      saveBattleRecord('win', '反則勝ち(連続王手)');
    } else {
      triggerCutin('千日手！ 痛み分け！');
      saveBattleRecord(isExhibitionActive ? 'exhibition' : 'draw', '千日手');
    }
    updateReviewModeUI(); return true;
  }
  return false;
}

function updateTroopsAndSituation() {
  const curB = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curH = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;
  const { pPct, aiPct } = calculateTroopsPercentages(curB, curH);
  const pMax = getPlayerMaxTroops(), aiMax = getAiMaxTroops();

  const pBar = document.getElementById('player-troops-bar'), aiBar = document.getElementById('ai-troops-bar');
  if (pBar) pBar.style.width = `${pPct}%`;
  if (aiBar) aiBar.style.width = `${aiPct}%`;

  const pDisp = document.getElementById('player-troops-disp'), aiDisp = document.getElementById('ai-troops-disp');
  if (pDisp) pDisp.textContent = `${Math.round(pMax * (pPct / 100)).toLocaleString()} / ${pMax.toLocaleString()} 兵`;
  if (aiDisp) aiDisp.textContent = `${Math.round(aiMax * (aiPct / 100)).toLocaleString()} / ${aiMax.toLocaleString()} 兵`;

  const sitBadge = document.getElementById('situation-badge'), sit = document.getElementById('situation-text');
  if (sit && sitBadge && !isReviewingPast()) {
    const diff = pPct - aiPct;
    sitBadge.className = diff >= 12 ? 'situation-badge badge-player-adv' : (diff <= -12 ? 'situation-badge badge-enemy-adv' : 'situation-badge badge-gokaku');
    sitBadge.textContent = diff >= 35 ? '【我が軍 勝勢】' : (diff >= 12 ? '【我が軍 有利】' : (diff <= -35 ? '【本陣危急】' : (diff <= -12 ? '【敵軍有利】' : '【互角】')));
    sit.textContent = diff >= 12 ? '敵陣に突破口を開き、優位に軍を進めております！' : (diff <= -12 ? '敵将の鋭い攻勢。受けの態勢を整える刻に候。' : '両軍ともに布陣堅牢、白兵戦の機を伺っております。');
  }
}

function updateWarlordQuotes() {
  if (isReviewingPast()) return;
  const pData = isExhibitionActive ? getTargetAIData(exhibitionSenteTarget) : (PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada']);
  const wData = isExhibitionActive ? getTargetAIData(exhibitionGoteTarget) : (WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1]);
  const pQ = document.getElementById('player-quote-disp'), aiQ = document.getElementById('ai-quote-disp');
  if (pQ && pData.quotes) pQ.textContent = isCheckState('AI') ? pData.quotes.check : pData.quotes.default;
  if (aiQ && wData.quotes) aiQ.textContent = isCheckState('PLAYER') ? wData.quotes.check : wData.quotes.default;
}

function setOrderMessage(msg, isMyTurn = false, category = 'player') {
  const l1 = document.getElementById('order-line-primary'), l2 = document.getElementById('order-line-sub');
  const tagBadge = document.getElementById('order-tag-badge');
  const stratFace = document.getElementById('order-strategist-face');
  const banner = document.getElementById('order-message-banner');

  if (banner) banner.classList.toggle('hint-focus', category.startsWith('hint'));

  if (category.startsWith('hint')) {
    if (tagBadge) tagBadge.className = `order-tag-badge badge-tag-${category}`;
    if (stratFace) stratFace.style.display = 'flex';
  } else {
    if (tagBadge) tagBadge.className = `order-tag-badge badge-tag-${category}`;
    if (stratFace) stratFace.style.display = 'none';
  }

  if (typeof msg === 'object' && msg !== null) {
    if (l1) l1.innerHTML = msg.line1 || ''; if (l2) l2.innerHTML = msg.line2 || '';
  } else if (l1) { l1.innerHTML = msg; }
}

function openFurigomaModal() {
  initAudio(); playUiClickSound(); stopAutoReplay(); stopTurnTimer();
  const m = document.getElementById('furigoma-modal'), r = document.getElementById('furigoma-pieces-row'), t = document.getElementById('furigoma-result-text');
  m.style.display = 'flex'; r.innerHTML = ''; t.innerHTML = '天運を見届けております…';
  let toCount = 0;
  for (let i = 0; i < 5; i++) {
    const isTo = Math.random() < 0.5; if (isTo) toCount++;
    const b = document.createElement('div'); b.className = 'furigoma-piece-box';
    b.innerHTML = `<div class="furigoma-card spinning" id="fg-${i}"><div class="furigoma-face furigoma-front">歩兵</div><div class="furigoma-face furigoma-back">と金</div></div>`;
    r.appendChild(b);
    setTimeout(() => {
      const card = document.getElementById(`fg-${i}`);
      if (card) { card.classList.remove('spinning'); card.classList.add(isTo ? 'settled-to' : 'settled-fu'); playPieceSound(); }
    }, 1000 + i * 160);
  }
  setTimeout(() => {
    const isSente = (5 - toCount) >= 3;
    turn = isSente ? 'PLAYER' : 'AI'; battleStartTurn = turn;
    t.innerHTML = isSente ? `<span style="color:#ff5252;">☗ 我が軍の先手！</span>` : `<span style="color:#ffd700;">☖ 敵軍の先手！</span>`;
    playVictorySound();
    setTimeout(() => { m.style.display = 'none'; startBattle(); }, 1300);
  }, 1000 + 5 * 160 + 200);
}

function startBattle() {
  isGameOver = false; isPastReplayActive = false; isExhibitionActive = false;
  initBoardState();
  triggerCutin('合戦開始！ いざ推して参る！');
  updateTurnLabels();
  if (turn === 'PLAYER') {
    updateTurnFocus('PLAYER'); startTurnTimer('PLAYER');
  } else {
    updateTurnFocus('AI'); startTurnTimer('AI'); setTimeout(aiTurn, 400);
  }
}

/* 御前試合制御（キャラクター選択プレビュー絢爛豪華拡張） */
function setExhibitionModalSpeed(speed) {
  playUiClickSound(); exhibitionSpeed = speed;
  document.getElementById('btn-speed-normal').classList.toggle('active', speed === 'normal');
  document.getElementById('btn-speed-fast').classList.toggle('active', speed === 'fast');
}

function switchExhibitionMobileTab(tab) {
  playUiClickSound();
  document.getElementById('btn-exh-tab-sente').classList.toggle('active', tab === 'sente');
  document.getElementById('btn-exh-tab-gote').classList.toggle('active', tab === 'gote');
  document.getElementById('exhibition-col-sente').classList.toggle('mobile-active-col', tab === 'sente');
  document.getElementById('exhibition-col-gote').classList.toggle('mobile-active-col', tab === 'gote');
}

function openExhibitionModal() {
  initAudio(); playUiClickSound(); stopAutoReplay(); stopExhibitionTimer();
  renderExhibitionVisualPickers(); switchExhibitionMobileTab('sente');
  document.getElementById('exhibition-modal').style.display = 'flex';
}
function closeExhibitionModal() {
  playUiClickSound(); document.getElementById('exhibition-modal').style.display = 'none';
}

function renderExhibitionVisualPickers() {
  const sList = document.getElementById('exhibition-sente-pick-list'), gList = document.getElementById('exhibition-gote-pick-list');
  if (!sList || !gList) return;
  sList.innerHTML = ''; gList.innerHTML = '';

  ALL_EXHIBITION_AI_KEYS.forEach(k => {
    const data = getTargetAIData(k);
    [ { el: sList, cur: exhibitionSenteTarget, isSente: true, set: v => { exhibitionSenteTarget = v; } },
      { el: gList, cur: exhibitionGoteTarget, isSente: false, set: v => { exhibitionGoteTarget = v; } }
    ].forEach(tgt => {
      const isSelected = (tgt.cur === k);
      const item = document.createElement('div');
      item.className = `pick-avatar-item ${isSelected ? 'active' : ''}`;
      const troops = data.baseTroops || data.maxTroops || 10000;
      item.innerHTML = `
        <div class="pick-thumb-box">${getWarlordPortraitHtml(data, false)}</div>
        <div class="pick-info-col">
          <div class="pick-name-row">
            <span class="pick-name-txt">${getWarlordDisplayNameHtml(data)}</span>
            ${isSelected ? '<span class="badge-active-stamp">出陣中</span>' : ''}
          </div>
          <div class="pick-stats-row">
            <span class="badge-ai-troops">動員 ${troops.toLocaleString()}兵</span>
            <span class="badge-ai-depth">${data.depthSpec || '深さ3'}</span>
          </div>
        </div>`;
      item.onclick = () => {
        playUiClickSound();
        tgt.set(k);
        renderExhibitionVisualPickers();
        flashPreviewCard(tgt.isSente ? 'sente' : 'gote');
      };
      tgt.el.appendChild(item);
    });
  });
  updateExhibitionPreviewCards();
}

function flashPreviewCard(side) {
  const card = document.getElementById(side === 'sente' ? 'exhibition-sente-preview-card' : 'exhibition-gote-preview-card');
  if (!card) return;
  card.classList.remove('preview-card-glow-pulse');
  void card.offsetWidth;
  card.classList.add('preview-card-glow-pulse');
}

function updateExhibitionPreviewCards() {
  const sData = getTargetAIData(exhibitionSenteTarget);
  const gData = getTargetAIData(exhibitionGoteTarget);
  renderSingleExhibitionPreview('sente', sData);
  renderSingleExhibitionPreview('gote', gData);
}

function renderSingleExhibitionPreview(side, data) {
  const card = document.getElementById(`exhibition-${side}-preview-card`);
  if (!card) return;

  const troops = data.baseTroops || data.maxTroops || 10000;
  const rankClass = data.titleHonor ? 'badge-rank-gold' : (side === 'sente' ? 'badge-rank-gold' : 'badge-rank-blue');
  const quote = data.quotes?.default || '「いざ尋常に勝負！」';

  card.innerHTML = `
    <div class="preview-avatar-box">
      ${getWarlordPortraitHtml(data, false)}
    </div>
    <div class="preview-info-box">
      <div class="preview-header-row">
        <div class="preview-name-group">
          ${data.titleHonor ? `<span class="preview-honor-tag">${data.titleHonor}</span>` : ''}
          <span class="preview-inst-name">${data.name}</span>
        </div>
        <span class="preview-rank-badge ${rankClass}">${side === 'sente' ? '☗ 先手陣' : '☖ 後手陣'}</span>
      </div>
      <div class="preview-clan-txt">${data.clan}</div>
      <div class="preview-spec-grid">
        <div class="spec-pill">🏯 動員 <b>${troops.toLocaleString()} 兵</b></div>
        <div class="spec-pill">🧠 <b>${data.depthSpec || '深さ3'}</b></div>
      </div>
      <div class="preview-quote-box">
        <p class="preview-quote-txt">${quote}</p>
      </div>
    </div>
  `;
}

function startExhibitionFromModal() {
  closeExhibitionModal(); stopAutoReplay(); stopExhibitionTimer(); stopTurnTimer();
  isExhibitionActive = true; turn = 'PLAYER'; battleStartTurn = 'PLAYER'; isGameOver = false;
  initBoardState();
  const sData = getTargetAIData(exhibitionSenteTarget), gData = getTargetAIData(exhibitionGoteTarget);
  triggerCutin(`【御前試合】${sData.name} vs ${gData.name}`, true);
  updateTurnFocus('PLAYER');
  setTimeout(dispatchExhibitionTurn, 300);
}

function dispatchExhibitionTurn() {
  if (!isExhibitionActive || isGameOver) return;
  const isSente = (turn === 'PLAYER');
  const targetKey = isSente ? exhibitionSenteTarget : exhibitionGoteTarget;
  const targetSide = isSente ? 'PLAYER' : 'AI';
  const targetData = getTargetAIData(targetKey);

  isAiThinking = true;
  startTurnTimer(targetSide);
  const safeLimit = EXHIBITION_TIME_LIMITS[exhibitionSpeed] || 8500;

  // 強制進行セーフティタイマー（万一Workerが応答しなくても3秒後に強制指し手進行）
  clearTimeout(exhibitionSafetyTimer);
  exhibitionSafetyTimer = setTimeout(() => {
    if (isAiThinking) {
      const legals = getLegalMoves(targetSide);
      if (legals.length > 0) {
        handleWorkerMessage({
          data: {
            type: 'done', bestMove: legals[0], evalScore: 0, depth: 1, targetDepth: 1, nodes: 1, timeSpentMs: safeLimit
          }
        });
      }
    }
  }, safeLimit + 1500);

  aiWorker.postMessage({
    board, hands, level: targetKey.startsWith('lvl_') ? parseInt(targetKey.replace('lvl_',''), 10) : 5,
    engineType: targetData.engineType || 'kenshi',
    history: moveObjectsHistory, hashHistory: boardHashHistory, checkHist: checkHistory,
    isExhibition: true, owner: targetSide, targetOwner: targetSide, timeLimit: safeLimit
  });
}

function scheduleNextExhibitionTurn() {
  if (!isExhibitionActive || isGameOver) return;
  stopExhibitionTimer(); stopTurnTimer();
  exhibitionTimer = setTimeout(dispatchExhibitionTurn, EXHIBITION_DELAYS[exhibitionSpeed] || 1200);
}

function stopExhibition() {
  playUiClickSound(); stopExhibitionTimer(); stopTurnTimer();
  isExhibitionActive = false; exitReplayMode();
}
function stopExhibitionTimer() {
  if (exhibitionTimer) { clearTimeout(exhibitionTimer); exhibitionTimer = null; }
  if (exhibitionSafetyTimer) { clearTimeout(exhibitionSafetyTimer); exhibitionSafetyTimer = null; }
}

/* モーダル表示群 */
function openGuideModal() { playUiClickSound(); stopAutoReplay(); renderDynamicTacticsGuide(); document.getElementById('guide-modal').style.display = 'flex'; }
function closeGuideModal() { playUiClickSound(); stopGuideSpeech(); document.getElementById('guide-modal').style.display = 'none'; }
function switchGuideTab(idx) {
  playUiClickSound(); stopGuideSpeech();
  document.querySelectorAll('.guide-tab-btn').forEach((b, i) => b.classList.toggle('active', i === idx));
  for (let i = 0; i <= 4; i++) {
    const pane = document.getElementById(`guide-pane-${i}`);
    if (pane) pane.classList.toggle('active', i === idx);
  }
}

function openConquestMapModal() { playUiClickSound(); stopAutoReplay(); updateConquestMapUI(); document.getElementById('conquest-modal').style.display = 'flex'; }
function closeConquestMapModal() { playUiClickSound(); document.getElementById('conquest-modal').style.display = 'none'; }
function confirmConquestTarget() { playUiClickSound(); selectConquestProvince(currentAiLevel); closeConquestMapModal(); }

function openPlayerWarlordModal() {
  playUiClickSound(); stopAutoReplay();
  const l = document.getElementById('player-warlord-list'); if (!l) return;
  l.innerHTML = '';
  for(let k in PLAYER_WARLORDS) {
    const p = PLAYER_WARLORDS[k];
    const d = document.createElement('div');
    d.className = `warlord-select-card btn-3d ${k === currentMyWarlordId ? 'active' : ''}`;
    d.innerHTML = `<div class="card-avatar-mini">${getWarlordPortraitHtml(p, false)}</div><div class="card-info-col"><div class="card-name-title">${p.name}</div><div class="card-clan-tag">${p.clan}</div><div class="card-strategist-tag">軍師: ${p.strategistName}</div></div>`;
    d.onclick = () => { playUiClickSound(); setPlayerWarlord(k); closePlayerWarlordModal(); };
    l.appendChild(d);
  }
  document.getElementById('player-warlord-modal').style.display = 'flex';
}
function closePlayerWarlordModal() { playUiClickSound(); document.getElementById('player-warlord-modal').style.display = 'none'; }
function confirmPlayerWarlord() { playUiClickSound(); setPlayerWarlord(currentMyWarlordId); closePlayerWarlordModal(); }

function updateConquestMapUI() {
  const clrCount = clearedProvinces.length;
  document.getElementById('conquest-pct-disp').textContent = `${Math.round((clrCount / 11) * 100)}%`;
  document.getElementById('conquest-pct-bar').style.width = `${Math.round((clrCount / 11) * 100)}%`;
  document.getElementById('conquest-cleared-count').textContent = `${clrCount} / 11 将平定`;
  document.getElementById('conquest-total-troops-disp').textContent = `${getPlayerMaxTroops().toLocaleString()} 兵`;

  const l = document.getElementById('conquest-warlord-list'); if (!l) return;
  l.innerHTML = '';
  for(let i=1; i<=11; i++) {
    const w = WARLORDS_DATA[i], isClr = clearedProvinces.includes(i), isCur = (i === currentAiLevel);
    const d = document.createElement('div');
    d.className = `conquest-card-item btn-3d ${isCur ? 'selected' : ''} ${isClr ? 'cleared' : ''}`;
    d.innerHTML = `
      <div class="conquest-card-left"><div class="conquest-avatar-thumb">${getWarlordPortraitHtml(w, false)}</div><div class="conquest-card-info"><div class="conquest-card-title">Lv.${i} ${w.province} ｜ ${w.name}</div><div class="conquest-card-clan">${w.clan}</div><div class="conquest-card-feature">${w.featureShort}</div></div></div>
      <div><span class="conquest-status-badge ${isClr ? 'badge-conquered' : 'badge-challenge'}">${isClr ? '平定済' : '進軍可'}</span></div>`;
    d.onclick = () => { playUiClickSound(); selectConquestProvince(i); closeConquestMapModal(); };
    l.appendChild(d);
  }
}

function selectConquestProvince(lvl) {
  currentAiLevel = lvl; const w = WARLORDS_DATA[lvl];
  document.getElementById('ai-name-disp').textContent = w.name;
  document.getElementById('ai-clan-disp').textContent = `${w.clan} (Lv.${lvl})`;
  document.getElementById('ai-troops-disp').textContent = `${w.maxTroops.toLocaleString()} / ${w.maxTroops.toLocaleString()} 兵`;
  renderMainPortraits(); updateTurnLabels(); updateWarlordBGM(lvl); updateRivalryButton(); renderDynamicTacticsGuide();
  setOrderMessage({ line1: `${w.province}・「${w.name}」との決戦に候！`, line2: '「対局開始」を押されよ。' }, false, 'player');
}

function setPlayerWarlord(k) {
  currentMyWarlordId = k; const p = PLAYER_WARLORDS[k];
  document.documentElement.style.setProperty('--player-theme-color', p.themeColor);
  document.getElementById('player-name-disp').textContent = p.name;
  document.getElementById('player-clan-disp').textContent = p.clan;
  document.getElementById('player-troops-disp').textContent = `${getPlayerMaxTroops().toLocaleString()} / ${getPlayerMaxTroops().toLocaleString()} 兵`;
  renderMainPortraits(); updateTurnLabels(); updateStrategistUI(); selectConquestProvince(currentAiLevel);
}

function toggleWarlordAvatarView(side) {
  playUiClickSound();
  avatarViewMode[side] = (avatarViewMode[side] === 'face') ? 'crest' : 'face';
  const box = document.querySelector(`#${side === 'player' ? 'player-avatar-container' : 'ai-avatar-container'} .portrait-container-box`);
  if (box) box.classList.toggle('show-crest', avatarViewMode[side] === 'crest');
}

/* 棋譜・合戦絵巻Canvasグラフ */
function openKifuModal() {
  playUiClickSound(); renderKifuModalLive();
  document.getElementById('kifu-modal').style.display = 'flex';
}
function closeKifuModal() { playUiClickSound(); document.getElementById('kifu-modal').style.display = 'none'; }

function renderKifuModalLive() {
  const l = document.getElementById('kifu-list'); if (!l) return;
  l.innerHTML = '';
  moveObjectsHistory.forEach((m, idx) => {
    const d = document.createElement('div'); d.className = 'kifu-row-item';
    const metric = moveMetricsHistory[idx] || { timeSec: '0.1', depth: 1 };
    d.innerHTML = `<span>${(idx + 1).toString().padStart(3, ' ')}手目：${formatOfficialKifuMove(m, idx, false)}</span><div class="kifu-row-right-group"><span class="kifu-metric-pill">深さ${metric.depth} ｜ ${metric.timeSec}秒</span></div>`;
    l.appendChild(d);
  });
  l.scrollTop = l.scrollHeight;
  drawTerritoryChart();
}

function drawTerritoryChart() {
  const cvs = document.getElementById('chart-canvas'); if (!cvs) return;
  const ctx = cvs.getContext('2d');
  cvs.width = cvs.clientWidth; cvs.height = cvs.clientHeight;
  const w = cvs.width, h = cvs.height;
  ctx.clearRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)'; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
  ctx.beginPath(); ctx.moveTo(0, h / 2); ctx.lineTo(w, h / 2); ctx.stroke(); ctx.setLineDash([]);

  if (evalScoresHistory.length <= 1) return;
  const stepX = w / Math.max(1, evalScoresHistory.length - 1);

  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, 'rgba(255, 60, 60, 0.45)');
  grad.addColorStop(0.5, 'rgba(255, 215, 0, 0.15)');
  grad.addColorStop(1, 'rgba(255, 215, 0, 0.55)');

  ctx.beginPath();
  ctx.moveTo(0, h / 2);
  evalScoresHistory.forEach((score, i) => {
    const x = i * stepX;
    const y = (h / 2) - (score / 100) * (h * 0.42);
    ctx.lineTo(x, Math.max(4, Math.min(h - 4, y)));
  });
  ctx.lineTo((evalScoresHistory.length - 1) * stepX, h / 2);
  ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  ctx.beginPath();
  ctx.strokeStyle = '#ffd700'; ctx.lineWidth = 2;
  evalScoresHistory.forEach((score, i) => {
    const x = i * stepX;
    const y = (h / 2) - (score / 100) * (h * 0.42);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  const latestDiff = evalScoresHistory[evalScoresHistory.length - 1] || 0;
  const pTerritory = Math.max(10, Math.min(90, Math.round(50 + latestDiff * 0.4)));
  const aiTerritory = 100 - pTerritory;
  document.getElementById('chart-eval-num-top').textContent = `領地支配 ${aiTerritory}%`;
  document.getElementById('chart-eval-num-bottom').textContent = `領地支配 ${pTerritory}%`;
}

function downloadKifu() {
  playUiClickSound();
  let txt = `#KIF version=2.0 encoding=UTF-8\n手合割：平手\n先手：${isExhibitionActive ? getTargetAIData(exhibitionSenteTarget).name : PLAYER_WARLORDS[currentMyWarlordId].name}\n後手：${isExhibitionActive ? getTargetAIData(exhibitionGoteTarget).name : WARLORDS_DATA[currentAiLevel].name}\n手数----指手---------消費時間--\n`;
  moveObjectsHistory.forEach((m, i) => {
    const metric = moveMetricsHistory[i] || { timeSec: '1.0' };
    const sec = Math.round(parseFloat(metric.timeSec) || 1);
    txt += `${(i + 1).toString().padStart(4, ' ')} ${formatOfficialKifuMove(m, i, true).padEnd(7, '　')} (${formatTimeMinutesSeconds(sec)}/00:00:00)\n`;
  });
  const b = new Blob([txt], { type: 'text/plain;charset=UTF-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(b); a.download = `将棋王_天下合戦棋譜_${Date.now()}.kif`; a.click();
}

/* 勲功録・戦歴帳制御（全フィルタ完全復元） */
function saveProgress(lvl) {
  if (isExhibitionActive) return;
  if (!clearedProvinces.includes(lvl)) clearedProvinces.push(lvl);
  try { localStorage.setItem('shogi_cleared_provinces', JSON.stringify(clearedProvinces)); } catch(e){}
  updateConquestMapUI();
}

function saveBattleRecord(result, label) {
  if (moveObjectsHistory.length < 3) return;
  const pName = isExhibitionActive ? getTargetAIData(exhibitionSenteTarget).name : PLAYER_WARLORDS[currentMyWarlordId].name;
  const eName = isExhibitionActive ? getTargetAIData(exhibitionGoteTarget).name : WARLORDS_DATA[currentAiLevel].name;

  const rec = {
    id: Date.now(), date: new Date().toLocaleDateString(),
    mode: isExhibitionActive ? 'exhibition' : 'player',
    senteName: pName, goteName: eName,
    playerWarlordId: currentMyWarlordId, aiLevel: currentAiLevel,
    exhibitionSente: exhibitionSenteTarget, exhibitionGote: exhibitionGoteTarget,
    result, resultLabel: label, movesCount: moveObjectsHistory.length,
    historySnap: historyStates, moveObjs: moveObjectsHistory, moveMetrics: moveMetricsHistory,
    evals: evalScoresHistory
  };

  try {
    const list = JSON.parse(localStorage.getItem('shogi_records') || '[]');
    list.unshift(rec); localStorage.setItem('shogi_records', JSON.stringify(list.slice(0, 30)));
  } catch(e){}
}

function openHistoryModal() { playUiClickSound(); renderBattleHistoryList(); document.getElementById('battle-history-modal').style.display = 'flex'; }
function closeHistoryModal() { playUiClickSound(); document.getElementById('battle-history-modal').style.display = 'none'; }
function switchHistoryTab(tab) {
  playUiClickSound(); currentHistoryTab = tab;
  document.getElementById('tab-btn-history-player').classList.toggle('active', tab === 'player');
  document.getElementById('tab-btn-history-exhibition').classList.toggle('active', tab === 'exhibition');
  renderBattleHistoryList();
}

function renderBattleHistoryList() {
  const l = document.getElementById('history-records-list'); if (!l) return;
  const list = JSON.parse(localStorage.getItem('shogi_records') || '[]');
  const filterRes = document.getElementById('filter-result')?.value || 'all';
  const filterWarlord = document.getElementById('filter-warlord')?.value || 'all';
  const filterLevel = document.getElementById('filter-level')?.value || 'all';

  const filtered = list.filter(r => {
    if (r.mode !== currentHistoryTab && !(currentHistoryTab === 'player' && !r.mode)) return false;
    if (filterRes !== 'all' && r.result !== filterRes) return false;
    if (r.mode === 'player') {
      if (filterWarlord !== 'all' && r.playerWarlordId !== filterWarlord) return false;
      if (filterLevel !== 'all' && r.aiLevel.toString() !== filterLevel) return false;
    }
    return true;
  });

  let wins = 0, losses = 0, draws = 0;
  filtered.forEach(r => { if (r.result === 'win') wins++; else if (r.result === 'lose') losses++; else draws++; });
  const total = filtered.length;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;
  const sumStrip = document.getElementById('history-summary-strip');
  if (sumStrip) {
    sumStrip.innerHTML = `<span class="summary-rank-tag">🏆 天下無双</span><span class="summary-stats-txt">通算 <b>${total}</b>戦 <b>${wins}</b>勝 <b>${losses}</b>敗 <b>${draws}</b>分（勝率 <b>${winRate}%</b>）</span>`;
  }

  l.innerHTML = filtered.length === 0 ? `<div style="text-align:center; padding:20px; color:#d6be89;">合戦の記録はまだござらぬ。</div>` : '';

  filtered.forEach(r => {
    const card = document.createElement('div'); card.className = 'history-record-card';
    const isWin = r.result === 'win';
    card.innerHTML = `
      <div class="card-tier-header">
        <div class="tier-header-left">
          <span class="history-res-badge ${isWin ? 'badge-win' : (r.result === 'lose' ? 'badge-lose' : 'badge-draw')}">【${r.resultLabel}】</span>
          <span class="tier-header-meta">第${r.movesCount}手 ｜ ${r.date}</span>
        </div>
      </div>
      <div class="card-tier-clash">
        <div class="clash-side ${isWin ? 'is-winner' : 'is-loser'}"><span class="clash-name-txt">☗ ${r.senteName}</span></div>
        <span class="clash-vs-mark">⚔</span>
        <div class="clash-side clash-side-enemy ${!isWin ? 'is-winner' : 'is-loser'}"><span class="clash-name-txt">☖ ${r.goteName}</span></div>
      </div>
      <div class="card-tier-footer">
        <div class="tier-footer-stats"><span class="footer-stat-pill">総手数 <b>${r.movesCount}手</b></span></div>
        <button class="btn-replay-card-main btn-3d" onclick="loadPastBattleForReplay(${r.id})">🎞 盤上再現</button>
      </div>`;
    l.appendChild(card);
  });
}

function clearBattleHistory() {
  playUiClickSound(); if (!confirm('天下合戦勲功録をすべて消去いたしますか？')) return;
  localStorage.removeItem('shogi_records'); renderBattleHistoryList();
}

function loadPastBattleForReplay(recId) {
  playUiClickSound();
  const list = JSON.parse(localStorage.getItem('shogi_records') || '[]');
  const rec = list.find(r => r.id === recId); if (!rec || !rec.historySnap) return;

  if (!isGameOver && !isPastReplayActive) {
    savedActiveBattle = {
      isExhibitionActive, exhibitionSenteTarget, exhibitionGoteTarget, exhibitionSpeed,
      currentMyWarlordId, currentAiLevel, board: cloneBoardState(board), hands: JSON.parse(JSON.stringify(hands)),
      turn, battleStartTurn, moveObjectsHistory: JSON.parse(JSON.stringify(moveObjectsHistory)),
      historyStates: JSON.parse(JSON.stringify(historyStates)), evalScoresHistory: JSON.parse(JSON.stringify(evalScoresHistory)),
      boardHashHistory: JSON.parse(JSON.stringify(boardHashHistory)), checkHistory: JSON.parse(JSON.stringify(checkHistory)),
      moveMetricsHistory: JSON.parse(JSON.stringify(moveMetricsHistory)), lastMove
    };
  }

  closeHistoryModal();
  isPastReplayActive = true; isGameOver = true;
  stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer();

  historyStates = rec.historySnap;
  moveObjectsHistory = rec.moveObjs || [];
  moveMetricsHistory = rec.moveMetrics || [];
  evalScoresHistory = rec.evals || [0];
  reviewingIndex = 0;

  const firstSnap = historyStates[0];
  board = cloneBoardState(firstSnap.board);
  hands = JSON.parse(JSON.stringify(firstSnap.hands));
  lastMove = null;

  renderBoard(); updateTroopsAndSituation(); updateReviewModeUI();
  setOrderMessage({ line1: `【合戦絵巻再現】${rec.senteName} vs ${rec.goteName}`, line2: '「▶ 自動」または左右の矢印にて振り返られよ。' }, false, 'replay');
}

/* 起動イベント */
document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('touchstart', () => initAudio(), { once: true });

try {
  clearedProvinces = JSON.parse(localStorage.getItem('shogi_cleared_provinces') || '[]');
  currentAiLevel = clearedProvinces.length > 0 ? Math.min(11, Math.max(...clearedProvinces) + 1) : 1;
} catch(e){}

setPlayerWarlord(currentMyWarlordId);
initBoardState();


