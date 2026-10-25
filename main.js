/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   メインスクリプト（軍略・演出・思考エンジン・御前試合統合管理）
   【パート 1 / 2】
   ========================================================= */

// AI Web Workerコード（思考エンジン：簡易Zobrist置換表＋キラー着手＋MVV-LVA探索強化＆安全確定ガード版）
const workerScriptContent = `
const PIECE_CODES = ['OU','HI','KA','KI','GI','KE','KY','FU','RY','UM','NG','NK','NY','TO'];
const VALUES = { OU: 30000, HI: 1050, KA: 880, KI: 580, GI: 480, KE: 380, KY: 280, FU: 100, RY: 1450, UM: 1250, NG: 570, NK: 490, NY: 430, TO: 430 };
const UNPROMOTE_MAP = { RY: 'HI', UM: 'KA', NG: 'GI', NK: 'KE', NY: 'KY', TO: 'FU', HI: 'HI', KA: 'KA', KI: 'KI', GI: 'GI', KE: 'KE', KY: 'KY', FU: 'FU', OU: 'OU' };
const PROMOTE_MAP = { HI: 'RY', KA: 'UM', GI: 'NG', KE: 'NK', KY: 'NY', FU: 'TO' };
const MATE_SCORE = 100000;

let board = [], hands = { PLAYER: {}, AI: {} };
let searchStartTime = 0, searchTimeLimit = 5000, isSearchTimeout = false, nodeCount = 0;
let moveHistory = [], pastHashes = [];

// Worker内部置換表 ＆ キラー手ヒューリスティック
const ttWorker = new Map();
const TT_EXACT = 0, TT_ALPHA = 1, TT_BETA = 2;
let workerKillerMoves = Array.from({ length: 30 }, () => [null, null]);

const LEVEL_CFG = {
  1:  { depth: 1, qDepth: 1 },
  2:  { depth: 1, qDepth: 2 },
  3:  { depth: 2, qDepth: 2 },
  4:  { depth: 2, qDepth: 3 },
  5:  { depth: 3, qDepth: 3 },
  6:  { depth: 3, qDepth: 4 },
  7:  { depth: 4, qDepth: 3 },
  8:  { depth: 4, qDepth: 3 },
  9:  { depth: 4, qDepth: 4 },
  10: { depth: 5, qDepth: 4 },
  11: { depth: 5, qDepth: 4 }
};

function checkTimeout() {
  if (isSearchTimeout) return true;
  if ((Date.now() - searchStartTime) >= searchTimeLimit) {
    isSearchTimeout = true;
    return true;
  }
  return false;
}

function getBoardHash(b, h, t) {
  let s = t + ':';
  for(let r=0; r<9; r++) for(let c=0; c<9; c++) {
    const p = b[r][c]; if (p) s += r + '' + c + p.code + p.owner[0] + '|';
  }
  for (const ow of ['PLAYER','AI']) for (const k in h[ow]) {
    if (h[ow][k] > 0) s += ow[0] + k + h[ow][k];
  }
  return s;
}

function getValidBoardMoves(r, c, owner) {
  const item = board[r][c]; if (!item) return [];
  const dir = owner === 'AI' ? 1 : -1, moves = [];
  const canT = (nr, nc) => !board[nr][nc] || board[nr][nc].owner !== owner;
  const ray = dirs => dirs.forEach(([dr, dc]) => {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      if (!board[nr][nc]) moves.push({r: nr, c: nc});
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

function getControlSquares(r, c, owner) {
  const item = board[r][c]; if (!item) return [];
  const dir = owner === 'AI' ? 1 : -1, squares = [];
  const ray = dirs => dirs.forEach(([dr, dc]) => {
    let nr = r + dr, nc = c + dc;
    while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
      squares.push({r: nr, c: nc});
      if (board[nr][nc]) break;
      nr += dr; nc += dc;
    }
  });
  const step = offs => offs.forEach(([dr, dc]) => {
    const nr = r + dr, nc = c + dc;
    if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) squares.push({r: nr, c: nc});
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
  return squares;
}

function findKing(owner) {
  for (let r=0; r<9; r++) for (let c=0; c<9; c++) if (board[r][c]?.owner === owner && board[r][c]?.code === 'OU') return {r, c};
  return null;
}

function isCheckState(owner) {
  const kp = findKing(owner);
  if (!kp) return true;
  const kr = kp.r, kc = kp.c, enemy = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
  for (let r=0; r<9; r++) {
    for (let c=0; c<9; c++) {
      if (board[r][c]?.owner === enemy) {
        const moves = getValidBoardMoves(r, c, enemy);
        if (moves.some(m => m.r === kr && m.c === kc)) return true;
      }
    }
  }
  return false;
}

function makeMove(move) {
  const undo = { move };
  const owner = move.owner;
  if (move.type === 'drop') {
    hands[owner][move.code]--;
    board[move.to.r][move.to.c] = { code: move.code, owner };
  } else {
    const item = board[move.from.r][move.from.c], target = board[move.to.r][move.to.c];
    undo.fromCode = item.code;
    if (target) {
      undo.capturedCode = target.code;
      if (target.code !== 'OU') {
        const raw = UNPROMOTE_MAP[target.code];
        hands[owner][raw] = (hands[owner][raw] || 0) + 1;
      }
    }
    if (move.promote) item.code = PROMOTE_MAP[item.code];
    board[move.to.r][move.to.c] = item;
    board[move.from.r][move.from.c] = null;
  }
  return undo;
}

function unmakeMove(undo) {
  const move = undo.move, owner = move.owner;
  if (move.type === 'drop') {
    hands[owner][move.code]++;
    board[move.to.r][move.to.c] = null;
  } else {
    const item = board[move.to.r][move.to.c];
    item.code = undo.fromCode;
    board[move.from.r][move.from.c] = item;
    if (undo.capturedCode) {
      board[move.to.r][move.to.c] = { code: undo.capturedCode, owner: owner === 'AI' ? 'PLAYER' : 'AI' };
      if (undo.capturedCode !== 'OU') hands[owner][UNPROMOTE_MAP[undo.capturedCode]]--;
    } else board[move.to.r][move.to.c] = null;
  }
}

function isUchifuzume(move) {
  if (move.type !== 'drop' || move.code !== 'FU') return false;
  const enemy = move.owner === 'AI' ? 'PLAYER' : 'AI';
  const enemyKing = findKing(enemy);
  if (!enemyKing) return false;
  const fwd = move.owner === 'AI' ? 1 : -1;
  if (move.to.r !== enemyKing.r - fwd || move.to.c !== enemyKing.c) return false;

  const undo = makeMove(move);
  const kingInCheck = isCheckState(enemy);
  if (!kingInCheck) { unmakeMove(undo); return false; }

  const enemyLegals = genLegalMoves(enemy, false, false);
  unmakeMove(undo);
  return enemyLegals.length === 0;
}

function evaluatePosition(evalPerspective, evalLevel) {
  let score = 0;
  const oppOwner = (evalPerspective === 'PLAYER') ? 'AI' : 'PLAYER';
  let myKing = null, oppKing = null;
  const defenseCount = { PLAYER: Array.from({length:9}, () => Array(9).fill(0)), AI: Array.from({length:9}, () => Array(9).fill(0)) };

  for (let r=0; r<9; r++) {
    for (let c=0; c<9; c++) {
      const p = board[r][c]; if (!p) continue;
      const ctrl = getControlSquares(r, c, p.owner);
      ctrl.forEach(m => { defenseCount[p.owner][m.r][m.c]++; });
      if (p.code === 'OU') {
        if (p.owner === evalPerspective) myKing = {r, c}; else oppKing = {r, c};
      }
    }
  }

  for (let r=0; r<9; r++) {
    for (let c=0; c<9; c++) {
      const p = board[r][c]; if (!p) continue;
      let val = VALUES[p.code] || 0;
      const sign = (p.owner === evalPerspective) ? 1 : -1;
      const relativeRank = (p.owner === 'AI') ? r : (8 - r);
      
      if (p.owner === evalPerspective) {
        if (evalLevel === 2 && (p.code === 'HI' || p.code === 'KE')) val *= 1.15;
        if (evalLevel === 4 && p.code === 'HI' && c === 2) score += 45;
        if (evalLevel === 5 && p.code === 'FU' && relativeRank >= 5) score += 25;
        if (evalLevel === 6 && (p.code === 'KA' || p.code === 'UM')) val *= 1.25;
        if (evalLevel === 7 && ['KI','GI'].includes(p.code) && relativeRank <= 2) score += 30;
        if (evalLevel === 8 && ['RY','UM'].includes(p.code)) val *= 1.35;
        if (evalLevel === 9 && ['KI','GI'].includes(p.code) && relativeRank >= 5) score += 35;
        if (evalLevel === 11 && ['RY','UM','KE'].includes(p.code)) val *= 1.35;
      }

      score += sign * val;

      if (p.code !== 'OU') {
        const myDefs = defenseCount[p.owner][r][c];
        const otherSide = (p.owner === 'AI') ? 'PLAYER' : 'AI';
        const oppAttacks = defenseCount[otherSide][r][c];
        if (myDefs > 0) score += sign * 28;
        if (oppAttacks > myDefs) {
          const penaltyRate = (evalLevel === 1) ? 0.20 : 0.42;
          score -= sign * (val * penaltyRate);
        }
      }

      if (p.code === 'FU' || p.code === 'GI') {
        const advBonus = (evalLevel === 3) ? 18 : 10;
        score += sign * (relativeRank * advBonus);
        if (c >= 2 && c <= 6) score += sign * 15;
      }
    }
  }

  const kingGuardBonus = (evalLevel >= 10) ? 85 : ((evalLevel === 7) ? 95 : 45);
  if (myKing) {
    let myG = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = myKing.r + dr, nc = myKing.c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        const occ = board[nr][nc];
        if (occ?.owner === evalPerspective && ['KI','GI','NG','NK','NY','TO'].includes(occ.code)) myG++;
      }
    }
    score += myG * kingGuardBonus;
  }
  if (oppKing) {
    let oppG = 0;
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const nr = oppKing.r + dr, nc = oppKing.c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        const occ = board[nr][nc];
        if (occ?.owner === oppOwner && ['KI','GI','NG','NK','NY','TO'].includes(occ.code)) oppG++;
      }
    }
    score -= oppG * kingGuardBonus;
  }

  const handMul = (evalLevel >= 9) ? 1.30 : 1.15;
  for (const c in hands[evalPerspective]) score += (hands[evalPerspective][c] || 0) * (VALUES[c] || 0) * handMul;
  for (const c in hands[oppOwner])        score -= (hands[oppOwner][c] || 0) * (VALUES[c] || 0) * 1.15;
  return score;
}

function genLegalMoves(owner, capturesOnly = false, filterUchifuzume = true) {
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
          if (capturesOnly && !isCap && !canP && !mustP) return;

          let capVal = isCap ? (VALUES[target.code] || 0) : 0;
          let attackerVal = VALUES[item.code] || 0;

          if (mustP) pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: true, isCap, capVal, attackerVal });
          else if (canP) {
            pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: true, isCap, capVal, attackerVal });
            if (!capturesOnly) pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: false, isCap, capVal, attackerVal });
          } else pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: false, isCap, capVal, attackerVal });
        });
      }
    }
  }

  if (!capturesOnly) {
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
            pseudo.push({ type: 'drop', code, to: {r, c}, owner, isCap: false, capVal: 0, attackerVal: VALUES[code] || 0 });
          }
        }
      }
    }
  }

  const legals = [];
  for (let i = 0; i < pseudo.length; i++) {
    const m = pseudo[i];
    if (filterUchifuzume && m.type === 'drop' && m.code === 'FU') {
      if (isUchifuzume(m)) continue;
    }
    const undo = makeMove(m);
    const safe = !isCheckState(owner);
    unmakeMove(undo);
    if (safe) legals.push(m);
  }

  legals.sort((a, b) => {
    let sa = (a.isCap ? 20000 + a.capVal * 16 - a.attackerVal * 0.1 : 0) + (a.promote ? 6000 : 0);
    let sb = (b.isCap ? 20000 + b.capVal * 16 - b.attackerVal * 0.1 : 0) + (b.promote ? 6000 : 0);
    return sb - sa;
  });

  return legals;
}

function quiescence(alpha, beta, owner, qDepth, maxQ, rootPerspective, evalLevel) {
  nodeCount++;
  if ((nodeCount & 15) === 0 && checkTimeout()) return alpha;

  const inCheck = isCheckState(owner);
  if (!inCheck) {
    const standPat = (owner === rootPerspective ? 1 : -1) * evaluatePosition(rootPerspective, evalLevel);
    if (qDepth >= maxQ) return standPat;
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;
  }
  const moves = inCheck ? genLegalMoves(owner, false, true) : genLegalMoves(owner, true, true);
  if (inCheck && moves.length === 0) return -MATE_SCORE + qDepth;

  const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
  for (let i = 0; i < moves.length; i++) {
    const undo = makeMove(moves[i]);
    const score = -quiescence(-beta, -alpha, nextOwner, qDepth + 1, maxQ, rootPerspective, evalLevel);
    unmakeMove(undo);
    if (isSearchTimeout) break;
    if (score >= beta) return beta;
    if (score > alpha) alpha = score;
  }
  return alpha;
}

function negamax(depth, alpha, beta, owner, ply, maxQ, rootPerspective, evalLevel) {
  nodeCount++;
  if ((nodeCount & 15) === 0 && checkTimeout()) return alpha;

  const hashKey = getBoardHash(board, hands, owner);
  const ttEntry = ttWorker.get(hashKey);
  let ttMove = null;
  if (ttEntry) {
    ttMove = ttEntry.bestMove;
    if (ttEntry.depth >= depth) {
      if (ttEntry.flag === TT_EXACT) return ttEntry.score;
      if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return alpha;
      if (ttEntry.flag === TT_BETA  && ttEntry.score >= beta)  return beta;
    }
  }

  if (depth <= 0) return quiescence(alpha, beta, owner, 0, maxQ, rootPerspective, evalLevel);

  const inCheck = isCheckState(owner);
  const moves = genLegalMoves(owner, false, true);
  if (moves.length === 0) return inCheck ? (-MATE_SCORE + ply) : 0;

  const k1 = workerKillerMoves[ply] ? workerKillerMoves[ply][0] : null;
  const k2 = workerKillerMoves[ply] ? workerKillerMoves[ply][1] : null;

  moves.sort((a, b) => {
    if (ttMove) {
      const matchA = (a.type === ttMove.type && a.to.r === ttMove.to.r && a.to.c === ttMove.to.c);
      const matchB = (b.type === ttMove.type && b.to.r === ttMove.to.r && b.to.c === ttMove.to.c);
      if (matchA) return -1;
      if (matchB) return 1;
    }
    let sa = (a.isCap ? 20000 + a.capVal * 16 - a.attackerVal * 0.1 : 0) + (a.promote ? 6000 : 0);
    let sb = (b.isCap ? 20000 + b.capVal * 16 - b.attackerVal * 0.1 : 0) + (b.promote ? 6000 : 0);
    if (k1 && a.type === k1.type && a.to.r === k1.to.r && a.to.c === k1.to.c) sa += 8000;
    if (k1 && b.type === k1.type && b.to.r === k1.to.r && b.to.c === k1.to.c) sb += 8000;
    if (k2 && a.type === k2.type && a.to.r === k2.to.r && a.to.c === k2.to.c) sa += 4000;
    if (k2 && b.type === k2.type && b.to.r === k2.to.r && b.to.c === k2.to.c) sb += 4000;
    return sb - sa;
  });

  let bestVal = -Infinity;
  let bestM = null;
  const origAlpha = alpha;
  const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';

  for (let i = 0; i < moves.length; i++) {
    const m = moves[i];
    const undo = makeMove(m);
    let score = -negamax(depth - 1, -beta, -alpha, nextOwner, ply + 1, maxQ, rootPerspective, evalLevel);
    unmakeMove(undo);
    if (isSearchTimeout) break;

    if (moveHistory.length >= 2) {
      const last = moveHistory[moveHistory.length - 2];
      if (m.type === 'move' && last.type === 'move' &&
          m.to.r === last.from.r && m.to.c === last.from.c &&
          m.from.r === last.to.r && m.from.c === last.to.c) {
        score -= 900;
      }
    }

    if (score > bestVal) {
      bestVal = score;
      bestM = m;
    }
    if (score > alpha) alpha = score;
    if (alpha >= beta) {
      if (!m.isCap && ply < 30) {
        workerKillerMoves[ply][1] = workerKillerMoves[ply][0];
        workerKillerMoves[ply][0] = m;
      }
      break;
    }
  }

  let flag = TT_EXACT;
  if (bestVal <= origAlpha) flag = TT_ALPHA;
  else if (bestVal >= beta) flag = TT_BETA;
  if (ttWorker.size > 25000) ttWorker.clear();
  ttWorker.set(hashKey, { depth, score: bestVal, flag, bestMove: bestM });

  return bestVal;
}

self.onmessage = function(e) {
  const { board: bD, hands: hD, level = 1, isHintRequest = false, isAwakened = false, history = [], hashHistory = [], isExhibition = false, targetOwner = 'AI', timeLimit = 5000 } = e.data;
  board = bD; hands = hD; moveHistory = history; pastHashes = hashHistory;
  searchStartTime = Date.now(); isSearchTimeout = false; nodeCount = 0;
  
  searchTimeLimit = (typeof timeLimit === 'number' && timeLimit > 0) ? timeLimit : (isExhibition ? 8500 : 9000);
  
  const searchOwner = isHintRequest ? 'PLAYER' : targetOwner;
  const enemyOwner = (searchOwner === 'AI') ? 'PLAYER' : 'AI';
  const effectiveLevel = isHintRequest ? (isAwakened ? 10 : 8) : level;
  const curEval = evaluatePosition(searchOwner, effectiveLevel);

  let cfg = isHintRequest ? (isAwakened ? { depth: 5, qDepth: 4 } : { depth: 4, qDepth: 3 })
                          : (LEVEL_CFG[level] || LEVEL_CFG[1]);

  const legals = genLegalMoves(searchOwner, false, true);
  if (legals.length === 0) {
    self.postMessage({ type: isHintRequest ? 'hintDone' : 'done', bestMove: null, candidateMoves: [], evalScore: curEval, depth: 0, targetDepth: cfg.depth, nodes: 0, timeSpentMs: 10 });
    return;
  }

  const calcPenalty = (m) => {
    let penalty = 0;
    const undo = makeMove(m);
    const nextHash = getBoardHash(board, hands, enemyOwner);
    const hashOccurrences = pastHashes.filter(h => h === nextHash).length;
    if (hashOccurrences >= 2) penalty += 5500;
    else if (hashOccurrences === 1) penalty += 2000;

    if (moveHistory.length >= 2) {
      const lastOwnerMove = moveHistory[moveHistory.length - 2];
      if (m.type === 'move' && lastOwnerMove?.type === 'move') {
        if (m.to.r === lastOwnerMove.from.r && m.to.c === lastOwnerMove.from.c &&
            m.from.r === lastOwnerMove.to.r && m.from.c === lastOwnerMove.to.c) {
          penalty += 3500;
        }
      }
    }
    unmakeMove(undo);
    return penalty;
  };

  let scoredMoves = legals.map(m => ({ move: m, score: 0 }));
  let confirmedBestMove = legals[0];
  let confirmedBestScore = curEval;
  let achievedDepth = 1;

  // 反復深化ループ（安全確定ガード付き）
  for (let d = 1; d <= cfg.depth; d++) {
    if (checkTimeout()) break;
    self.postMessage({ type: 'progress', depth: d, targetDepth: cfg.depth, nodes: nodeCount, evalScore: confirmedBestScore });

    let alpha = -Infinity, beta = Infinity;
    
    if (d > 1 && confirmedBestMove) {
      scoredMoves.sort((a, b) => {
        const isABest = (a.move.type === confirmedBestMove.type &&
                         a.move.to.r === confirmedBestMove.to.r && a.move.to.c === confirmedBestMove.to.c &&
                         (a.move.type === 'drop' ? a.move.code === confirmedBestMove.code : (a.move.from.r === confirmedBestMove.from.r && a.move.from.c === confirmedBestMove.from.c)));
        const isBBest = (b.move.type === confirmedBestMove.type &&
                         b.move.to.r === confirmedBestMove.to.r && b.move.to.c === confirmedBestMove.to.c &&
                         (b.move.type === 'drop' ? b.move.code === confirmedBestMove.code : (b.move.from.r === confirmedBestMove.from.r && b.move.from.c === confirmedBestMove.from.c)));
        if (isABest) return -1;
        if (isBBest) return 1;
        return b.score - a.score;
      });
    }

    let currentIterationMoves = scoredMoves.map(item => ({ move: item.move, score: item.score }));
    let iterationCompleted = true;

    for (let i = 0; i < currentIterationMoves.length; i++) {
      if (checkTimeout()) { iterationCompleted = false; break; }
      const m = currentIterationMoves[i].move;
      const penalty = calcPenalty(m);
      const undo = makeMove(m);
      let s = -negamax(d - 1, -beta, -alpha, enemyOwner, 1, cfg.qDepth, searchOwner, effectiveLevel) - penalty;
      unmakeMove(undo);

      currentIterationMoves[i].score = s;
      if (isSearchTimeout) { iterationCompleted = false; break; }
      if (s > alpha) alpha = s;
    }

    // 深さdの全手が100%検証された場合のみ確定最善手を更新（ポカ手の完全排除ガード）
    if (iterationCompleted && !isSearchTimeout) {
      achievedDepth = d;
      currentIterationMoves.sort((a, b) => b.score - a.score);
      scoredMoves = currentIterationMoves;
      confirmedBestMove = scoredMoves[0].move;
      confirmedBestScore = scoredMoves[0].score;
      self.postMessage({ type: 'progress', depth: d, targetDepth: cfg.depth, nodes: nodeCount, evalScore: confirmedBestScore });
    }

    if (checkTimeout()) break;
  }

  let finalBestMove = confirmedBestMove || legals[0];
  if (!isHintRequest && !isExhibition && level === 1 && scoredMoves.length > 1) {
    if (Math.random() < 0.35) {
      const subIdx = Math.min(scoredMoves.length - 1, Math.floor(Math.random() * 3) + 1);
      finalBestMove = scoredMoves[subIdx].move;
    }
  }

  const elapsedMs = Math.max(50, Date.now() - searchStartTime);

  self.postMessage({
    type: isHintRequest ? 'hintDone' : 'done',
    bestMove: finalBestMove,
    allScoredMoves: scoredMoves,
    evalScore: confirmedBestScore,
    depth: achievedDepth,
    targetDepth: cfg.depth,
    nodes: nodeCount,
    isAwakened,
    timeSpentMs: elapsedMs
  });
};
`;

/* =========================================================
   安土桃山・黄金工芸 立体五角形将棋駒アイコン 生成エンジン
   ========================================================= */
function getKomaMarkHtml(isSente, sizeType = 'normal') {
  let w = 12, h = 13, vAlign = '-1.5px', mRight = '3px';
  if (sizeType === 'mini') {
    w = 10; h = 11; vAlign = '-1px'; mRight = '2px';
  } else if (sizeType === 'tiny') {
    w = 9; h = 10; vAlign = '-1px'; mRight = '2px';
  }

  const baseStyle = `display:inline-block; vertical-align:${vAlign}; width:${w}px !important; height:${h}px !important; max-width:${w}px !important; max-height:${h}px !important; margin-right:${mRight}; flex-shrink:0; pointer-events:none;`;

  if (isSente) {
    return `<svg viewBox="0 0 100 115" width="${w}" height="${h}" style="${baseStyle}">
      <defs>
        <linearGradient id="koma-s-gold-${w}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff6b8"/>
          <stop offset="40%" stop-color="#ffd700"/>
          <stop offset="85%" stop-color="#c98a12"/>
          <stop offset="100%" stop-color="#7a4e05"/>
        </linearGradient>
      </defs>
      <polygon points="50,4 94,24 82,110 18,110 6,24" fill="#170903" stroke="url(#koma-s-gold-${w})" stroke-width="7" stroke-linejoin="round"/>
      <polygon points="50,16 82,30 72,98 28,98 18,30" fill="url(#koma-s-gold-${w})" opacity="0.95"/>
      <polygon points="50,26 74,36 66,88 34,88 26,36" fill="#0d0401"/>
    </svg>`;
  } else {
    return `<svg viewBox="0 0 100 115" width="${w}" height="${h}" style="${baseStyle} transform:rotate(180deg);">
      <defs>
        <linearGradient id="koma-g-silver-${w}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="40%" stop-color="#d6e1f0"/>
          <stop offset="85%" stop-color="#8a9db8"/>
          <stop offset="100%" stop-color="#465873"/>
        </linearGradient>
      </defs>
      <polygon points="50,4 94,24 82,110 18,110 6,24" fill="#08101a" stroke="url(#koma-g-silver-${w})" stroke-width="7" stroke-linejoin="round"/>
      <polygon points="50,16 82,30 72,98 28,98 18,30" fill="url(#koma-g-silver-${w})" opacity="0.95"/>
      <polygon points="50,26 74,36 66,88 34,88 26,36" fill="#04080f"/>
    </svg>`;
  }
}

/* =========================================================
   最高峰二重音響エンジン
   ========================================================= */
let audioCtx = null, soundEnabled = true, isPageHidden = false;
let realKomaAudioBuffer = null;
let realKomaAudioElement = null;

function preloadRealKomaSound() {
  try {
    realKomaAudioElement = new Audio('koma_sound.wav');
    realKomaAudioElement.preload = 'auto';
    realKomaAudioElement.volume = 0.95;
  } catch(e) { realKomaAudioElement = null; }

  const isLocalFileProtocol = (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:');

  if (!isLocalFileProtocol && window.fetch && (window.AudioContext || window.webkitAudioContext)) {
    fetch('koma_sound.wav')
      .then(res => {
        if (!res.ok) throw new Error('koma_sound not ok');
        return res.arrayBuffer();
      })
      .then(buf => {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx.decodeAudioData(buf);
      })
      .then(decoded => {
        realKomaAudioBuffer = decoded;
      })
      .catch(() => {
        realKomaAudioBuffer = null;
      });
  }
}
preloadRealKomaSound();

const bgmAudio = document.getElementById('bgm-audio');
if (bgmAudio) bgmAudio.volume = 0.35;

const BGM_TRACKS = { normal: 'nobunaga_song.mp3', rivalry: 'nobunaga_song.mp3', boss: 'nobunaga_song.mp3' };
let currentBgmTrack = 'normal';

function updateWarlordBGM(level) {
  let targetTrack = 'normal';
  if (level >= 8) targetTrack = 'boss';
  else if (level >= 6) targetTrack = 'rivalry';

  if (currentBgmTrack === targetTrack) return;
  currentBgmTrack = targetTrack;

  if (bgmAudio && soundEnabled && !isPageHidden) {
    bgmAudio.src = BGM_TRACKS[targetTrack] || 'nobunaga_song.mp3';
    bgmAudio.play().catch(() => {});
  }
}

function initAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended' && !isPageHidden) audioCtx.resume();
  if (!isPageHidden) startBgm();
}
function startBgm() {
  if (!soundEnabled || !bgmAudio || isPageHidden) return;
  bgmAudio.play().catch(() => {});
}
function pauseBgm() {
  if (bgmAudio) bgmAudio.pause();
}
function toggleSound() {
  soundEnabled = !soundEnabled;
  const btn = document.getElementById('sound-toggle');
  if (btn) btn.textContent = `♪ ${soundEnabled ? '奏楽入' : '奏楽切'}`;
  if (soundEnabled) { initAudio(); playUiClickSound(); startBgm(); }
  else { pauseBgm(); }
}

function handleVisibilityChange() {
  if (document.hidden) {
    isPageHidden = true;
    pauseBgm();
    stopGuideSpeech();
    stopAutoReplay();
    stopTurnTimer();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.suspend().catch(() => {});
  } else {
    isPageHidden = false;
    if (soundEnabled) {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      startBgm();
    }
    if (!isGameOver) resumeTurnTimer();
  }
}
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', () => { isPageHidden = true; pauseBgm(); stopGuideSpeech(); stopAutoReplay(); stopTurnTimer(); });
window.addEventListener('pageshow', () => { isPageHidden = false; if (soundEnabled) startBgm(); });

function playPieceSound() {
  if (!soundEnabled || isPageHidden) return;
  initAudio();

  if (audioCtx && realKomaAudioBuffer) {
    try {
      const src = audioCtx.createBufferSource();
      src.buffer = realKomaAudioBuffer;
      src.connect(audioCtx.destination);
      src.start(0);
      return;
    } catch(e) {}
  }

  if (realKomaAudioElement) {
    try {
      realKomaAudioElement.currentTime = 0;
      realKomaAudioElement.play().then(() => {}).catch(() => {
        playSynthesizedKomaSound();
      });
      return;
    } catch(e) {}
  }

  playSynthesizedKomaSound();
}

function playUiClickSound() {
  if (!soundEnabled || isPageHidden) return;
  initAudio();
  if (!audioCtx) return;

  try {
    const now = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(620, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.038);

    g.gain.setValueAtTime(0.12, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    osc.connect(g);
    g.connect(audioCtx.destination);

    osc.start(now);
    osc.stop(now + 0.038);
  } catch(e) {}
}

function playSynthesizedKomaSound() {
  if (!audioCtx) return;
  const now = audioCtx.currentTime;

  try {
    const clickSize = Math.floor(audioCtx.sampleRate * 0.0035);
    const clickBuffer = audioCtx.createBuffer(1, clickSize, audioCtx.sampleRate);
    const clickData = clickBuffer.getChannelData(0);
    for (let i = 0; i < clickSize; i++) {
      clickData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (clickSize * 0.28));
    }
    const clickNode = audioCtx.createBufferSource();
    clickNode.buffer = clickBuffer;

    const clickFilter = audioCtx.createBiquadFilter();
    clickFilter.type = 'bandpass';
    clickFilter.frequency.setValueAtTime(4200, now);
    clickFilter.Q.setValueAtTime(2.8, now);

    const clickGain = audioCtx.createGain();
    clickGain.gain.setValueAtTime(0.95, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.0035);

    clickNode.connect(clickFilter);
    clickFilter.connect(clickGain);
    clickGain.connect(audioCtx.destination);
    clickNode.start(now);

    const bodySize = Math.floor(audioCtx.sampleRate * 0.038);
    const bodyBuffer = audioCtx.createBuffer(1, bodySize, audioCtx.sampleRate);
    const bodyData = bodyBuffer.getChannelData(0);
    for (let i = 0; i < bodySize; i++) {
      bodyData[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bodySize * 0.22));
    }
    const bodyNode = audioCtx.createBufferSource();
    bodyNode.buffer = bodyBuffer;

    const bodyFilter = audioCtx.createBiquadFilter();
    bodyFilter.type = 'bandpass';
    bodyFilter.frequency.setValueAtTime(210, now);
    bodyFilter.Q.setValueAtTime(3.5, now);

    const bodyGain = audioCtx.createGain();
    bodyGain.gain.setValueAtTime(0.75, now);
    bodyGain.gain.exponentialRampToValueAtTime(0.001, now + 0.038);

    bodyNode.connect(bodyFilter);
    bodyFilter.connect(bodyGain);
    bodyGain.connect(audioCtx.destination);
    bodyNode.start(now);
  } catch(e) {}
}

function playCheckSound() {
  if (!soundEnabled || isPageHidden) return; initAudio();
  const now = audioCtx.currentTime, osc = audioCtx.createOscillator(), g = audioCtx.createGain();
  osc.type = 'sine'; osc.frequency.setValueAtTime(110, now); osc.frequency.exponentialRampToValueAtTime(38, now + 0.5);
  g.gain.setValueAtTime(0.7, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
  osc.connect(g); g.connect(audioCtx.destination);
  osc.start(now); osc.stop(now + 0.55);
}

function playVictorySound() {
  if (!soundEnabled || isPageHidden) return; initAudio();
  const now = audioCtx.currentTime;
  const melody = [{f:220,t:0.0,d:0.18},{f:261,t:0.16,d:0.18},{f:293,t:0.32,d:0.22},{f:392,t:0.52,d:0.30},{f:440,t:0.78,d:0.75}];
  melody.forEach(m => {
    const osc = audioCtx.createOscillator(), g = audioCtx.createGain();
    osc.type = 'sawtooth'; osc.frequency.setValueAtTime(m.f, now + m.t);
    g.gain.setValueAtTime(0.0, now + m.t); g.gain.linearRampToValueAtTime(0.25, now + m.t + 0.03);
    g.gain.exponentialRampToValueAtTime(0.001, now + m.t + m.d);
    osc.connect(g); g.connect(audioCtx.destination);
    osc.start(now + m.t); osc.stop(now + m.t + m.d);
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
let celebrationParticles = [];
function launchFireworksCelebration() {
  canvasCelebration.width = window.innerWidth; canvasCelebration.height = window.innerHeight;
  celebrationParticles = [];
  for (let i = 0; i < 90; i++) {
    celebrationParticles.push({
      x: canvasCelebration.width / 2, y: canvasCelebration.height * 0.4,
      vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10,
      col: ['#ffd700', '#ff3b30', '#ffffff', '#ff9500'][Math.floor(Math.random() * 4)],
      alpha: 1, size: Math.random() * 3 + 2
    });
  }

  let startTime = Date.now();
  function loop() {
    ctxCelebration.clearRect(0, 0, canvasCelebration.width, canvasCelebration.height);
    celebrationParticles.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.alpha -= 0.015;
      if (p.alpha > 0) {
        ctxCelebration.fillStyle = p.col; ctxCelebration.globalAlpha = p.alpha;
        ctxCelebration.beginPath(); ctxCelebration.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctxCelebration.fill();
      }
    });
    if (Date.now() - startTime < 3500) requestAnimationFrame(loop);
    else ctxCelebration.clearRect(0, 0, canvasCelebration.width, canvasCelebration.height);
  }
  loop();
}

/* Web Speech API 朗読管理 */
let guideVoiceGender = 'male';
let currentReadingCardId = null;

function setGuideVoiceGender(gender) {
  playUiClickSound();
  guideVoiceGender = gender;
  document.getElementById('btn-voice-male').classList.toggle('active', gender === 'male');
  document.getElementById('btn-voice-female').classList.toggle('active', gender === 'female');
  if (currentReadingCardId) {
    const cardId = currentReadingCardId;
    stopGuideSpeech();
    toggleCardSpeech(cardId);
  }
}

function stopGuideSpeech() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  if (currentReadingCardId) {
    const cardEl = document.getElementById(currentReadingCardId);
    if (cardEl) {
      cardEl.classList.remove('reading-active');
      const btn = cardEl.querySelector('.card-speech-btn');
      if (btn) btn.innerHTML = '🔊 朗読';
    }
    currentReadingCardId = null;
  }
}

function cleanSpeechText(rawText) {
  let text = rawText.replace(/🔊\s*朗読/g, '').replace(/⏹\s*停止/g, '').replace(/[⚜🪭📜🔰🔥🛡⚔👑🏯💡⚖▶◀⏭♪🎞☗☖]/g, '');
  text = text.replace(/７六歩/g, 'ななろくふ、').replace(/２六歩/g, 'にいろくふ、').replace(/４八銀/g, 'よんはちぎん、');
  text = text.replace(/６八玉/g, 'ろくはちぎょく、').replace(/２五歩/g, 'にすごふ、');
  text = text.replace(/Lv\.(\d+)/gi, 'レベル$1、');
  text = text.replace(/vs/gi, '、対、').replace(/【/g, '、').replace(/】/g, '、').replace(/・/g, '。').replace(/\s+/g, ' ').trim();
  return text;
}

function toggleCardSpeech(cardId) {
  if (!('speechSynthesis' in window)) {
    triggerCutin('音声指南は非対応の端末にござる');
    return;
  }
  if (currentReadingCardId === cardId) {
    stopGuideSpeech();
    return;
  }
  stopGuideSpeech();

  const cardEl = document.getElementById(cardId);
  if (!cardEl) return;
  const btn = cardEl.querySelector('.card-speech-btn');
  const speechText = cleanSpeechText(cardEl.innerText);
  if (!speechText) return;

  initAudio();
  currentReadingCardId = cardId;
  cardEl.classList.add('reading-active');
  if (btn) btn.innerHTML = '⏹ 停止';

  const uttr = new SpeechSynthesisUtterance(speechText);
  uttr.lang = 'ja-JP';

  const jaVoices = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('ja'));
  if (guideVoiceGender === 'female') {
    const fVoice = jaVoices.find(v => /female|kyoko|haruka|ayumi|sayaka|nanami|hikari/i.test(v.name));
    if (fVoice) uttr.voice = fVoice;
    uttr.pitch = 1.15; uttr.rate = 0.96;
  } else {
    const mVoice = jaVoices.find(v => /male|otoya|keita|ichiro|hattori|kenji/i.test(v.name));
    if (mVoice) uttr.voice = mVoice;
    uttr.pitch = 0.85; uttr.rate = 0.93;
  }

  const resetSpeechUI = () => {
    if (currentReadingCardId === cardId) {
      cardEl.classList.remove('reading-active');
      if (btn) btn.innerHTML = '🔊 朗読';
      currentReadingCardId = null;
    }
  };
  uttr.onend = resetSpeechUI;
  uttr.onerror = resetSpeechUI;
  window.speechSynthesis.speak(uttr);
}

if ('speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => { window.speechSynthesis.getVoices(); };
}

/* =========================================================
   【視線誘導 ＆ 手番・思考タイマー管理エンジン（深さ・確定銘板維持対応）】
   ========================================================= */
let turnStartTime = 0;
let turnTimerInterval = null;
let currentThinkingSide = 'PLAYER';
let currentThinkingName = '';

let totalTimeSpentMs = { PLAYER: 0, AI: 0 };
let movesCountBySide = { PLAYER: 0, AI: 0 };

// 直近着手完了情報（手番交代後もパネル上に確定銘板を維持する）
let lastSettledMoveInfo = {
  PLAYER: null,
  AI: null
};

function formatTimeMinutesSeconds(totalSec) {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (m === 0) return `${s}秒`;
  return `${m}分${s.toString().padStart(2, '0')}秒`;
}

/* 手番フォーカス切り替え */
function updateTurnFocus(activeTurn) {
  const pPanel = document.getElementById('player-panel');
  const aiPanel = document.getElementById('ai-panel');

  if (pPanel) pPanel.classList.remove('turn-focus-player');
  if (aiPanel) aiPanel.classList.remove('turn-focus-enemy');

  if (activeTurn === 'PLAYER') {
    if (pPanel) pPanel.classList.add('turn-focus-player');
  } else if (activeTurn === 'AI') {
    if (aiPanel) aiPanel.classList.add('turn-focus-enemy');
  }
}

function startTurnTimer(side, warlordName) {
  stopTurnTimer();
  currentThinkingSide = side;
  currentThinkingName = warlordName;
  turnStartTime = Date.now();

  updateTurnFocus(side);
  updateThinkingTimerDisplay();

  turnTimerInterval = setInterval(() => {
    updateThinkingTimerDisplay();
  }, 100);
}

function updateThinkingTimerDisplay() {
  if (isGameOver || isReviewingPast()) return;
  const elapsedSec = Math.max(0.1, (Date.now() - turnStartTime) / 1000).toFixed(1);
  const currentStep = moveObjectsHistory.length + 1;
  const isPlayer = (currentThinkingSide === 'PLAYER');

  const pThinkDisp = document.getElementById('player-thinking-disp');
  const aiThinkDisp = document.getElementById('ai-thinking-disp');

  if (isExhibitionActive) {
    updateExhibitionThinkingDisplay(true);
    return;
  }

  if (isPlayer) {
    if (pThinkDisp) {
      pThinkDisp.style.display = 'inline-flex';
      pThinkDisp.className = 'warlord-thinking-inline timer-gold-box';
      pThinkDisp.innerHTML = `🪭 采配思案 <b>${elapsedSec}秒</b>`;
    }
    // 相手側（AI）は直前の着手確定情報を維持
    if (aiThinkDisp) {
      if (lastSettledMoveInfo.AI) {
        aiThinkDisp.style.display = 'inline-flex';
        aiThinkDisp.className = 'warlord-thinking-inline timer-confirmed-box';
        aiThinkDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo.AI.timeSec}秒</b> (深さ${lastSettledMoveInfo.AI.depth})`;
      } else {
        aiThinkDisp.style.display = 'none';
      }
    }
  } else {
    if (aiThinkDisp) {
      aiThinkDisp.style.display = 'inline-flex';
      aiThinkDisp.className = 'warlord-thinking-inline timer-gold-box';
      const curD = Math.max(1, exhibitionAchievedDepth);
      const targetD = WARLORDS_DATA[currentAiLevel]?.targetDepth || 4;
      aiThinkDisp.innerHTML = `🧠 敵将熟慮 <b>${elapsedSec}秒</b> (深さ ${curD}/${targetD})`;
    }
    // プレイヤー側は直前の着手確定情報を維持
    if (pThinkDisp) {
      if (lastSettledMoveInfo.PLAYER) {
        pThinkDisp.style.display = 'inline-flex';
        pThinkDisp.className = 'warlord-thinking-inline timer-confirmed-box';
        pThinkDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo.PLAYER.timeSec}秒</b>`;
      } else {
        pThinkDisp.style.display = 'none';
      }
    }
  }

  const isPlayerSente = (battleStartTurn === 'PLAYER');
  if (isPlayer && !tacticsCandidates.length && !isHintThinking) {
    const pName = PLAYER_WARLORDS[currentMyWarlordId].name;
    const markChar = isPlayerSente ? '☗' : '☖';
    setOrderMessage({
      line1: `第${currentStep}手 ── <b style="color:#ffd700;">${markChar} ${pName}公の手番に候</b>`,
      line2: '盤上の駒または持ち駒を選び、次の一手を指されよ！'
    }, true, 'player');
  } else if (!isPlayer) {
    const eName = WARLORDS_DATA[currentAiLevel].name;
    const markChar = isPlayerSente ? '☖' : '☗';
    setOrderMessage({
      line1: `第${currentStep}手 ── <b style="color:#ffe6aa;">${markChar} ${eName}が軍略を巡らせております…</b>`,
      line2: '敵の狙いを見定め、受けの構えを整えられよ。'
    }, false, 'enemy');
  }
}

function stopTurnTimer() {
  if (turnTimerInterval) {
    clearInterval(turnTimerInterval);
    turnTimerInterval = null;
  }
}

function resumeTurnTimer() {
  if (!isGameOver && !isReviewingPast() && turn) {
    if (isExhibitionActive) {
      if (isAiThinking) {
        const isSenteTurn = (turn === 'PLAYER');
        const targetKey = isSenteTurn ? exhibitionSenteTarget : exhibitionGoteTarget;
        const targetData = getTargetAIData(targetKey);
        startTurnTimer(turn, targetData.name);
      }
    } else {
      const name = (turn === 'PLAYER') 
        ? PLAYER_WARLORDS[currentMyWarlordId].name
        : WARLORDS_DATA[currentAiLevel].name;
      startTurnTimer(turn, name);
    }
  }
}

function recordTurnTime(side, customElapsedMs = null) {
  stopTurnTimer();
  const spentMs = (typeof customElapsedMs === 'number' && customElapsedMs > 0)
    ? customElapsedMs
    : Math.max(100, Date.now() - turnStartTime);
  totalTimeSpentMs[side] = (totalTimeSpentMs[side] || 0) + spentMs;
  movesCountBySide[side] = (movesCountBySide[side] || 0) + 1;
  const secStr = (spentMs / 1000).toFixed(1);
  return secStr;
}

/* =========================================================
   武将ポートレート・アバター表示管理
   ========================================================= */
let avatarViewMode = { player: 'face', ai: 'face' };

function toggleWarlordAvatarView(side) {
  playUiClickSound();
  avatarViewMode[side] = (avatarViewMode[side] === 'face') ? 'crest' : 'face';
  const containerId = (side === 'player') ? 'player-avatar-container' : 'ai-avatar-container';
  const box = document.querySelector(`#${containerId} .portrait-container-box`);
  if (box) box.classList.toggle('show-crest', avatarViewMode[side] === 'crest');
}

function getWarlordPortraitHtml(warlordData, isInteractive = false, side = null) {
  if (!warlordData) return '';

  const candidates = [];
  
  if (warlordData.id && warlordData.id.startsWith('strategist_')) {
    if (warlordData.strategistImgId) candidates.push(`images/${warlordData.strategistImgId}`);
    if (warlordData.customImg) candidates.push(warlordData.customImg);
  } else {
    if (warlordData.customImg) candidates.push(warlordData.customImg);
    if (warlordData.strategistImgId) candidates.push(`images/${warlordData.strategistImgId}`);
  }

  if (warlordData.id) candidates.push(`images/${warlordData.id}`);
  if (warlordData.id === 'enemy_11') candidates.push('images/keiji');
  if (warlordData.id === 'inst_nanban') { candidates.push('images/ujisato'); candidates.push('images/nanban'); }
  if (warlordData.id === 'inst_kenshi') { candidates.push('images/yagyu'); candidates.push('images/kenshi'); }
  if (warlordData.id === 'inst_inja')   { candidates.push('images/josui'); candidates.push('images/inja'); }
  if (warlordData.id === 'inst_sokei')  { candidates.push('images/sokei'); candidates.push('images/meijin'); }

  const uniqueCandidates = [...new Set(candidates)];
  const primarySrc = `${uniqueCandidates[0]}.png`;
  const fallbackListJson = JSON.stringify(uniqueCandidates).replace(/"/g, '&quot;');
  const showCrestClass = (isInteractive && side && avatarViewMode[side] === 'crest') ? 'show-crest' : '';

  return `
    <div class="portrait-container-box ${showCrestClass}">
      <div class="portrait-crest-svg">
        <svg viewBox="0 0 100 100">${warlordData.portraitSvg}</svg>
      </div>
      <img src="${primarySrc}" alt="${warlordData.name}" class="portrait-face-img"
           data-candidates="${fallbackListJson}"
           data-cand-idx="0"
           data-ext-idx="0"
           onload="this.closest('.portrait-container-box').classList.add('portrait-has-image');"
           onerror="handlePortraitError(this);">
    </div>
  `;
}

window.handlePortraitError = function(img) {
  const exts = ['.png', '.jpg', '.webp'];
  let candList = [];
  try { candList = JSON.parse(img.getAttribute('data-candidates') || '[]'); } catch(e){}
  if (candList.length === 0) { img.remove(); return; }

  let cIdx = parseInt(img.getAttribute('data-cand-idx') || '0', 10);
  let eIdx = parseInt(img.getAttribute('data-ext-idx') || '0', 10);

  eIdx++;
  if (eIdx < exts.length) {
    img.setAttribute('data-ext-idx', eIdx.toString());
    img.src = `${candList[cIdx]}${exts[eIdx]}`;
  } else {
    cIdx++;
    if (cIdx < candList.length) {
      img.setAttribute('data-cand-idx', cIdx.toString());
      img.setAttribute('data-ext-idx', '0');
      img.src = `${candList[cIdx]}${exts[0]}`;
    } else {
      img.remove();
    }
  }
};

/* 軍師小顔札レンダリング */
let cachedStrategistImgId = null;
function getStrategistFaceHtml(imgId) {
  const base = `images/${imgId}`;
  return `
    <div style="width:100%; height:100%; position:relative; display:flex; align-items:center; justify-content:center;">
      <svg viewBox="0 0 40 40" style="width:100%; height:100%;">
        <rect width="40" height="40" fill="#2d1205"/>
        <circle cx="20" cy="16" r="10" fill="#ffd700"/>
        <path d="M 8,36 Q 20,22 32,36 Z" fill="#b31212"/>
      </svg>
      <img src="${base}.png" 
           onload="this.style.display='block'; var s=this.parentElement.querySelector('svg'); if (s) s.style.display='none';"
           onerror="
             if (!this.dataset.triedJpg) { this.dataset.triedJpg='true'; this.src='${base}.jpg'; }
             else if (!this.dataset.triedWebp) { this.dataset.triedWebp='true'; this.src='${base}.webp'; }
             else { this.remove(); }
           "
           style="display:none; width:100%; height:100%; object-fit:cover; object-position:center 10%; position:absolute; inset:0;">
    </div>
  `;
}

/* 公儀軍監・黄金軍配SVGアイコン */
function getGunbaiIconHtml() {
  return `
    <div style="width:100%; height:100%; display:flex; align-items:center; justify-content:center; background:radial-gradient(circle at center, #3d1405 0%, #0d0401 100%);">
      <svg viewBox="0 0 40 40" style="width:90%; height:90%;">
        <line x1="20" y1="20" x2="20" y2="38" stroke="#cca135" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M 17,35 Q 20,39 23,35" fill="none" stroke="#ff3b30" stroke-width="1.8"/>
        <path d="M 20,4 C 11,4 7,12 11,20 C 13,24 27,24 29,20 C 33,12 29,4 20,4 Z" fill="#140601" stroke="#ffd700" stroke-width="1.8"/>
        <circle cx="20" cy="13" r="4.5" fill="#ffd700"/>
        <circle cx="20" cy="13" r="2" fill="#d41717"/>
      </svg>
    </div>
  `;
}

/* =========================================================
   客分四英傑データ（実在の戦国名将・剣聖・軍師・一世名人）
   ========================================================= */
const INSTRUCTORS_DATA = {
  nanban: {
    id: 'inst_nanban', name: '蒲生氏郷', rank: 'アマ初段相当', clan: '会津国 ｜ 南蛮兵法・深さ3',
    sourceEngine: 'MicroMax / 西洋古典αβ探索',
    engineType: 'nanban', baseTroops: 15000, targetDepth: 3,
    depthSpec: '深さ3＋静止探索',
    featureShort: '信長公直伝の南蛮兵法と前進速攻。',
    quotes: {
      default: '「信長公直伝の南蛮兵法、日ノ本の将棋と融合させてご覧に入れよう！」',
      opening: '「燕雀安くんぞ鴻鵠の志を知らんや！ まずは堂々たる陣形を敷く！」',
      midgame: '「銀杏の葉が如く、前線へ兵を繰り出す！ 南蛮の筋、見切れるか！」',
      endgame: '「これぞ会津黒川の軍略！ 油断なく敵本陣を包囲せん！」',
      check: '「チェック… いや王手！ 我が南蛮槍の切っ先、かわしてみせよ！」',
      pinch: '「ム… 日ノ本の将棋、誠に侮りがたし！ 陣を組み直さねば！」',
      adv: '「我が優勢は揺るがぬ！ 氏郷の秘策、いざ受けてみよ！」'
    },
    defeatQuote: '「参り申した…！ 日ノ本の将棋の奥深さ、敬服いたした！」',
    victoryQuote: '「南蛮兵法の勝利！ 日ノ本の盤上、見事に制覇いたし候！」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#0d1829"/><circle cx="50" cy="45" r="22" fill="#1b2a47" stroke="#ffd700" stroke-width="2"/><line x1="50" y1="28" x2="50" y2="62" stroke="#ffd700" stroke-width="4"/><line x1="38" y1="40" x2="62" y2="40" stroke="#ffd700" stroke-width="4"/><circle cx="50" cy="40" r="4" fill="#ffffff"/>`
  },
  kenshi: {
    id: 'inst_kenshi', name: '柳生石舟斎', rank: 'アマ二段相当', clan: '大和国 ｜ 新陰流剣聖・深さ4',
    sourceEngine: 'Sunfish将棋 / LesserKai PST駆動',
    engineType: 'kenshi', baseTroops: 30000, targetDepth: 4,
    depthSpec: '深さ4＋PST配置評価',
    featureShort: '新陰流無刀取り。基本に忠実で隙なき構え。',
    quotes: {
      default: '「太刀を構えるが如く駒に魂を宿す。新陰流の太刀筋、受けてみよ。」',
      opening: '「隙のない構えこそ不敗の基本。陣を整えて静かに機を待つべし。」',
      midgame: '「刃と刃の切り結び！ ここからが新陰流・盤上白兵戦の本番ぞ！」',
      endgame: '「太刀筋は完全に定まった！ 必殺の一刀を本陣へ叩き込む！」',
      check: '「一刀両断！ 王手！ 我が太刀筋から逃れられると思うなよ！」',
      pinch: '「ぬうっ… 刃を交えて初めて知る貴殿の気迫、受けて立とうぞ！」',
      adv: '「我が太刀筋に乱れなし！ 新陰流無刀取りの極意、味わうがよい！」'
    },
    defeatQuote: '「見事な太刀筋… 我が剣、盤上に完敗にござる！」',
    victoryQuote: '「我が新陰流の太刀筋、盤上に見事に極まれり！」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1c0f05"/><polygon points="50,15 80,85 50,70 20,85" fill="#8c671a" stroke="#ffd700" stroke-width="2"/><line x1="50" y1="15" x2="50" y2="70" stroke="#ffd700" stroke-width="2.5"/><circle cx="50" cy="40" r="14" fill="none" stroke="#ffd700" stroke-width="1.8"/>`
  },
  inja: {
    id: 'inst_inja', name: '黒田如水', rank: 'アマ五段相当', clan: '播磨国 ｜ 神算鬼謀の隠者・深さ5',
    sourceEngine: 'Bonanza系統 置換表＆キラー探索',
    engineType: 'inja', baseTroops: 60000, targetDepth: 5,
    depthSpec: '深さ5＋置換表＋キラー探索',
    featureShort: '天下の天才軍師。相手の手を先読みし罠へ誘い込む。',
    quotes: {
      default: '「すべては我が盤上の絵図通り… 如水の読み、見破れるか。」',
      opening: '「盤上は静かなる深淵。布石の一手ひとつが勝敗を分かつぞ。」',
      midgame: '「ほほう、仕掛けてきたか。それもすべてこの如水の手のひらの上よ。」',
      endgame: '「天網恢恢疎にして漏らさず。これにて貴殿に逃げ場はなくなったぞ。」',
      check: '「これぞ深遠なる詰めろ！ 逃げ道はすべて塞がれておるぞ。」',
      pinch: '「ほほう… この如水の裏をかくか。面白い、一手興じようぞ。」',
      adv: '「天網恢恢疎にして漏らさず。神算鬼謀の網からは逃れられぬ。」'
    },
    defeatQuote: '「この如水の読みを超えるとは… まこと天下無双の器よ！」',
    victoryQuote: '「すべては我が読みの筋書き通り。盤上平定なり。」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#10061e"/><circle cx="50" cy="50" r="28" fill="none" stroke="#ba68c8" stroke-width="2.5" stroke-dasharray="4,4"/><path d="M 32,30 Q 50,12 68,30 L 74,70 Q 50,82 26,70 Z" fill="#b31212" stroke="#ffd700" stroke-width="1.8"/><circle cx="50" cy="50" r="9" fill="#ffd700"/>`
  },
  sokei: {
    id: 'inst_sokei', name: '大橋宗桂', titleHonor: '初代名人', rank: 'アマ八段〜九段相当', clan: '山城国 ｜ 将棋一世名人・深さ6',
    sourceEngine: 'Apery / やねうら王系統 Null-Move＋PVS探索',
    engineType: 'sokei', baseTroops: 100000, targetDepth: 6,
    depthSpec: '深さ6＋Null-Move枝刈り＋PVS探索',
    featureShort: '信長・家康公より名人を賜りし開祖。最高峰の極致。',
    quotes: {
      default: '「信長公、家康公の御前で極めし我が一世名人の技芸… 盤上に見せて進ぜよう。」',
      opening: '「盤上の礼法に乱れなし。古今無双の名人将棋、受けてみられよ。」',
      midgame: '「駒の響きが勝利の調べを奏でておる。隙なき名人の構え、崩せるか。」',
      endgame: '「これにて玉将の運命は定まれり。一手も狂わぬ寄せを放つ！」',
      check: '「一世名人の王手！ 逃れられる道は天地いずこにもなし！」',
      pinch: '「ほう…！ 我が名人の読みに挑む鋭い刃、見事な気迫にござる！」',
      adv: '「盤上の全ては定石の極みに収束す。我が一手、天下無敵なり。」'
    },
    defeatQuote: '「見事なり…！ 現代にこれほどの将棋の名手が現れようとは… 完敗にござる！」',
    victoryQuote: '「信長公、家康公に捧げし将棋名人の誇り… 今ここに極まれり！」',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1c072e"/><polygon points="50,10 88,28 78,92 22,92 12,28" fill="#380d59" stroke="#ffd700" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="50" r="18" fill="radial-gradient(circle, #ffd700, #b8860b)" stroke="#ffffff" stroke-width="1.5"/><text x="50" y="58" font-size="20" font-weight="900" fill="#1c072e" text-anchor="middle" font-family="Shippori Mincho, serif">名</text>`
  }
};

/* 主役武将（主役五傑） */
const PLAYER_WARLORDS = {
  sanada: {
    id: 'sanada', name: '真田幸村', clan: '信濃国 ｜ 真田赤備隊', themeColor: '#e61919',
    baseTroops: 3000, strategistName: '真田昌幸', strategistTitle: '表裏比興の父', strategistShort: '昌幸', strategistImgId: 'strategist_masayuki',
    bgGrad: 'radial-gradient(circle at 35% 35%, #6a0b0b 0%, #180202 100%)',
    quotes: {
      default: '「不惜身命！ この一手に命を懸ける！」',
      opening: '「六文銭の旗の下、まずは陣容を堅固に組み上げん！」',
      midgame: '「ここが天下の分水嶺！ 赤備え、敵陣の喉首を狙え！」',
      endgame: '「いざ敵本陣へ突入！ 一手も引かずに押し通る！」',
      check: '「真田が突撃！ ここが敵本陣の喉首ぞ！」',
      pinch: '「六文銭を胸に… まだだ、ここからが真田の戦よ！」',
      adv: '「好機至る！ 赤備え、全軍突撃せよ！」',
      defeat: '「我が武運ここに尽きるか… されど真田の魂は不滅ぞ！」',
      victory: '「義は勝てり！ 日本一の兵の武名、天下に刻んだり！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#4d0808"/><path d="M 28,32 Q 10,10 18,2 Q 30,16 34,26 Z" fill="#ffd700"/><path d="M 72,32 Q 90,10 82,2 Q 70,16 66,26 Z" fill="#ffd700"/><path d="M 30,48 Q 50,30 70,48 L 74,75 Q 50,82 26,75 Z" fill="#b31212" stroke="#ffd700" stroke-width="1.8"/><g fill="#ffd700" stroke="#330000" stroke-width="1"><circle cx="42" cy="42" r="4.5"/><circle cx="50" cy="42" r="4.5"/><circle cx="58" cy="42" r="4.5"/><circle cx="42" cy="52" r="4.5"/><circle cx="50" cy="52" r="4.5"/><circle cx="58" cy="52" r="4.5"/></g><path d="M 24,72 Q 50,96 76,72 L 72,82 Q 50,100 28,82 Z" fill="#ffd700"/>`
  },
  keiji: {
    id: 'keiji', name: '前田慶次', clan: '加賀国 ｜ 天下無双の傾奇者', themeColor: '#ffd700',
    baseTroops: 3000, strategistName: '奥村助右衛門', strategistTitle: '加賀前田の親友', strategistShort: '助右衛門', strategistImgId: 'strategist_sukeemon',
    bgGrad: 'radial-gradient(circle at 35% 35%, #4a2800 0%, #140500 100%)',
    quotes: {
      default: '「大ふへん者とは大武辺者のことよ！ いざ参る！」',
      opening: '「陣立てなんぞ堅苦しいぜ！ 派手に傾いて盤面を賑やかにしようや！」',
      midgame: '「いいねえ、白兵戦だ！ 松風、ここ一番の槍働きを見せてやれ！」',
      endgame: '「これにて幕引きといくかい！ 天下一の傾奇槍を受けてみろ！」',
      check: '「よっしゃあ！ これぞ天下無双の傾奇の一手よ！」',
      pinch: '「窮地ほど面白え！ 松風、もう一跳ねするぜ！」',
      adv: '「ハハハ！ 派手に行こうぜ、天下を傾けてみせろ！」',
      defeat: '「派手に散るのもまた一興… 見事な一手だったぜ！」',
      victory: '「傾き通して大勝利よ！ 助右衛門、天下の銘酒をあけようぜ！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#301404"/><path d="M 20,80 L 80,20" stroke="#d41313" stroke-width="6" stroke-linecap="round"/><path d="M 32,45 Q 50,22 68,45 L 72,72 Q 50,80 28,72 Z" fill="#613808" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="45" r="9" fill="#ffd700"/><circle cx="50" cy="26" r="6" fill="#ffd700"/><circle cx="68" cy="38" r="6" fill="#ffd700"/><circle cx="62" cy="62" r="6" fill="#ffd700"/><circle cx="38" cy="62" r="6" fill="#ffd700"/><circle cx="32" cy="38" r="6" fill="#ffd700"/>`
  },
  masamune: {
    id: 'masamune', name: '伊達政宗', clan: '陸奥国 ｜ 独眼竜の牙', themeColor: '#d4aa50',
    baseTroops: 3000, strategistName: '片倉小十郎', strategistTitle: '竜の右目・天下二大軍師', strategistShort: '小十郎', strategistImgId: 'strategist_kojuro',
    bgGrad: 'radial-gradient(circle at 35% 35%, #0d2847 0%, #030a14 100%)',
    quotes: {
      default: '「天下の隙、この独眼竜が見逃さぬ！ 派手に行こうぜ！」',
      opening: '「まずは右目の小十郎と陣を敷く。奥州の竜は静かに爪を研ぐぜ。」',
      midgame: '「喰らいつけ！ 竜の牙で敵の中央陣地を食いちぎってやれ！」',
      endgame: '「チェックメイトだ！ 独眼竜の前にひれ伏すがいい！」',
      check: '「竜の牙が届いたぜ！ 逃げられると思うなよ！」',
      pinch: '「チッ、手痛い一撃だな… だが独眼竜の牙は折れねえ！」',
      adv: '「好機到来！ 一気に盤上を制圧するぜ！」',
      defeat: '「俺の野望が盤上に散るか… 小十郎、後は頼んだぜ…」',
      victory: '「天下を睨む独眼竜の前に敵はなし！ 鬨の声をあげろ！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#061224"/><path d="M 16,36 Q 66,8 86,58 Q 50,30 16,36 Z" fill="#ffd700"/><path d="M 28,48 Q 50,28 72,48 L 76,76 Q 50,84 24,76 Z" fill="#0d1f36" stroke="#ffd700" stroke-width="1.8"/><circle cx="40" cy="60" r="4" fill="#ffd700"/><path d="M 34,58 L 46,62" stroke="#000" stroke-width="2"/>`
  },
  kanetsugu: {
    id: 'kanetsugu', name: '直江兼続', clan: '越後国 ｜ 義と愛の軍師', themeColor: '#ba68c8',
    baseTroops: 3000, strategistName: '上杉景勝', strategistTitle: '越後の総帥・寡黙の主君', strategistShort: '景勝', strategistImgId: 'strategist_kagekatsu',
    bgGrad: 'radial-gradient(circle at 35% 35%, #2a0836 0%, #0b0110 100%)',
    quotes: {
      default: '「義を見てせざるは勇なきなり！ 義の刃を受けてみよ！」',
      opening: '「愛の一文字を前立に掲げ、礼節正しく陣容を整えん。」',
      midgame: '「不義の駒運びには鉄槌を下す！ これぞ越後流・愛の采配！」',
      endgame: '「大義はすでに定まれり！ 義理を通し、敵本陣を包囲せん！」',
      check: '「義理を通し、不義を断つ！ これぞ愛の一手！」',
      pinch: '「義の旗印、決して倒れはせぬ！ 陣形を立て直すぞ！」',
      adv: '「大義は我が軍にあり！ 正道を以て制さん！」',
      defeat: '「義を貫き通した… 悔いはござらぬ、御屋形様…！」',
      victory: '「大義の前に邪道なし！ 愛と義の一手、天下に示せり！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1c0524"/><text x="50" y="44" font-size="34" font-weight="900" fill="#ffd700" text-anchor="middle" font-family="Shippori Mincho, serif">愛</text><path d="M 28,48 Q 50,32 72,48 L 75,76 Q 50,84 25,76 Z" fill="#30103b" stroke="#ffd700" stroke-width="1.8"/><path d="M 24,72 Q 50,94 76,72" fill="none" stroke="#ba68c8" stroke-width="3"/>`
  },
  tadakatsu: {
    id: 'tadakatsu', name: '本多忠勝', clan: '三河国 ｜ 徳川四天王・蜻蛉切', themeColor: '#ffb74d',
    baseTroops: 3000, strategistName: '本多正信', strategistTitle: '徳川の知謀・佐渡守', strategistShort: '正信', strategistImgId: 'strategist_masanobu',
    bgGrad: 'radial-gradient(circle at 35% 35%, #3d2406 0%, #0f0701 100%)',
    quotes: {
      default: '「我が蜻蛉切に切れぬものなし！ 迎え撃ってくれよう！」',
      opening: '「名槍・蜻蛉切を構え、三河武士の不動の陣を築く！」',
      midgame: '「五十七度傷なしの武名、伊達ではないわ！ 突き破れ！」',
      endgame: '「敵将、観念せい！ 蜻蛉切の射程から逃れる術はなし！」',
      check: '「天下無双の槍撃！ 敵将、そこを動くな！」',
      pinch: '「五十七度の合戦、一度の傷も負わぬ儂が退くものか！」',
      adv: '「我が槍の前に敵なし！ 押し通るぞ！」',
      defeat: '「無傷を誇りし儂が敗れるとは… 誠に見事な采配であった！」',
      victory: '「蜻蛉切の威光、盤上に轟けり！ 我が生涯、不敗なり！」'
    },
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1f1103"/><path d="M 22,25 Q 12,46 32,54 Q 18,36 28,26 Z" fill="#ffd700"/><path d="M 78,25 Q 88,46 68,54 Q 82,36 72,26 Z" fill="#ffd700"/><path d="M 30,48 Q 50,30 70,48 L 74,76 Q 50,84 26,76 Z" fill="#241505" stroke="#ffd700" stroke-width="1.8"/><circle cx="50" cy="62" r="14" fill="none" stroke="#ffd700" stroke-width="3.5" stroke-dasharray="3,3"/>`
  }
};

/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   メインスクリプト（軍略・演出・思考エンジン・御前試合統合管理）
   【パート 2 / 2】
   ========================================================= */

/* 対戦武将十一人 */
const WARLORDS_DATA = {
  1: {
    id: 'enemy_1', province: '尾張国', name: '木下藤吉郎', clan: '尾張国｜織田足軽隊', maxTroops: 3000, targetDepth: 1, depthSpec: '深さ1＋足軽速攻',
    featureShort: '足軽戦法。前進重視。', tacticsHint: '駒にヒモをつけ、角・飛車の道を開いて突入されよ！',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#140d06"/><path d="M50 20 Q56 28 50 36 Q44 28 50 20 Z M50 36 Q62 50 50 68 Q38 50 50 68 Z M50 68 Q68 85 50 94 Q32 85 50 68 Z" fill="#ffd700"/>`,
    quotes: {
      default: '「草履取りとて天下を夢見候！ 足軽の意地、見せてくれよう！」',
      opening: '「まずは歩を一歩前へ！ 出世の道も一歩からでござる！」',
      midgame: '「わ、わ、混戦でござる！ 足軽隊、踏みとどまれ！」',
      endgame: '「ここまできたら一歩も引けぬ！ 猿の底力、喰らいなされ！」',
      check: '「猿の一撃、侮りめさるな！」',
      pinch: '「あわわ…！ 信長様にお叱りを受けてしまう！」',
      adv: '「出世の足音が聞こえてき申した！」'
    },
    defeatQuote: '「参り申した…！ されど猿は何度でも木を登り候！」', victoryQuote: '「勝ったぞ！ 信長様、藤吉郎やりましたぞ！」'
  },
  2: {
    id: 'enemy_2', province: '加賀国', name: '前田利家', clan: '加賀国｜槍の又左', maxTroops: 8000, targetDepth: 1, depthSpec: '深さ1＋槍の突破',
    featureShort: '中央5筋から飛車で突進。', tacticsHint: '真ん中に金銀を配して防壁を築き、飛車の突撃を跳ね返されよ！',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#180707"/><circle cx="50" cy="50" r="10" fill="#ffd700"/><circle cx="50" cy="24" r="8" fill="#ffd700"/><circle cx="75" cy="42" r="8" fill="#ffd700"/><circle cx="65" cy="74" r="8" fill="#ffd700"/><circle cx="35" cy="74" r="8" fill="#ffd700"/><circle cx="25" cy="42" r="8" fill="#ffd700"/>`,
    quotes: {
      default: '「我が槍に迷いなし！ 槍の又左が一撃、盤上に受けてみよ！」',
      opening: '「前田の槍衾、まずは陣形を整え、中央を睨むぞ！」',
      midgame: '「中央突破！ 槍の穂先で敵の守りをこじ開けてくれる！」',
      endgame: '「勝負は此処に極まれり！ 又左の槍を喰らえ！」',
      check: '「槍の又左、一騎当千の突撃ぞ！」',
      pinch: '「ぬう…！ 前田の槍衾を崩されるとは！」',
      adv: '「槍を引くな！ この利家が押し通る！」'
    },
    defeatQuote: '「見事な槍さばき… 前田の当主として完敗を認めよう！」', victoryQuote: '「槍の又左の前に敵なし！ 百万石の礎となれ！」'
  },
  3: {
    id: 'enemy_3', province: '越前国', name: '柴田勝家', clan: '越前国｜鬼柴田', maxTroops: 15000, targetDepth: 2, depthSpec: '深さ2＋瓶割り突進',
    featureShort: '歩と銀で正面突破。', tacticsHint: '横から飛車・角の射線で銀の首を狙い撃たれよ！',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#150a04"/><path d="M30 40 Q50 25 70 40 Q50 48 30 40 Z M30 65 Q50 50 70 65 Q50 73 30 65 Z" fill="#ffd700"/>`,
    quotes: {
      default: '「かかれ柴田の突進力、小細工など粉砕してくれるわ！」',
      opening: '「退路の瓶は割った！ 前進あるのみ、陣を進めよ！」',
      midgame: '「銀をぶち込め！ 鬼柴田の猛進は誰にも止められぬぞ！」',
      endgame: '「城もろとも叩き潰す！ 覚悟いたせ！」',
      check: '「鬼柴田の剛腕、いざ受けてみよ！」',
      pinch: '「ぐぬ… 瓶割り柴田、退路を断って迎え撃つ！」',
      adv: '「かかれ！ かかれ柴田の猛進を止められるか！」'
    },
    defeatQuote: '「無念…！ 瓶を割れども、貴殿の策を砕けなんだか…！」', victoryQuote: '「ガハハ！ 鬼柴田の突進を止められる者などおらぬわ！」'
  },
  4: {
    id: 'enemy_4', province: '近江国', name: '浅井長政', clan: '近江国｜浅井軍総帥', maxTroops: 25000, targetDepth: 2, depthSpec: '深さ2＋三間飛車',
    featureShort: '三間飛車の持久戦。', tacticsHint: '自玉を美濃囲い等に囲ってからじっくり攻略されよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#0d1824"/><g fill="none" stroke="#ffd700" stroke-width="3"><polygon points="50,18 64,26 64,42 50,50 36,42 36,26"/><polygon points="36,44 50,52 50,68 36,76 22,68 22,52"/><polygon points="64,44 78,52 78,68 64,76 50,68 50,52"/></g>`,
    quotes: {
      default: '「信義を重んじ、我が陣を進めん！ 浅井の誇り、見よ！」',
      opening: '「三間に飛車を振り、堅牢な美濃囲いを築く。隙は見せぬ。」',
      midgame: '「義理と信義の一撃！ 盤上の不義を打ち払わん！」',
      endgame: '「お市、見ていてくれ… 浅井の武門、ここに示さん！」',
      check: '「信義の一撃、ここを退くわけにはいかぬ！」',
      pinch: '「信義を貫く刻… お市、すまぬ…」',
      adv: '「我が陣容に乱れなし！ 義の勝利を！」'
    },
    defeatQuote: '「浅井の誇り、盤上に散る… お市、許せよ…」', victoryQuote: '「信義は勝てり！ 近江の誇りは揺るぎなし！」'
  },
  5: {
    id: 'enemy_5', province: '美濃国', name: '明智光秀', clan: '美濃国｜智謀の軍総帥', maxTroops: 40000, targetDepth: 3, depthSpec: '深さ3＋静止探索',
    featureShort: '隙を突く知謀。', tacticsHint: '自陣の駒同士を常に連結させ、隙を作らぬよう戦われよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#09141c"/><polygon points="50,18 60,38 82,38 65,52 72,74 50,60 28,74 35,52 18,38 40,38" fill="#ffd700"/>`,
    quotes: {
      default: '「時は今、天が下知る五月哉。我が智謀、見切れるか！」',
      opening: '「綿密なる計算こそ勝利の母。静かに布陣を敷く。」',
      midgame: '「貴殿の駒の乱れ、すでに計算に入っておる。」',
      endgame: '「時満ちたれり。これより本陣急襲を仕掛ける！」',
      check: '「敵は本能寺に… いや、貴殿の本陣にあり！」',
      pinch: '「天運は我を見放すというのか…！ まだだ！」',
      adv: '「盤上の全て、我が掌の上にて動いておる。」'
    },
    defeatQuote: '「我が天運の尽きる刻… 貴殿の軍略、誠にお見事…」', victoryQuote: '「時は今！ 天下を統べるは、この光秀よ！」'
  },
  6: {
    id: 'enemy_6', province: '越後国', name: '上杉謙信', clan: '越後国｜越後の龍・軍神', maxTroops: 60000, targetDepth: 3, depthSpec: '深さ3＋車懸り射線',
    featureShort: '角行と龍馬の遠距離砲撃。', tacticsHint: '斜めの射線上に自軍の大事な駒を置かぬよう注意されよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#14061a"/><path d="M 26,45 Q 50,18 74,45 L 76,78 Q 50,86 24,78 Z" fill="#e8e8e8" stroke="#ffd700" stroke-width="1.8"/><circle cx="50" cy="46" r="16" fill="#1c0a24"/><text x="50" y="52" font-size="14" font-weight="900" fill="#ffd700" text-anchor="middle">毘</text>`,
    quotes: {
      default: '「毘沙門天の御加護、我が軍にあり！ 車懸りの陣、進めよ！」',
      opening: '「大義なき戦に勝利なし。毘沙門天の旗を掲げよ。」',
      midgame: '「車懸りの陣！ 龍の射線で敵陣を断ち割ってくれよう！」',
      endgame: '「天命ここに定まる！ 義の刃、いざ振り下ろさん！」',
      check: '「龍の爪牙、敵本陣を裂く！」',
      pinch: '「運は天にあり、鎧は胸にあり！ 毘沙門天よ！」',
      adv: '「車懸り、休むこと莫れ！ 義戦を完遂せん！」'
    },
    defeatQuote: '「極楽も地獄も先は有明の… 義戦を尽くし、悔いはなし！」', victoryQuote: '「毘沙門天の御前、悪は滅び義は輝かん！」'
  },
  7: {
    id: 'enemy_7', province: '甲斐国', name: '武田信玄', clan: '甲斐国｜甲斐の虎', maxTroops: 80000, targetDepth: 4, depthSpec: '深さ4＋風林火山要塞',
    featureShort: '金銀要塞の風林火山。', tacticsHint: '端攻め（1筋や9筋）から崩すのが妙手。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#1f0303"/><path d="M 22,34 Q 50,10 78,34 Q 90,60 76,76 Q 50,88 24,76 Q 10,60 22,34 Z" fill="#e0d6c3" stroke="#ffd700" stroke-width="1.8"/><polygon points="50,30 60,42 50,54 40,42" fill="#ffd700"/><polygon points="40,44 50,56 40,68 30,56" fill="#ffd700"/><polygon points="60,44 70,56 60,68 50,56" fill="#ffd700"/>`,
    quotes: {
      default: '「疾きこと風の如く、動かざること山の如し！ 蹂躙してくれる！」',
      opening: '「動かざること山の如し。金銀の石垣を築いて迎え撃つ。」',
      midgame: '「侵略すること火の如し！ 虎の牙、敵陣を焼き尽くせ！」',
      endgame: '「疾きこと風の如し！ 一気に勝負を決めてくれるわ！」',
      check: '「侵略すること火の如し！ 虎の牙、受けてみよ！」',
      pinch: '「人は城、人は石垣… 崩れるな、耐えよ！」',
      adv: '「風林火山の旗の下、天下を呑み込まん！」'
    },
    defeatQuote: '「人は城、人は石垣… 儂の石垣が崩れるとは… 見事！」', victoryQuote: '「風林火山の旗靡くところ、天下平定の道あり！」'
  },
  8: {
    id: 'enemy_8', province: '近江安土', name: '織田信長', clan: '近江安土｜第六天魔王', maxTroops: 110000, targetDepth: 4, depthSpec: '深さ4＋成駒電撃戦',
    featureShort: '龍王・龍馬の電撃速攻。', tacticsHint: '自玉を深く囲い、成駒の突入に耐え反撃せよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#140606"/><path d="M 28,42 Q 50,20 72,42 L 76,76 Q 50,86 24,76 Z" fill="#3b0808" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="27" r="10" fill="#ffd700"/><circle cx="68" cy="40" r="10" fill="#ffd700"/><circle cx="62" cy="62" r="10" fill="#ffd700"/><circle cx="38" cy="62" r="10" fill="#ffd700"/><circle cx="32" cy="40" r="10" fill="#ffd700"/><circle cx="50" cy="48" r="11" fill="#9b111e" stroke="#ffd700" stroke-width="1.5"/>`,
    quotes: {
      default: '「是非に及ばず。この信長に挑む愚かさ、骨身に刻め。」',
      opening: '「古い兵法など焼き捨てよ！ 新しき駒組みで蹂躙する！」',
      midgame: '「三段撃ちの如く、間断なき攻めを浴びせかけてくれよう！」',
      endgame: '「天下布武の前に立ちはだかる者は、灰燼に帰すのみ！」',
      check: '「三段撃ち！ 鉄砲の前に灰燼と帰すがよい！」',
      pinch: '「人間五十年、下天の内をくらぶれば… まだ死せぬ！」',
      adv: '「天下布武！ 我が前にひれ伏せ！」'
    },
    defeatQuote: '「是非に及ばず…！ 新たなる天下人よ、乱世を束ねよ！」', victoryQuote: '「天下布武！ 我が覇道に従わぬ者に明日はない！」'
  },
  9: {
    id: 'enemy_9', province: '摂津大坂', name: '豊臣秀吉', clan: '摂津大坂｜天下人・太閤', maxTroops: 150000, targetDepth: 4, depthSpec: '深さ4＋持ち駒包囲網',
    featureShort: '持ち駒包囲戦。', tacticsHint: '無駄な駒交換を避けて盤上を制圧せよ。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#241904"/><g stroke="#ffd700" stroke-width="2"><line x1="50" y1="45" x2="50" y2="8"/><line x1="50" y1="45" x2="25" y2="15"/><line x1="50" y1="45" x2="75" y2="15"/><line x1="50" y1="45" x2="10" y2="30"/><line x1="50" y1="45" x2="90" y2="30"/></g><path d="M 30,46 Q 50,30 70,46 L 74,75 Q 50,84 26,75 Z" fill="#694a08" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="56" r="10" fill="#ffd700"/>`,
    quotes: {
      default: '「天下は我が手中にある！ 太閤の前に跪くがよい！」',
      opening: '「太閤の財力と動員力、まずはじっくり見せて進ぜよう！」',
      midgame: '「大坂城の金蔵の如く、持ち駒を集めて包囲網を築くぞ！」',
      endgame: '「日輪の光は遮れぬ！ 天下人の底力、思い知れ！」',
      check: '「黄金の茶室ならぬ、黄金の王手を喰らいなされ！」',
      pinch: '「露と落ち、露と消えにし我が身かな… なにを！」',
      adv: '「日輪の如く、全てを照らし尽くして見せよう！」'
    },
    defeatQuote: '「露と落ち露と消えにし我が身かな… 天下の夢、託し申す！」', victoryQuote: '「天下人はこの秀吉よ！ 日輪の光、誰にも遮れぬ！」'
  },
  10: {
    id: 'enemy_10', province: '武蔵江戸', name: '徳川家康', clan: '武蔵江戸｜天下の覇者', maxTroops: 200000, targetDepth: 5, depthSpec: '深さ5＋鉄壁探索',
    featureShort: '最深探索の鉄壁。', tacticsHint: '軍師の【覚醒進言】と連携し神算鬼謀の一撃を狙うべし。',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#080f1f"/><path d="M 32,24 Q 50,14 68,24 Q 80,38 74,62 Q 50,78 26,62 Q 20,38 32,24 Z" fill="#1b2a47" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="50" r="18" fill="none" stroke="#ffd700" stroke-width="2.5"/><path d="M50 48 C44 32, 36 24, 50 18 C64 24, 56 32, 50 48 Z" fill="#ffd700"/><path d="M49 52 C33 50, 24 60, 26 74 C38 74, 46 64, 49 52 Z" fill="#ffd700"/><path d="M51 52 C67 50, 76 60, 74 74 C62 74, 54 64, 51 52 Z" fill="#ffd700"/>`,
    quotes: {
      default: '「人の一生は重荷を負うて… 焦るでない、勝機は此処にあり。」',
      opening: '「重荷を負いて遠き道を行くが如し。まずは鉄壁の布陣。」',
      midgame: '「耐えてこそ勝機あり。鳴かぬなら鳴くまで待とうホトトギス。」',
      endgame: '「機は熟した！ 徳川三百年泰平の礎、盤上に築かん！」',
      check: '「忍耐の刻は過ぎた！ 我が天下の礎となられよ！」',
      pinch: '「ぐぬぬ…！ 爪を噛むほどの焦燥よ… だが儂の天下は揺るがぬ！」',
      adv: '「鳴くまで待った甲斐があったわ。天下泰平の刻ぞ！」'
    },
    defeatQuote: '「見事なり… 乱世を鎮むる真の器、確かに見届けた…！」', victoryQuote: '「忍耐の末に泰平あり。天下は徳川の掌中にあり！」'
  },
  11: {
    id: 'enemy_11', province: '天下無双', name: '前田慶次', clan: '天下無双｜軍師AI：奥村助右衛門', maxTroops: 180000, targetDepth: 5, depthSpec: '深さ5＋神算鬼謀',
    featureShort: '軍師AI搭載。豪快傾奇と神算鬼謀の極み。', tacticsHint: '助右衛門の神算が仕組む罠に警戒し、守りを固めてから挑まれよ！',
    customImg: 'images/keiji',
    portraitSvg: `<rect width="100" height="100" rx="6" fill="#301404"/><path d="M 20,80 L 80,20" stroke="#d41313" stroke-width="6" stroke-linecap="round"/><path d="M 32,45 Q 50,22 68,45 L 72,72 Q 50,80 28,72 Z" fill="#613808" stroke="#ffd700" stroke-width="2"/><circle cx="50" cy="45" r="9" fill="#ffd700"/><circle cx="50" cy="26" r="6" fill="#ffd700"/><circle cx="68" cy="38" r="6" fill="#ffd700"/><circle cx="62" cy="62" r="10" fill="#ffd700"/><circle cx="38" cy="62" r="10" fill="#ffd700"/><circle cx="32" cy="38" r="6" fill="#ffd700"/>`,
    quotes: {
      default: '「軍師・助右衛門の策と俺の槍！ 天下を傾け尽くしてくれるわ！」',
      opening: '「助右衛門、面白い陣形を頼むぜ！ ど派手に傾こうじゃねえか！」',
      midgame: '「天下無双の傾奇戦！ 助右衛門の読みと俺の突進を止められるか！」',
      endgame: '「いよっ、大詰めだ！ 派手に散るか派手に勝つか、勝負勝負！」',
      check: '「助右衛門、一手もらったぜ！ これぞ傾奇王手！」',
      pinch: '「ハハハ！ 窮地ほど血が滾るわ！ ここからが本番よ！」',
      adv: '「松風、駆け抜けろ！ 助右衛門、一気に仕留めるぞ！」'
    },
    defeatQuote: '「見事だ！ 天下一の傾きを見せてもらったぜ、完敗よ！」', victoryQuote: '「大武辺者の勝ちよ！ 助右衛門、美味い酒を呑もうぜ！」'
  }
};

/* 宿命の対決録 */
const RIVALRIES = {
  'sanada_10': { title: '大坂の陣！ 日本一の兵 vs 天下の覇者', pQuote: '「不惜身命！ 徳川の天下、この幸村が盤上で覆して見せようぞ！」', eQuote: '「真田か…！ 目の上の瘤め、大坂の雪辱はさせぬぞ！」' },
  'keiji_2': { title: '前田の血脈！ 傾奇者 vs 槍の又左', pQuote: '「叔父貴、ぬるい水風呂の礼をせねばな！ ど派手に傾くぜ！」', eQuote: '「慶次！ その放蕩、前田の当主として盤上で成敗いたす！」' },
  'kanetsugu_10': { title: '直江状の義戦！ 義愛の軍師 vs 関東の巨魁', pQuote: '「不義の天下に道はなし！ 義の刃、盤上にて受けてみよ！」', eQuote: '「直江兼続… 筆鋒鋭き小僧め、盤上で捻り潰してくれる！」' },
  'masamune_9': { title: '天下への野望！ 独眼竜 vs 太閤の威光', pQuote: '「太閤殿下！ 白装束の礼は済んだ、盤上は容赦しねえ！」', eQuote: '「伊達の若造、その野心ごとのみ込んで見せようぞ！」' },
  'tadakatsu_7': { title: '三方ヶ原の雪辱！ 蜻蛉切 vs 甲斐の虎', pQuote: '「信玄公！ 我が蜻蛉切、家康公の盾となり砕かん！」', eQuote: '「忠勝、家康に過ぎたるものよ。虎の牙を凌げるか！」' }
};

const PIECES = { OU:'王将', HI:'飛車', KA:'角行', KI:'金将', GI:'銀将', KE:'桂馬', KY:'香車', FU:'歩兵', RY:'龍王', UM:'龍馬', NG:'成銀', NK:'成桂', NY:'成香', TO:'と金' };
const KIF_PIECE_NAMES = { OU:'玉', HI:'飛', KA:'角', KI:'金', GI:'銀', KE:'桂', KY:'香', FU:'歩', RY:'竜', UM:'馬', NG:'成銀', NK:'成桂', NY:'成香', TO:'と' };
const PROMOTED_PIECES = ['RY', 'UM', 'NG', 'NK', 'NY', 'TO'];
const KANJI_NUMS = ['一','二','三','四','五','六','七','八','九'];
const ZENKAKU_NUMS = ['１','２','３','４','５','６','７','８','９'];
const UNPROMOTE_MAP = { RY:'HI', UM:'KA', NG:'GI', NK:'KE', NY:'KY', TO:'FU', HI:'HI', KA:'KA', KI:'KI', GI:'GI', KE:'KE', KY:'KY', FU:'FU', OU:'OU' };
const PROMOTE_MAP = { HI:'RY', KA:'UM', GI:'NG', KE:'NK', KY:'NY', FU:'TO' };

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
let exhibitionAchievedDepth = 1, exhibitionTargetDepth = 3, exhibitionTotalNodes = 0;

let moveMetricsHistory = [], isPieceAnimating = false, currentHistoryTab = 'player';

// 外部AI用 Web Worker
let externalAiWorker = null;
function initExternalAiWorker() {
  if (externalAiWorker) externalAiWorker.terminate();
  try {
    externalAiWorker = new Worker('external_ai.js');
    externalAiWorker.onmessage = handleExternalWorkerMessage;
  } catch (e) { externalAiWorker = null; }
}
initExternalAiWorker();

function pickRandomStrategistWarlord() {
  const keys = Object.keys(PLAYER_WARLORDS);
  exhibitionRandomStrategistWarlordKey = keys[Math.floor(Math.random() * keys.length)];
}

/* 日本将棋連盟・公式棋譜フォーマット変換エンジン */
function formatOfficialKifuMove(m, idx, isKifFile = false) {
  if (!m) return '';
  const isSenteMove = (m.owner === (battleStartTurn === 'PLAYER' ? 'PLAYER' : 'AI'));
  const markChar = isSenteMove ? '☗' : '☖';
  
  const rawCode = m.code || 'FU';
  const pieceName = KIF_PIECE_NAMES[rawCode] || '歩';

  let isSameSquare = false;
  if (idx > 0 && moveObjectsHistory[idx - 1]) {
    const prev = moveObjectsHistory[idx - 1];
    if (prev.to.r === m.to.r && prev.to.c === m.to.c) isSameSquare = true;
  }

  let squareTxt = '';
  if (isSameSquare) {
    squareTxt = '同　';
  } else {
    const fileTxt = ZENKAKU_NUMS[8 - m.to.c];
    const rankTxt = KANJI_NUMS[m.to.r];
    squareTxt = `${fileTxt}${rankTxt}`;
  }

  let actionTxt = '';
  if (m.type === 'drop') {
    actionTxt = `${pieceName}打`;
  } else {
    const fromCoord = `(${9 - m.from.c}${m.from.r + 1})`;
    if (m.promote) {
      actionTxt = `${pieceName}成${fromCoord}`;
    } else {
      const canP = PROMOTE_MAP[rawCode] && (m.owner === 'AI' ? (m.from.r >= 6 || m.to.r >= 6) : (m.from.r <= 2 || m.to.r <= 2));
      const unpromStr = canP ? '不成' : '';
      actionTxt = `${pieceName}${unpromStr}${fromCoord}`;
    }
  }

  if (isKifFile) return `${squareTxt}${actionTxt}`;
  return `${markChar}${squareTxt}${actionTxt}`;
}

/* 武将名と称号の安全な分離フォーマッタ（初代名人・大橋宗桂の文字あふれ解消） */
function getWarlordDisplayNameHtml(data) {
  if (!data) return '';
  if (data.titleHonor) {
    return `<span class="warlord-title-badge">${data.titleHonor}</span>${data.name}`;
  }
  return data.name;
}

/* 先手・後手 ＆ 駒台・手番表示の動的整合性エンジン */
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
  const isPlayerSente = (battleStartTurn === 'PLAYER');

  const pMark = isPlayerSente ? '☗' : '☖';
  const aiMark = isPlayerSente ? '☖' : '☗';

  if (pDock) pDock.innerHTML = `${pMark} 自駒`;
  if (aiDock) aiDock.innerHTML = `${aiMark} 敵駒`;
  if (pNameEl) pNameEl.innerHTML = `${pMark} ${p.name}`;
  if (aiNameEl) aiNameEl.innerHTML = `${aiMark} ${w.name}`;
}

/* 勝敗視認性：武将名横インライン銘板掲揚 ＆ オーラ制御 */
function clearWarlordResultPlaques() {
  const pPlaque = document.getElementById('player-result-plaque');
  const aiPlaque = document.getElementById('ai-result-plaque');
  const pPanel = document.getElementById('player-panel');
  const aiPanel = document.getElementById('ai-panel');

  if (pPlaque) { pPlaque.style.display = 'none'; pPlaque.className = 'warlord-result-plaque'; }
  if (aiPlaque) { aiPlaque.style.display = 'none'; aiPlaque.className = 'warlord-result-plaque'; }
  if (pPanel) { pPanel.classList.remove('is-victor', 'is-vanquished'); }
  if (aiPanel) { aiPanel.classList.remove('is-victor', 'is-vanquished'); }
}

function showWarlordResultPlaque(winnerSide) {
  clearWarlordResultPlaques();
  const pPlaque = document.getElementById('player-result-plaque');
  const aiPlaque = document.getElementById('ai-result-plaque');
  const pPanel = document.getElementById('player-panel');
  const aiPanel = document.getElementById('ai-panel');

  const winTxt = isExhibitionActive ? '【勝者】' : '【大勝利】';
  const loseTxt = isExhibitionActive ? '【敗者】' : '【本陣陥落】';

  if (winnerSide === 'PLAYER') {
    if (pPlaque) { pPlaque.textContent = winTxt; pPlaque.className = 'warlord-result-plaque plaque-win'; pPlaque.style.display = 'inline-flex'; }
    if (aiPlaque) { aiPlaque.textContent = loseTxt; aiPlaque.className = 'warlord-result-plaque plaque-lose'; aiPlaque.style.display = 'inline-flex'; }
    if (pPanel) pPanel.classList.add('is-victor');
    if (aiPanel) aiPanel.classList.add('is-vanquished');
  } else {
    if (aiPlaque) { aiPlaque.textContent = winTxt; aiPlaque.className = 'warlord-result-plaque plaque-win'; aiPlaque.style.display = 'inline-flex'; }
    if (pPlaque) { pPlaque.textContent = loseTxt; pPlaque.className = 'warlord-result-plaque plaque-lose'; pPlaque.style.display = 'inline-flex'; }
    if (aiPanel) aiPanel.classList.add('is-victor');
    if (pPanel) pPanel.classList.add('is-vanquished');
  }
}

/* 御前試合：公儀軍監実況解説エンジン（思考深さ完全適正リアルタイム表示） */
function updateExhibitionThinkingDisplay(isThinking = true) {
  if (!isExhibitionActive) return;
  const elapsedSec = Math.max(0.1, (Date.now() - turnStartTime) / 1000).toFixed(1);
  const currentStep = moveObjectsHistory.length + 1;
  const isPlayerSide = (currentThinkingSide === 'PLAYER');
  const tagSide = isPlayerSide ? '先手' : '後手';
  
  const targetThinkingDisp = isPlayerSide
    ? document.getElementById('player-thinking-disp')
    : document.getElementById('ai-thinking-disp');
  const otherThinkingDisp = isPlayerSide
    ? document.getElementById('ai-thinking-disp')
    : document.getElementById('player-thinking-disp');

  if (otherThinkingDisp) {
    const oppSide = isPlayerSide ? 'AI' : 'PLAYER';
    if (lastSettledMoveInfo[oppSide]) {
      otherThinkingDisp.style.display = 'inline-flex';
      otherThinkingDisp.className = 'warlord-thinking-inline timer-confirmed-box';
      otherThinkingDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo[oppSide].timeSec}秒</b> (深さ${lastSettledMoveInfo[oppSide].depth})`;
    } else {
      otherThinkingDisp.style.display = 'none';
    }
  }

  if (targetThinkingDisp) {
    if (isThinking) {
      targetThinkingDisp.style.display = 'inline-flex';
      targetThinkingDisp.className = 'warlord-thinking-inline timer-gold-box';
      const maxTargetD = exhibitionTargetDepth || 4;
      const dispD = Math.min(maxTargetD, Math.max(1, exhibitionAchievedDepth));
      targetThinkingDisp.innerHTML = `🧠 神算熟慮 <b>${elapsedSec}秒</b> (深さ ${dispD}/${maxTargetD})`;
    } else {
      const mySide = isPlayerSide ? 'PLAYER' : 'AI';
      if (lastSettledMoveInfo[mySide]) {
        targetThinkingDisp.style.display = 'inline-flex';
        targetThinkingDisp.className = 'warlord-thinking-inline timer-confirmed-box';
        targetThinkingDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo[mySide].timeSec}秒</b> (深さ${lastSettledMoveInfo[mySide].depth})`;
      } else {
        targetThinkingDisp.style.display = 'none';
      }
    }
  }

  const sData = getTargetAIData(exhibitionSenteTarget);
  const gData = getTargetAIData(exhibitionGoteTarget);
  const inCheck = isCheckState(turn, board);
  let commentatorLine1 = '', commentatorLine2 = '';
  const isHayazashi = (exhibitionSpeed === 'fast');
  const speedNotice = isHayazashi ? '（※早指し戦につき即断即決・波乱あり）' : '';

  if (inCheck) {
    commentatorLine1 = `第${currentStep}手 ── <b>【急転直下】王手の一撃が放たれましたぞ！</b>`;
    commentatorLine2 = `「本陣に迫る刃をどう凌ぐか、${currentThinkingName}の受けの妙手に刮目めされよ！」`;
  } else if (currentStep <= 12) {
    commentatorLine1 = `第${currentStep}手 ── <b>【序盤戦】両雄、堂々たる陣形構築の刻 ${speedNotice}</b>`;
    commentatorLine2 = `「☗<b>${sData.name}</b> と ☖<b>${gData.name}</b>、互いに隙のない布陣を敷き機を伺っております。」`;
  } else if (currentStep <= 30) {
    commentatorLine1 = `第${currentStep}手 ── <b>【中盤戦】前線にて火花散る白兵戦！</b>`;
    commentatorLine2 = `「駒の利きが交錯する天下分水嶺。${currentThinkingName}（${tagSide}）が急所を睨んでおります。」`;
  } else {
    commentatorLine1 = `第${currentStep}手 ── <b>【終盤決戦】敵玉を包囲する寄せ合い！</b>`;
    commentatorLine2 = `「一手の遅れが命取りとなる大激戦！ 一挙に勝負を決する神算の一撃や如何に！」`;
  }

  setOrderMessage({ line1: commentatorLine1, line2: commentatorLine2 }, isThinking, 'exhibition');
}

const PIECE_WEIGHTS = { FU: 1.5, KY: 4.0, KE: 4.0, GI: 8.0, KI: 9.0, KA: 15.0, HI: 17.0, TO: 6.0, NY: 6.0, NK: 6.0, NG: 9.0, UM: 19.0, RY: 22.0 };
const TOTAL_FORCE_POINTS = 95.5;

function getTargetAIData(targetKey) {
  if (INSTRUCTORS_DATA[targetKey]) return INSTRUCTORS_DATA[targetKey];
  if (targetKey && targetKey.startsWith('lvl_')) {
    const lvl = parseInt(targetKey.replace('lvl_', ''), 10);
    return WARLORDS_DATA[lvl];
  }
  if (targetKey === 'strategist') {
    const p = PLAYER_WARLORDS[exhibitionRandomStrategistWarlordKey] || PLAYER_WARLORDS['sanada'];
    return {
      id: `strategist_${p.id}`,
      name: `${p.name}（軍師:${p.strategistShort}）`,
      clan: `${p.clan} ｜ 神算鬼謀・軍師AI`,
      maxTroops: 180000, baseTroops: 180000, targetDepth: 5,
      depthSpec: `深さ5＋${p.strategistShort}の神算鬼謀`,
      featureShort: '豪快傾奇・変幻自在の奇襲',
      strategistImgId: p.strategistImgId,
      customImg: `images/${p.strategistImgId}`,
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
    const enemyTroops = WARLORDS_DATA[lvl]?.maxTroops || 0;
    bonus += Math.round((enemyTroops * 0.40) / 500) * 500;
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
  if (isGameOver) {
    const pKingDead = checkGameOverState('PLAYER', bd) || (turn === 'PLAYER' && getLegalMoves('PLAYER').length === 0);
    const aiKingDead = checkGameOverState('AI', bd) || (turn === 'AI' && getLegalMoves('AI').length === 0);

    if (aiKingDead && !pKingDead) return { pPct: 85, aiPct: 20 };
    if (pKingDead && !aiKingDead) return { pPct: 20, aiPct: 85 };
  }

  const totalMoves = moveObjectsHistory.length;
  const isEndGame = (totalMoves >= 35) || (isCheckState('PLAYER', bd) || isCheckState('AI', bd));

  let pLostPoints = 0, aiLostPoints = 0;
  for (const c in hd.AI) pLostPoints += (hd.AI[c] || 0) * (PIECE_WEIGHTS[c] || 1.5);
  for (const c in hd.PLAYER) aiLostPoints += (hd.PLAYER[c] || 0) * (PIECE_WEIGHTS[c] || 1.5);

  for (let r = 0; r < 9; r++) {
    for (let c = 0; c < 9; c++) {
      const p = bd[r][c]; if (!p) continue;
      if (p.owner === 'PLAYER') {
        if (p.code === 'RY') aiLostPoints += 7;
        else if (p.code === 'UM') aiLostPoints += 5;
        else if (r <= 2 && PROMOTED_PIECES.includes(p.code)) aiLostPoints += 3;
      } else {
        if (p.code === 'RY') pLostPoints += 7;
        else if (p.code === 'UM') pLostPoints += 5;
        else if (r >= 6 && PROMOTED_PIECES.includes(p.code)) pLostPoints += 3;
      }
    }
  }

  let pSiegePenalty = 0, aiSiegePenalty = 0;
  const pKing = findKing('PLAYER', bd);
  const aiKing = findKing('AI', bd);

  if (pKing) {
    let escapes = 0, surroundingEnemies = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = pKing.r + dr, nc = pKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
          const occ = bd[nr][nc];
          if (!occ) escapes++;
          else if (occ.owner === 'AI') surroundingEnemies++;
        }
      }
    }
    if (escapes <= 2) pSiegePenalty += 15;
    pSiegePenalty += surroundingEnemies * 6;
  }

  if (aiKing) {
    let escapes = 0, surroundingEnemies = 0;
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const nr = aiKing.r + dr, nc = aiKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
          const occ = bd[nr][nc];
          if (!occ) escapes++;
          else if (occ.owner === 'PLAYER') surroundingEnemies++;
        }
      }
    }
    if (escapes <= 2) aiSiegePenalty += 15;
    aiSiegePenalty += surroundingEnemies * 6;
  }

  if (isCheckState('PLAYER', bd)) pLostPoints += 20;
  if (isCheckState('AI', bd)) aiLostPoints += 20;

  if (isEndGame) {
    pLostPoints += pSiegePenalty;
    aiLostPoints += aiSiegePenalty;
  }

  let pPct = Math.max(25, Math.min(100, Math.round(100 - (pLostPoints / TOTAL_FORCE_POINTS) * 75)));
  let aiPct = Math.max(25, Math.min(100, Math.round(100 - (aiLostPoints / TOTAL_FORCE_POINTS) * 75)));

  return { pPct, aiPct };
}

/* 戦況連動型・動的セリフ切り替えシステム */
function updateWarlordQuotes() {
  if (isReviewingPast()) return;

  const pQuoteEl = document.getElementById('player-quote-disp');
  const aiQuoteEl = document.getElementById('ai-quote-disp');
  if (!pQuoteEl || !aiQuoteEl) return;

  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;
  const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);

  const playerInCheck = isCheckState('PLAYER', curBoard);
  const aiInCheck = isCheckState('AI', curBoard);
  const totalMoves = moveObjectsHistory.length;

  if (isExhibitionActive) {
    const sData = getTargetAIData(exhibitionSenteTarget);
    const gData = getTargetAIData(exhibitionGoteTarget);
    const sQuotes = sData.quotes || {};
    const gQuotes = gData.quotes || {};

    if (aiInCheck) {
      pQuoteEl.textContent = sQuotes.check || '「先手陣より王手！ 逃れられると思うなよ！」';
      aiQuoteEl.textContent = gQuotes.pinch || '「後手陣、この窮地を凌ぎ切る！」';
    } else if (playerInCheck) {
      aiQuoteEl.textContent = gQuotes.check || '「後手陣より王手！ 覚悟めされよ！」';
      pQuoteEl.textContent = sQuotes.pinch || '「先手陣、ここからが正念場ぞ！」';
    } else if (pPct >= 65 && aiPct <= 45) {
      pQuoteEl.textContent = sQuotes.adv || '「先手陣の優勢は盤石なり！」';
      aiQuoteEl.textContent = gQuotes.pinch || '「この劣勢、覆してみせる！」';
    } else if (aiPct >= 65 && pPct <= 45) {
      aiQuoteEl.textContent = gQuotes.adv || '「後手陣の勝機、ここに極まれり！」';
      pQuoteEl.textContent = sQuotes.pinch || '「焦るな、陣形を立て直すのだ！」';
    } else if (totalMoves >= 31) {
      pQuoteEl.textContent = sQuotes.endgame || sQuotes.default;
      aiQuoteEl.textContent = gQuotes.endgame || gQuotes.default;
    } else if (totalMoves >= 11) {
      pQuoteEl.textContent = sQuotes.midgame || sQuotes.default;
      aiQuoteEl.textContent = gQuotes.midgame || gQuotes.default;
    } else {
      pQuoteEl.textContent = sQuotes.opening || sQuotes.default;
      aiQuoteEl.textContent = gQuotes.opening || gQuotes.default;
    }
    return;
  }

  const pData = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];
  const wData = WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1];
  const pQuotes = pData.quotes || {};
  const wQuotes = wData.quotes || {};

  if (aiInCheck) {
    pQuoteEl.textContent = pQuotes.check || pQuotes.default;
    aiQuoteEl.textContent = wQuotes.pinch || wQuotes.default;
  } else if (playerInCheck) {
    aiQuoteEl.textContent = wQuotes.check || wQuotes.default;
    pQuoteEl.textContent = pQuotes.pinch || pQuotes.default;
  } else if (pPct >= 65 && aiPct <= 45) {
    pQuoteEl.textContent = pQuotes.adv || pQuotes.default;
    aiQuoteEl.textContent = wQuotes.pinch || wQuotes.default;
  } else if (aiPct >= 65 && pPct <= 45) {
    aiQuoteEl.textContent = wQuotes.adv || wQuotes.default;
    pQuoteEl.textContent = pQuotes.pinch || pQuotes.default;
  } else if (totalMoves >= 31) {
    pQuoteEl.textContent = pQuotes.endgame || pQuotes.default;
    aiQuoteEl.textContent = wQuotes.endgame || wQuotes.default;
  } else if (totalMoves >= 11) {
    pQuoteEl.textContent = pQuotes.midgame || pQuotes.default;
    aiQuoteEl.textContent = wQuotes.midgame || wQuotes.default;
  } else {
    pQuoteEl.textContent = pQuotes.opening || pQuotes.default;
    aiQuoteEl.textContent = wQuotes.opening || wQuotes.default;
  }
}

/* 将棋ルール判定関数群 */
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
  const kp = findKing(owner, targetBoard);
  if (!kp) return false;
  const enemy = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
  for (let r=0; r<9; r++) {
    for (let c=0; c<9; c++) {
      if (targetBoard[r][c]?.owner === enemy) {
        const moves = getValidBoardMoves(r, c, enemy, targetBoard);
        if (moves.some(m => m.r === kp.r && m.c === kp.c)) return true;
      }
    }
  }
  return false;
}

function checkGameOverState(owner, targetBoard = board) {
  for (let r=0; r<9; r++) for (let c=0; c<9; c++) if (targetBoard[r][c]?.owner === owner && targetBoard[r][c]?.code === 'OU') return false;
  return true;
}

function makeMove(move) {
  const undo = { move };
  const owner = move.owner;
  if (move.type === 'drop') {
    hands[owner][move.code]--;
    board[move.to.r][move.to.c] = { code: move.code, owner };
  } else {
    const item = board[move.from.r][move.from.c], target = board[move.to.r][move.to.c];
    undo.fromCode = item.code;
    if (target) {
      undo.capturedCode = target.code;
      if (target.code !== 'OU') {
        const raw = UNPROMOTE_MAP[target.code];
        hands[owner][raw] = (hands[owner][raw] || 0) + 1;
      }
    }
    if (move.promote) item.code = PROMOTE_MAP[item.code];
    board[move.to.r][move.to.c] = item;
    board[move.from.r][move.from.c] = null;
  }
  return undo;
}

function unmakeMove(undo) {
  const move = undo.move, owner = move.owner;
  if (move.type === 'drop') {
    hands[owner][move.code]++;
    board[move.to.r][move.to.c] = null;
  } else {
    const item = board[move.to.r][move.to.c];
    item.code = undo.fromCode;
    board[move.from.r][move.from.c] = item;
    if (undo.capturedCode) {
      board[move.to.r][move.to.c] = { code: undo.capturedCode, owner: owner === 'AI' ? 'PLAYER' : 'AI' };
      if (undo.capturedCode !== 'OU') hands[owner][UNPROMOTE_MAP[undo.capturedCode]]--;
    } else {
      board[move.to.r][move.to.c] = null;
    }
  }
}

function isUchifuzume(move) {
  if (move.type !== 'drop' || move.code !== 'FU') return false;
  const enemy = move.owner === 'AI' ? 'PLAYER' : 'AI';
  const enemyKing = findKing(enemy);
  if (!enemyKing) return false;
  const fwd = move.owner === 'AI' ? 1 : -1;
  if (move.to.r !== enemyKing.r - fwd || move.to.c !== enemyKing.c) return false;

  const undo = makeMove(move);
  const kingInCheck = isCheckState(enemy);
  if (!kingInCheck) { unmakeMove(undo); return false; }

  const enemyLegals = getLegalMoves(enemy, false, false);
  unmakeMove(undo);
  return enemyLegals.length === 0;
}

function getLegalMoves(owner, capturesOnly = false, filterUchifuzume = true) {
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
          if (capturesOnly && !isCap && !canP && !mustP) return;

          if (mustP) pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: true, isCap });
          else if (canP) {
            pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: true, isCap });
            if (!capturesOnly) pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: false, isCap });
          } else pseudo.push({ type: 'move', code: item.code, from: {r, c}, to: m, owner, promote: false, isCap });
        });
      }
    }
  }

  if (!capturesOnly) {
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
  }

  return pseudo.filter(m => {
    if (filterUchifuzume && m.type === 'drop' && m.code === 'FU' && isUchifuzume(m)) return false;
    const undo = makeMove(m);
    const safe = !isCheckState(owner);
    unmakeMove(undo);
    return safe;
  });
}

function loadProgress() {
  try {
    const s = localStorage.getItem('shogi_cleared_provinces');
    clearedProvinces = s !== null ? JSON.parse(s) : [];
    currentAiLevel = clearedProvinces.length > 0 ? Math.min(11, Math.max(...clearedProvinces) + 1) : 1;
    const mw = localStorage.getItem('shogi_my_warlord');
    if (mw && PLAYER_WARLORDS[mw]) currentMyWarlordId = mw;
  } catch (e) { clearedProvinces = []; currentAiLevel = 1; }
  updateConquestMapUI();
}

/* 複数画面安全合体保存エンジン */
function saveProgress(clearedLvl) {
  if (isExhibitionActive) return;
  try {
    const s = localStorage.getItem('shogi_cleared_provinces');
    let stored = s !== null ? JSON.parse(s) : [];
    const mergedSet = new Set([...stored, ...clearedProvinces, clearedLvl]);
    clearedProvinces = Array.from(mergedSet).sort((a,b) => a - b);
    localStorage.setItem('shogi_cleared_provinces', JSON.stringify(clearedProvinces));
  } catch (e) {}
  updateConquestMapUI();
}

window.addEventListener('storage', function(e) {
  if (e.key === 'shogi_cleared_provinces') {
    try {
      clearedProvinces = JSON.parse(e.newValue || '[]');
      updateConquestMapUI();
      if (!isExhibitionActive && !isGameOver) {
        const pMax = getPlayerMaxTroops();
        const pDisp = document.getElementById('player-troops-disp');
        if (pDisp) {
          const { pPct } = calculateTroopsPercentages(board, hands);
          const pCurrent = Math.round(pMax * (pPct / 100));
          pDisp.textContent = `${pCurrent.toLocaleString()} / ${pMax.toLocaleString()} 兵`;
        }
      }
    } catch(err) {}
  } else if (e.key === 'shogi_battle_records_player' || e.key === 'shogi_battle_records_exhibition') {
    const histModal = document.getElementById('battle-history-modal');
    if (histModal && histModal.style.display === 'flex') {
      renderBattleHistoryList();
    }
  }
});

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

/* 千日手判定 */
function checkSennichite(targetNextTurn = turn) {
  const curHash = getBoardHash(board, hands, targetNextTurn);
  boardHashHistory.push(curHash);
  checkHistory.push({ turn: targetNextTurn, inCheck: isCheckState(targetNextTurn) });

  const count = boardHashHistory.filter(h => h === curHash).length;
  if (count >= 4) {
    const firstIdx = boardHashHistory.indexOf(curHash);
    const lastIdx = boardHashHistory.length - 1;

    let playerAlwaysChecking = true, aiAlwaysChecking = true, stepCount = 0;
    for (let i = firstIdx; i < lastIdx; i++) {
      const snap = checkHistory[i];
      if (snap) {
        stepCount++;
        if (snap.turn === 'AI' && !snap.inCheck) playerAlwaysChecking = false;
        if (snap.turn === 'PLAYER' && !snap.inCheck) aiAlwaysChecking = false;
      }
    }

    isGameOver = true; playCheckSound();
    stopAutoReplay(); stopTurnTimer();
    if (isExhibitionActive) stopExhibitionTimer();
    updateTurnFocus(null);

    const exhModeTxt = (exhibitionSpeed === 'fast') ? '早指し戦' : '本将棋';
    const sData = isExhibitionActive ? getTargetAIData(exhibitionSenteTarget) : null;
    const gData = isExhibitionActive ? getTargetAIData(exhibitionGoteTarget) : null;

    if (stepCount >= 6 && playerAlwaysChecking && !aiAlwaysChecking) {
      if (isExhibitionActive) {
        triggerCutin(`先手・${sData.name}の連続王手反則！ 後手の勝利！`, true);
        setOrderMessage({ line1: `【御前試合 決着】先手の連続王手千日手違反に候！`, line2: `後手・<b>${gData.name}</b>の反則勝ちとなりました！` }, false, 'settle');
        showWarlordResultPlaque('AI');
        saveBattleRecord('exhibition', `御前${exhModeTxt}：${gData.name}反則勝`);
      } else {
        triggerCutin('連続王手の反則！ 敗戦に候！', true);
        setOrderMessage('連続王手の千日手は反則！ 陣を立て直されよ。', false, 'alert');
        showWarlordResultPlaque('AI');
        saveBattleRecord('lose', '反則負け');
      }
    } else if (stepCount >= 6 && aiAlwaysChecking && !playerAlwaysChecking) {
      if (isExhibitionActive) {
        triggerCutin(`後手・${gData.name}の連続王手反則！ 先手の勝利！`, true);
        setOrderMessage({ line1: `【御前試合 決着】後手の連続王手千日手違反に候！`, line2: `先手・<b>${sData.name}</b>の反則勝ちとなりました！` }, false, 'settle');
        showWarlordResultPlaque('PLAYER');
        saveBattleRecord('exhibition', `御前${exhModeTxt}：${sData.name}反則勝`);
      } else {
        triggerCutin('敵将の反則！ 我が軍の勝利！', true);
        setOrderMessage('相手が連続王手の千日手を犯し候！ 勝利なり！', false, 'settle');
        saveProgress(currentAiLevel); launchFireworksCelebration();
        showWarlordResultPlaque('PLAYER');
        saveBattleRecord('win', '反則勝ち');
      }
    } else {
      triggerCutin('千日手！ 痛み分けの引き分け！');
      setOrderMessage('同一局面四回にて引き分け（痛み分け）に候。', false, 'alert');
      clearWarlordResultPlaques();
      saveBattleRecord(isExhibitionActive ? 'exhibition' : 'draw', isExhibitionActive ? `御前${exhModeTxt}(千日手)` : '千日手');
    }
    updateReviewModeUI();
    return true;
  }
  return false;
}

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
  totalTimeSpentMs = { PLAYER: 0, AI: 0 };
  movesCountBySide = { PLAYER: 0, AI: 0 };
  exhibitionAchievedDepth = 1; exhibitionTargetDepth = 3;
  lastSettledMoveInfo = { PLAYER: null, AI: null };

  clearWarlordResultPlaques();
  updateTurnFocus(null);
  updateStrategistUI();
  updateWarlordBGM(currentAiLevel);

  const pThinkDisp = document.getElementById('player-thinking-disp');
  const aiThinkDisp = document.getElementById('ai-thinking-disp');
  if (pThinkDisp) pThinkDisp.style.display = 'none';
  if (aiThinkDisp) aiThinkDisp.style.display = 'none';

  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  const playerChangeBtn = document.getElementById('btn-player-change');
  if (enemyChangeBtn) enemyChangeBtn.style.display = isExhibitionActive ? 'none' : 'inline-flex';
  if (playerChangeBtn) playerChangeBtn.style.display = isExhibitionActive ? 'none' : 'inline-flex';

  if (!isExhibitionActive) {
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

  // 日本将棋連盟・公式初期配置
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
  const p = PLAYER_WARLORDS[currentMyWarlordId];
  const w = WARLORDS_DATA[currentAiLevel];
  if (pBox) pBox.innerHTML = getWarlordPortraitHtml(p, true, 'player');
  if (aiBox) aiBox.innerHTML = getWarlordPortraitHtml(w, true, 'ai');
}

function updateStrategistUI() {
  const badge = document.getElementById('player-strategist-badge');
  if (isExhibitionActive) {
    if (badge) badge.style.display = 'none';
    return;
  }
  const p = PLAYER_WARLORDS[currentMyWarlordId];
  if (badge) {
    badge.style.display = 'inline-block';
    badge.textContent = `軍師:${p.strategistShort}`;
  }
  const hintBtn = document.getElementById('btn-master-hint');
  if (hintBtn) {
    hintBtn.classList.remove('awakened');
    hintBtn.textContent = '💡 軍師進言';
  }
}

function updateRivalryButton() {
  const btn = document.getElementById('btn-rivalry-story');
  if (!btn) return;
  const rivalKey = `${currentMyWarlordId}_${currentAiLevel}`;
  btn.style.display = (RIVALRIES[rivalKey] && !isPastReplayActive && !isExhibitionActive) ? 'inline-block' : 'none';
}

function isReviewingPast() {
  return isPastReplayActive || (reviewingIndex !== -1 && reviewingIndex !== historyStates.length - 1);
}

function updateReviewModeUI() {
  const sitBadge = document.getElementById('situation-badge');
  const sitText = document.getElementById('situation-text');
  const isReplay = isReviewingPast();
  const repCtrl = document.getElementById('replay-full-controls');

  if (repCtrl) {
    repCtrl.style.display = (isReplay || (isExhibitionActive && isGameOver)) ? 'flex' : 'none';
  }

  if (sitBadge && sitText && isReplay) {
    sitBadge.className = 'situation-badge badge-gokaku';
    sitBadge.textContent = '【鑑賞】';
    const curStep = (reviewingIndex >= 0) ? reviewingIndex : (historyStates.length - 1);
    const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
    const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;
    const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);
    const pCur = Math.round(getPlayerMaxTroops() * (pPct / 100));
    const aiCur = Math.round(getAiMaxTroops() * (aiPct / 100));
    sitText.textContent = `第${curStep}手 ［残存兵力：我が軍 ${pCur.toLocaleString()} 兵 vs 敵軍 ${aiCur.toLocaleString()} 兵］`;
  }
}

function exitReplayMode() {
  playUiClickSound();
  stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer();

  if (savedActiveBattle) {
    const isSavedExhibition = !!savedActiveBattle.isExhibitionActive;

    if (isSavedExhibition) {
      isExhibitionActive = true;
      isPastReplayActive = false;
      exhibitionSenteTarget = savedActiveBattle.exhibitionSenteTarget;
      exhibitionGoteTarget = savedActiveBattle.exhibitionGoteTarget;
      exhibitionSpeed = savedActiveBattle.exhibitionSpeed || 'normal';
      if (savedActiveBattle.exhibitionStrategistKey) exhibitionRandomStrategistWarlordKey = savedActiveBattle.exhibitionStrategistKey;

      board = cloneBoardState(savedActiveBattle.board);
      hands = JSON.parse(JSON.stringify(savedActiveBattle.hands));
      turn = savedActiveBattle.turn;
      battleStartTurn = savedActiveBattle.battleStartTurn || 'PLAYER';
      isGameOver = false;
      moveObjectsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveObjectsHistory));
      historyStates = JSON.parse(JSON.stringify(savedActiveBattle.historyStates));
      evalScoresHistory = JSON.parse(JSON.stringify(savedActiveBattle.evalScoresHistory));
      boardHashHistory = JSON.parse(JSON.stringify(savedActiveBattle.boardHashHistory));
      checkHistory = JSON.parse(JSON.stringify(savedActiveBattle.checkHistory));
      moveMetricsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveMetricsHistory || []));
      lastMove = savedActiveBattle.lastMove;
      reviewingIndex = historyStates.length - 1;
      totalTimeSpentMs = savedActiveBattle.totalTimeSpentMs || { PLAYER: 0, AI: 0 };
      movesCountBySide = savedActiveBattle.movesCountBySide || { PLAYER: 0, AI: 0 };
      exhibitionAchievedDepth = savedActiveBattle.exhibitionAchievedDepth || 1;
      exhibitionTargetDepth = savedActiveBattle.exhibitionTargetDepth || 4;
      exhibitionTotalNodes = savedActiveBattle.exhibitionTotalNodes || 0;

      const sData = getTargetAIData(exhibitionSenteTarget);
      const gData = getTargetAIData(exhibitionGoteTarget);
      const sTroops = sData.baseTroops || sData.maxTroops || 10000;
      const gTroops = gData.maxTroops || gData.baseTroops || 10000;

      document.getElementById('player-name-disp').innerHTML = `☗ ${getWarlordDisplayNameHtml(sData)}`;
      document.getElementById('player-clan-disp').textContent = sData.clan;
      document.getElementById('player-troops-disp').textContent = `${sTroops.toLocaleString()} / ${sTroops.toLocaleString()} 兵`;

      document.getElementById('ai-name-disp').innerHTML = `☖ ${getWarlordDisplayNameHtml(gData)}`;
      document.getElementById('ai-clan-disp').textContent = gData.clan;
      document.getElementById('ai-troops-disp').textContent = `${gTroops.toLocaleString()} / ${gTroops.toLocaleString()} 兵`;

      const enemyChangeBtn = document.getElementById('btn-enemy-change');
      const playerChangeBtn = document.getElementById('btn-player-change');
      if (enemyChangeBtn) enemyChangeBtn.style.display = 'none';
      if (playerChangeBtn) playerChangeBtn.style.display = 'none';

      updateTurnLabels();
      renderMainPortraits();
      updateTurnFocus(turn);
      renderBoard();
      updateTroopsAndSituation();
      updateWarlordQuotes();
      updateReviewModeUI();

      savedActiveBattle = null;
      triggerCutin('御前試合を再開いたし候！', true);
      scheduleNextExhibitionTurn();

    } else {
      currentMyWarlordId = savedActiveBattle.currentMyWarlordId;
      currentAiLevel = savedActiveBattle.currentAiLevel;
      setPlayerWarlord(currentMyWarlordId);
      selectConquestProvince(currentAiLevel);

      board = cloneBoardState(savedActiveBattle.board);
      hands = JSON.parse(JSON.stringify(savedActiveBattle.hands));
      turn = savedActiveBattle.turn;
      battleStartTurn = savedActiveBattle.battleStartTurn || 'PLAYER';
      isGameOver = false;
      moveObjectsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveObjectsHistory));
      historyStates = JSON.parse(JSON.stringify(savedActiveBattle.historyStates));
      evalScoresHistory = JSON.parse(JSON.stringify(savedActiveBattle.evalScoresHistory));
      boardHashHistory = JSON.parse(JSON.stringify(savedActiveBattle.boardHashHistory));
      checkHistory = JSON.parse(JSON.stringify(savedActiveBattle.checkHistory));
      moveMetricsHistory = JSON.parse(JSON.stringify(savedActiveBattle.moveMetricsHistory || []));
      lastMove = savedActiveBattle.lastMove;
      reviewingIndex = historyStates.length - 1;
      hintUsedCount = savedActiveBattle.hintUsedCount;
      awakenedHintCount = savedActiveBattle.awakenedHintCount;
      totalTimeSpentMs = savedActiveBattle.totalTimeSpentMs || { PLAYER: 0, AI: 0 };
      movesCountBySide = savedActiveBattle.movesCountBySide || { PLAYER: 0, AI: 0 };

      savedActiveBattle = null;
      isPastReplayActive = false;
      isExhibitionActive = false;

      const enemyChangeBtn = document.getElementById('btn-enemy-change');
      const playerChangeBtn = document.getElementById('btn-player-change');
      if (enemyChangeBtn) enemyChangeBtn.style.display = 'inline-flex';
      if (playerChangeBtn) playerChangeBtn.style.display = 'inline-flex';

      updateTurnLabels();
      updateTurnFocus(turn);
      renderBoard();
      updateTroopsAndSituation();
      updateWarlordQuotes();
      updateReviewModeUI();

      triggerCutin('真剣勝負へ復帰！', true);
      startTurnTimer(turn, (turn === 'PLAYER' ? PLAYER_WARLORDS[currentMyWarlordId].name : WARLORDS_DATA[currentAiLevel].name));
    }

  } else {
    isPastReplayActive = false;
    isExhibitionActive = false;
    isGameOver = true;
    
    const enemyChangeBtn = document.getElementById('btn-enemy-change');
    const playerChangeBtn = document.getElementById('btn-player-change');
    if (enemyChangeBtn) enemyChangeBtn.style.display = 'inline-flex';
    if (playerChangeBtn) playerChangeBtn.style.display = 'inline-flex';

    setPlayerWarlord(currentMyWarlordId);
    selectConquestProvince(currentAiLevel);
    initBoardState();
    triggerCutin('初期布陣へと立ち返り候', false);
    setOrderMessage({
      line1: '合戦絵巻の鑑賞が結びとなり候。',
      line2: '「対局開始」を押して新たな合戦を始められよ！'
    }, false, 'player');
  }
}

/* 伝令・軍令高札更新 */
function setOrderMessage(msgData, isMyTurn = false, category = 'player') {
  const bannerEl = document.getElementById('order-message-banner');
  const linePrimaryEl = document.getElementById('order-line-primary');
  const lineSubEl = document.getElementById('order-line-sub');
  const badgeEl = document.getElementById('order-tag-badge');
  const r1El = document.getElementById('tag-badge-row1');
  const r2El = document.getElementById('tag-badge-row2');
  const faceEl = document.getElementById('order-strategist-face');
  const altBtn = document.getElementById('btn-alt-tactic');
  const quitExhBtn = document.getElementById('btn-exhibition-quit');

  let line1 = '', line2 = '';
  if (typeof msgData === 'object' && msgData !== null) {
    line1 = msgData.line1 || ''; line2 = msgData.line2 || '';
  } else {
    const parts = String(msgData).split('<br>');
    line1 = parts[0] || ''; line2 = parts[1] || '';
  }

  if (linePrimaryEl && linePrimaryEl.innerHTML !== line1) linePrimaryEl.innerHTML = line1;
  if (lineSubEl && lineSubEl.innerHTML !== line2) lineSubEl.innerHTML = line2;

  const isHintMode = category.startsWith('hint');
  if (bannerEl) bannerEl.classList.toggle('hint-focus', isHintMode);

  if (badgeEl) {
    badgeEl.className = 'order-tag-badge';
    if (isExhibitionActive) {
      badgeEl.classList.add('badge-tag-exhibition');
      if (r1El) r1El.textContent = '御前'; if (r2El) r2El.textContent = '実況';
    } else if (isReviewingPast()) {
      badgeEl.classList.add('badge-tag-replay');
      if (r1El) r1El.textContent = '合戦'; if (r2El) r2El.textContent = '再現';
    } else {
      switch(category) {
        case 'enemy': badgeEl.classList.add('badge-tag-enemy'); if (r1El) r1El.textContent = '敵軍'; if (r2El) r2El.textContent = '思案'; break;
        case 'hint': badgeEl.classList.add('badge-tag-hint'); if (r1El) r1El.textContent = '軍師'; if (r2El) r2El.textContent = '進言'; break;
        case 'hint-awakened': badgeEl.classList.add('badge-tag-hint-awakened'); if (r1El) r1El.textContent = '覚醒'; if (r2El) r2El.textContent = '進言'; break;
        case 'alert': badgeEl.classList.add('badge-tag-alert'); if (r1El) r1El.textContent = '合戦'; if (r2El) r2El.textContent = '急変'; break;
        case 'settle': badgeEl.classList.add('badge-tag-settle'); if (r1El) r1El.textContent = '合戦'; if (r2El) r2El.textContent = '決着'; break;
        default: badgeEl.classList.add('badge-tag-player'); if (r1El) r1El.textContent = '自軍'; if (r2El) r2El.textContent = '手番'; break;
      }
    }
  }

  if (faceEl) {
    const fBox = document.getElementById('strategist-face-img-box');
    const nTag = document.getElementById('strategist-face-name-tag');

    if (isExhibitionActive && !isReviewingPast()) {
      faceEl.style.display = 'flex';
      if (fBox) fBox.innerHTML = getGunbaiIconHtml();
      if (nTag) nTag.textContent = '御前軍監';
      cachedStrategistImgId = 'gunbai';
    } else if (isHintMode && !isReviewingPast()) {
      faceEl.style.display = 'flex';
      const p = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];
      if (fBox && cachedStrategistImgId !== p.strategistImgId) {
        fBox.innerHTML = getStrategistFaceHtml(p.strategistImgId);
        cachedStrategistImgId = p.strategistImgId;
      }
      if (nTag) nTag.textContent = `軍師:${p.strategistShort}`;
    } else {
      faceEl.style.display = 'none';
    }
  }

  if (altBtn) altBtn.style.display = (isHintMode && tacticsCandidates.length > 1 && !isReviewingPast() && !isExhibitionActive) ? 'inline-block' : 'none';
  if (quitExhBtn) quitExhBtn.style.display = (isExhibitionActive && !isReviewingPast()) ? 'inline-block' : 'none';

  updateRivalryButton();
}

function openRivalryInGuide(targetKey = null) {
  playUiClickSound(); stopAutoReplay();
  const rivalKey = targetKey || `${currentMyWarlordId}_${currentAiLevel}`;
  openGuideModal(); switchGuideTab(4);

  setTimeout(() => {
    const cardEl = document.getElementById(`rivalry-card-${rivalKey}`);
    if (cardEl) {
      cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      cardEl.classList.remove('highlight-rivalry-card');
      void cardEl.offsetWidth;
      cardEl.classList.add('highlight-rivalry-card');
      setTimeout(() => cardEl.classList.remove('highlight-rivalry-card'), 3800);
    }
  }, 100);
}

function openFurigomaModal() {
  initAudio(); playUiClickSound(); stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer();
  savedActiveBattle = null; isPastReplayActive = false; isExhibitionActive = false;

  const m = document.getElementById('furigoma-modal');
  const r = document.getElementById('furigoma-pieces-row');
  const t = document.getElementById('furigoma-result-text');

  m.style.display = 'flex';
  r.innerHTML = '';
  t.innerHTML = '天運を見届けております…（五枚一斉回転中）';

  const pieceResults = [];
  let toCount = 0;
  for (let i = 0; i < 5; i++) {
    const isTo = Math.random() < 0.5;
    if (isTo) toCount++;
    pieceResults.push(isTo);

    const b = document.createElement('div');
    b.className = 'furigoma-piece-box';
    b.innerHTML = `
      <div class="furigoma-card spinning" id="fg-${i}">
        <div class="furigoma-face furigoma-front">
          <span class="piece-char-top">歩</span><span class="piece-char-bottom">兵</span>
        </div>
        <div class="furigoma-face furigoma-back">
          <span class="piece-char-top">と</span><span class="piece-char-bottom">金</span>
        </div>
      </div>`;
    r.appendChild(b);
  }

  pieceResults.forEach((isTo, i) => {
    setTimeout(() => {
      const card = document.getElementById(`fg-${i}`);
      if (card) {
        card.classList.remove('spinning');
        card.classList.add(isTo ? 'settled-to' : 'settled-fu');
        playPieceSound();
      }
    }, 1000 + i * 160);
  });

  setTimeout(() => {
    const isPlayerSente = (5 - toCount) >= 3;
    turn = isPlayerSente ? 'PLAYER' : 'AI';
    battleStartTurn = turn;

    t.innerHTML = isPlayerSente 
      ? `<span style="color:#ff5252;">歩が${5 - toCount}枚！ ☗ 我が軍の先手！</span>` 
      : `<span style="color:#ffd700;">と金が${toCount}枚！ ☖ 敵軍の先手！</span>`;
    
    playVictorySound();

    setTimeout(() => {
      m.style.display = 'none';
      startBattle();
    }, 1300);
  }, 1000 + 5 * 160 + 200);
}

function startBattle() {
  isGameOver = false; isPastReplayActive = false; isExhibitionActive = false;
  initBoardState();
  hintUsedCount = 0; awakenedHintCount = 0;
  const rivalKey = `${currentMyWarlordId}_${currentAiLevel}`;
  const rivalry = RIVALRIES[rivalKey];
  const enemy = WARLORDS_DATA[currentAiLevel];
  const p = PLAYER_WARLORDS[currentMyWarlordId];

  if (rivalry) {
    triggerCutin(`【宿命の対決】${rivalry.title}`, true, true);
    document.getElementById('player-quote-disp').textContent = rivalry.pQuote;
    document.getElementById('ai-quote-disp').textContent = rivalry.eQuote;
  } else {
    triggerCutin('合戦開始！ いざ推して参る！');
    document.getElementById('player-quote-disp').textContent = p.quotes.opening || p.quotes.default;
    document.getElementById('ai-quote-disp').textContent = enemy.quotes.opening || enemy.quotes.default;
  }

  updateTurnLabels();

  if (turn === 'PLAYER') {
    updateTurnFocus('PLAYER');
    startTurnTimer('PLAYER', p.name);
  } else {
    updateTurnFocus('AI');
    startTurnTimer('AI', enemy.name);
    setTimeout(aiTurn, 400);
  }
  updateReviewModeUI();
}

function renderBoard() {
  const el = document.getElementById('board');
  if (!el) return;
  el.innerHTML = '';
  
  const pKingPos = isCheckState('PLAYER') ? findKing('PLAYER') : null;
  const aiKingPos = isCheckState('AI') ? findKing('AI') : null;

  for(let r=0; r<9; r++) {
    for(let c=0; c<9; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;
      const targetP = board[r][c];

      if (lastMove && lastMove.to.r === r && lastMove.to.c === c) cell.classList.add('last-move-to');
      if (selectedPos?.r === r && selectedPos?.c === c) cell.classList.add('selected');

      if (currentValidMoves.some(m => m.r === r && m.c === c)) {
        if (targetP && targetP.owner === 'AI') cell.classList.add('target-capture');
        else cell.classList.add('target-move');
      }

      if ((pKingPos && pKingPos.r === r && pKingPos.c === c) || (aiKingPos && aiKingPos.r === r && aiKingPos.c === c)) {
        cell.classList.add('in-check-king');
      }

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
  stopAutoReplay();
  if (isReviewingPast()) {
    setOrderMessage('下部バーの［⚔ 対局へ戻る］を押して実戦へお戻り下され。', false, 'player');
    return;
  }
  initAudio(); playUiClickSound();

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
  stopAutoReplay();
  if (isReviewingPast()) {
    setOrderMessage('下部バーの［⚔ 対局へ戻る］を押して実戦へお戻り下され。', false, 'player');
    return;
  }
  initAudio();
  hintSourceCell = null; hintTargetCell = null; tacticsCandidates = [];
  document.getElementById('btn-alt-tactic').style.display = 'none';

  if (selectedPos?.handCode && currentValidMoves.some(m => m.r === r && m.c === c)) {
    const timeSpent = recordTurnTime('PLAYER');
    lastSettledMoveInfo.PLAYER = { timeSec: timeSpent, depth: 1 };
    const metric = { timeSec: timeSpent, depth: 1 };
    const moveData = { type:'drop', code:selectedPos.handCode, to:{r,c}, owner:'PLAYER' };
    selectedPos = null; currentValidMoves = [];
    animateAndExecuteMove(moveData, metric, finishTurn);
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
    const metric = { timeSec: timeSpent, depth: 1 };
    const moveData = { type:'move', code: p.code, from:selectedPos, to:{r,c}, owner:'PLAYER', promote: canP || mustP };
    selectedPos = null; currentValidMoves = [];
    animateAndExecuteMove(moveData, metric, finishTurn);
    return;
  }

  if (board[r][c]?.owner === 'PLAYER') {
    playUiClickSound();
    selectedPos = {r, c};
    currentValidMoves = getLegalMoves('PLAYER').filter(m => m.type === 'move' && m.from.r === r && m.from.c === c).map(m => m.to);
  } else {
    selectedPos = null; currentValidMoves = [];
  }
  renderBoard();
}

document.getElementById('btn-promote-yes').onclick = () => {
  if (pendingMove) {
    playUiClickSound();
    const timeSpent = recordTurnTime('PLAYER');
    lastSettledMoveInfo.PLAYER = { timeSec: timeSpent, depth: 1 };
    const metric = { timeSec: timeSpent, depth: 1 };
    const m = {...pendingMove, promote:true};
    pendingMove = null;
    document.getElementById('promote-modal').style.display = 'none';
    selectedPos = null; currentValidMoves = [];
    animateAndExecuteMove(m, metric, finishTurn);
  }
};
document.getElementById('btn-promote-no').onclick = () => {
  if (pendingMove) {
    playUiClickSound();
    const timeSpent = recordTurnTime('PLAYER');
    lastSettledMoveInfo.PLAYER = { timeSec: timeSpent, depth: 1 };
    const metric = { timeSec: timeSpent, depth: 1 };
    const m = {...pendingMove, promote:false};
    pendingMove = null;
    document.getElementById('promote-modal').style.display = 'none';
    selectedPos = null; currentValidMoves = [];
    animateAndExecuteMove(m, metric, finishTurn);
  }
};

function animateAndExecuteMove(m, metric = null, onComplete = null) {
  isPieceAnimating = true;
  const targetCellEl = document.querySelector(`#board .cell[data-r="${m.to.r}"][data-c="${m.to.c}"]`);
  if (!targetCellEl) {
    executeMove(m, metric);
    isPieceAnimating = false;
    if (onComplete) onComplete();
    return;
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
      const p = board[m.from.r][m.from.c];
      if (p) animPieceCode = p.code;
    }
  }

  if (!fromRect) {
    executeMove(m, metric);
    isPieceAnimating = false;
    if (onComplete) onComplete();
    return;
  }

  const animPiece = document.createElement('div');
  const isPromotedAtArrival = m.promote || PROMOTED_PIECES.includes(animPieceCode);
  const displayCode = m.promote ? (PROMOTE_MAP[animPieceCode] || animPieceCode) : animPieceCode;
  const name2 = PIECES[displayCode] || PIECES[animPieceCode] || '歩兵';
  const isAiPiece = (m.owner === 'AI');

  animPiece.className = `piece anim-flying-piece ${isAiPiece ? 'ai' : 'player'} ${isPromotedAtArrival ? 'promoted' : ''}`;
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
    executeMove(m, metric);
    updateWarlordQuotes();
    isPieceAnimating = false;
    if (onComplete) onComplete();
  }, flyTime);
}

function executeMove(m, metric = null) {
  if (m.type === 'move' && !m.code && board[m.from.r][m.from.c]) {
    m.code = board[m.from.r][m.from.c].code;
  }

  moveObjectsHistory.push(m);
  lastMove = m;
  const recordMetric = metric || { timeSec: '0.1', depth: 1 };
  moveMetricsHistory.push(recordMetric);

  let isKingCaptured = false, capturedKingOwner = null;

  if (m.type === 'drop') {
    hands[m.owner][m.code]--;
    board[m.to.r][moveObjectsHistory[moveObjectsHistory.length-1].to.c] = { code: m.code, owner: m.owner };
  } else {
    const fp = board[m.from.r][m.from.c], tp = board[m.to.r][m.to.c];
    if (tp) {
      if (tp.code === 'OU') {
        isKingCaptured = true; capturedKingOwner = tp.owner;
      } else {
        const raw = UNPROMOTE_MAP[tp.code];
        hands[m.owner][raw] = (hands[m.owner][raw] || 0) + 1;
      }
    }
    if (m.promote) {
      fp.code = PROMOTE_MAP[fp.code];
      if (fp.code === 'RY') triggerCutin('龍王顕現！ 敵陣を薙ぎ払え！', true);
      else if (fp.code === 'UM') triggerCutin('龍馬咆哮！ 神速の刃！', true);
    }
    board[m.to.r][m.to.c] = fp;
    board[m.from.r][m.from.c] = null;
  }

  historyStates.push({ board: cloneBoardState(board), hands: JSON.parse(JSON.stringify(hands)), turn: m.owner === 'PLAYER' ? 'AI' : 'PLAYER', moveObjectsHistory: JSON.parse(JSON.stringify(moveObjectsHistory)) });
  reviewingIndex = historyStates.length - 1;
  renderBoard();
  updateTroopsAndSituation();
  updateWarlordQuotes();
  updateReviewModeUI();

  const kifuModal = document.getElementById('kifu-modal');
  if (kifuModal && kifuModal.style.display === 'flex') {
    updateKifuModalLive();
  }

  if (isKingCaptured && capturedKingOwner) {
    checkGameOver(capturedKingOwner);
  }
}

function finishTurn() {
  tacticsCandidates = [];
  document.getElementById('btn-alt-tactic').style.display = 'none';

  if (isGameOver) return;
  if (checkSennichite('AI')) return;
  if (isCheckState('AI')) {
    playCheckSound(); triggerCutin('敵将へ王手！');
  }
  if (checkGameOver('AI')) return;
  
  turn = 'AI';
  updateTurnFocus('AI');
  const enemy = WARLORDS_DATA[currentAiLevel];
  startTurnTimer('AI', enemy.name);
  setTimeout(aiTurn, 200);
}

let aiWorker = null;
const workerBlob = new Blob([workerScriptContent], { type: 'application/javascript' });
const workerUrl = URL.createObjectURL(workerBlob);

function createNewWorker() {
  if (aiWorker) aiWorker.terminate();
  aiWorker = new Worker(workerUrl);
  aiWorker.onmessage = handleWorkerMessage;
}
createNewWorker();

function analyzeTacticsIntent(bm) {
  const targetPiece = board[bm.to.r][bm.to.c];
  const movingPieceCode = (bm.type === 'move') ? (board[bm.from.r][bm.from.c]?.code || bm.code) : bm.code;
  const isCapture = (targetPiece && targetPiece.owner === 'AI');
  const enemyKing = findKing('AI');
  const distToKing = enemyKing ? Math.max(Math.abs(bm.to.r - enemyKing.r), Math.abs(bm.to.c - enemyKing.c)) : 9;

  if (isCheckState('PLAYER')) {
    return { aim: '本陣防衛', advice: '「まずは自玉の王手を防ぎ、急場を脱することが肝要にござる。」' };
  }
  if (isCapture) {
    const capName = PIECES[targetPiece.code];
    return { aim: `${capName}討捕`, advice: `「隙のある敵の${capName}を討ち取り、戦力を削ぐ好手にござる。」` };
  }
  if (bm.promote) {
    const promName = PIECES[PROMOTE_MAP[movingPieceCode]] || '成駒';
    return { aim: '敵陣突破', advice: `「敵陣を突破して${promName}へ昇格させ、敵の陣形を崩す機にござる。」` };
  }
  if (distToKing <= 2) {
    return { aim: '玉将包囲', advice: '「敵玉の逃げ道を塞ぎ、包囲網を狭めて寄せを狙うべし。」' };
  }
  if (bm.type === 'move' && movingPieceCode === 'FU') {
    if ((bm.from.r === 6 && bm.from.c === 2) || (bm.from.r === 6 && bm.from.c === 6)) {
      return { aim: '大駒射線開通', advice: '「歩を進めて飛車・角の道を開き、敵陣へ圧力をかける好手に候。」' };
    }
  }
  if (bm.type === 'move' && ['KI','GI','OU'].includes(movingPieceCode)) {
    return { aim: '陣形整備', advice: '「駒同士をしっかり連携させ、守りを固めて反撃に備えられよ。」' };
  }
  return { aim: '局面打開', advice: '「陣を進めて主導権を握り、新たな戦局を切り開く好機に候。」' };
}

function filterThreeTacticsPlans(allScoredMoves) {
  if (!allScoredMoves || allScoredMoves.length === 0) return [];
  const bestScore = allScoredMoves[0].score;
  const bestMove = allScoredMoves[0].move;
  const MAX_ALLOWED_DROP = 180;
  const safeCandidates = allScoredMoves.filter(item => item.score >= (bestScore - MAX_ALLOWED_DROP));
  const plans = [{ move: bestMove, planName: '王道の一手' }];
  if (safeCandidates.length <= 1) return plans;

  let attackMove = null, defenseMove = null;
  for (let i = 1; i < safeCandidates.length; i++) {
    const m = safeCandidates[i].move;
    const intent = analyzeTacticsIntent(m);
    if (!attackMove && ['敵駒討捕', '敵陣突破', '玉将包囲'].some(k => intent.aim.includes(k))) attackMove = m;
    else if (!defenseMove && ['本陣防衛', '陣形整備'].includes(intent.aim)) defenseMove = m;
  }

  if (attackMove && attackMove !== bestMove) plans.push({ move: attackMove, planName: '強襲の一手' });
  else if (safeCandidates[1]) plans.push({ move: safeCandidates[1].move, planName: '積極の一手' });

  if (defenseMove && defenseMove !== bestMove && defenseMove !== attackMove) plans.push({ move: defenseMove, planName: '堅陣の一手' });
  else if (safeCandidates[2]) plans.push({ move: safeCandidates[2].move, planName: '布陣の一手' });

  return plans;
}

function renderTacticProposal(idx) {
  if (!tacticsCandidates || tacticsCandidates.length === 0) return;
  const item = tacticsCandidates[idx];
  const bm = item.move;
  const planName = item.planName || `第${idx+1}策`;
  const intent = analyzeTacticsIntent(bm);
  const toCoord = `${9 - bm.to.c}${KANJI_NUMS[bm.to.r]}`;
  let moveActionTxt = '';

  if (bm.type === 'drop') {
    const pName = PIECES[bm.code];
    moveActionTxt = `持ち駒の「${pName}」を <b>${toCoord}</b> へ打つ`;
  } else {
    const fromPiece = board[bm.from.r][bm.from.c];
    const pName = PIECES[fromPiece?.code || bm.code];
    const fromCoord = `${9 - bm.from.c}${KANJI_NUMS[bm.from.r]}`;
    if (bm.promote) {
      moveActionTxt = `${fromCoord}の「${pName}」を <b>${toCoord}</b> へ進軍して成る`;
    } else {
      const canP = PROMOTE_MAP[fromPiece?.code] && (bm.from.r <= 2 || bm.to.r <= 2);
      const optP = canP ? '（不成）' : '';
      moveActionTxt = `${fromCoord}の「${pName}」を <b>${toCoord}</b> へ進める${optP}`;
    }
  }

  const linePrimary = `
    <span class="tactics-plan-tag">【${planName}】</span>
    <span class="tactics-move-highlight">${moveActionTxt}</span>
    <span class="tactics-aim-tag">── ${intent.aim}</span>
  `;
  const lineSub = intent.advice;
  const categoryType = isCurrentHintAwakened ? 'hint-awakened' : 'hint';
  setOrderMessage({ line1: linePrimary, line2: lineSub }, true, categoryType);

  hintSourceCell = bm.type === 'move' ? { r: bm.from.r, c: bm.from.c } : null;
  hintTargetCell = { r: bm.to.r, c: bm.to.c };
  renderBoard();
}

function cycleNextTacticsHint() {
  if (!tacticsCandidates || tacticsCandidates.length <= 1) return;
  playUiClickSound();
  currentTacticIndex = (currentTacticIndex + 1) % tacticsCandidates.length;
  renderTacticProposal(currentTacticIndex);
}

function handleWorkerMessage(e) {
  clearTimeout(exhibitionSafetyTimer);
  const data = e.data;
  const p = PLAYER_WARLORDS[currentMyWarlordId];

  if (data.type === 'progress') {
    exhibitionAchievedDepth = data.depth || 1;
    exhibitionTargetDepth = data.targetDepth || exhibitionTargetDepth;
    exhibitionTotalNodes = data.nodes || 0;
    if (isExhibitionActive) updateExhibitionThinkingDisplay(true);
    return;
  }

  if (data.type === 'hintDone') {
    isHintThinking = false;
    tacticsCandidates = filterThreeTacticsPlans(data.allScoredMoves);
    currentTacticIndex = 0;
    isCurrentHintAwakened = !!data.isAwakened;

    if (tacticsCandidates.length === 0) {
      setOrderMessage('進言できる妙手がござらぬ…！', true, 'hint');
      return;
    }
    if (data.isAwakened) triggerCutin(`軍師覚醒！ ${p.strategistName}の神算鬼謀！`, true);
    renderTacticProposal(0);
    return;
  }

  isAiThinking = false;
  exhibitionAchievedDepth = data.depth || exhibitionAchievedDepth;
  exhibitionTargetDepth = data.targetDepth || exhibitionTargetDepth;
  exhibitionTotalNodes = data.nodes || exhibitionTotalNodes;
  
  const elapsedSec = recordTurnTime(turn, data.timeSpentMs);
  stopTurnTimer();

  lastSettledMoveInfo[turn] = { timeSec: elapsedSec, depth: exhibitionAchievedDepth };
  if (isExhibitionActive) updateExhibitionThinkingDisplay(false);

  const bm = data.bestMove;
  if (!bm) { checkGameOver(turn); return; }

  const metric = { timeSec: elapsedSec, depth: exhibitionAchievedDepth };
  
  animateAndExecuteMove(bm, metric, () => {
    if (isGameOver) return;
    const nextTurn = (bm.owner === 'PLAYER') ? 'AI' : 'PLAYER';
    if (checkSennichite(nextTurn)) return;

    if (isExhibitionActive) {
      if (!checkGameOver(nextTurn)) {
        turn = nextTurn;
        updateTurnFocus(turn);
        scheduleNextExhibitionTurn();
      }
      return;
    }

    if (!checkGameOver('PLAYER')) {
      turn = 'PLAYER';
      updateTurnFocus('PLAYER');
      const pName = PLAYER_WARLORDS[currentMyWarlordId].name;
      if (isCheckState('PLAYER')) {
        playCheckSound(); triggerCutin('敵の奇襲！ 王手！');
      }
      startTurnTimer('PLAYER', pName);
    }
  });
}

function handleExternalWorkerMessage(e) {
  clearTimeout(exhibitionSafetyTimer);
  const data = e.data;
  if (data.type === 'progress') {
    exhibitionAchievedDepth = data.depth || 1;
    exhibitionTargetDepth = data.targetDepth || exhibitionTargetDepth;
    exhibitionTotalNodes = data.nodes || 0;
    if (isExhibitionActive) updateExhibitionThinkingDisplay(true);
    return;
  }

  isAiThinking = false;
  exhibitionAchievedDepth = data.depth || exhibitionAchievedDepth;
  exhibitionTargetDepth = data.targetDepth || exhibitionTargetDepth;
  exhibitionTotalNodes = data.nodes || exhibitionTotalNodes;
  
  const elapsedSec = recordTurnTime(turn, data.timeSpentMs);
  stopTurnTimer();

  lastSettledMoveInfo[turn] = { timeSec: elapsedSec, depth: exhibitionAchievedDepth };
  if (isExhibitionActive) updateExhibitionThinkingDisplay(false);

  const bm = data.bestMove;
  if (!bm) { checkGameOver(turn); return; }

  const metric = { timeSec: elapsedSec, depth: exhibitionAchievedDepth };
  
  animateAndExecuteMove(bm, metric, () => {
    if (isGameOver) return;
    const nextTurn = (bm.owner === 'PLAYER') ? 'AI' : 'PLAYER';
    if (checkSennichite(nextTurn)) return;

    if (!checkGameOver(nextTurn)) {
      turn = nextTurn;
      updateTurnFocus(turn);
      scheduleNextExhibitionTurn();
    }
  });
}

function aiTurn() {
  if (isGameOver) return;
  isAiThinking = true;
  const safeLimit = isExhibitionActive ? (EXHIBITION_TIME_LIMITS[exhibitionSpeed] || 8500) : 9000;

  aiWorker.postMessage({
    board, hands,
    level: currentAiLevel,
    history: moveObjectsHistory,
    hashHistory: boardHashHistory,
    isExhibition: isExhibitionActive,
    targetOwner: 'AI',
    timeLimit: safeLimit
  });
}

function showMasterHint() {
  if (isGameOver || turn !== 'PLAYER' || isHintThinking || isExhibitionActive || isPieceAnimating) return;
  stopAutoReplay();
  if (isReviewingPast()) {
    setOrderMessage('下部バーの［⚔ 対局へ戻る］を押して実戦局面へお戻り下され。', false, 'player');
    return;
  }
  playUiClickSound(); isHintThinking = true;
  hintUsedCount++;
  const hintBtn = document.getElementById('btn-master-hint');
  const isAwakenedNow = hintBtn.classList.contains('awakened');
  
  if (isAwakenedNow) {
    awakenedHintCount++;
    setOrderMessage({ line1: '深淵の神算鬼謀を探索中…！', line2: 'しばしお待ち下され、逆転の妙手を練り上げております。' }, true, 'hint-awakened');
    aiWorker.postMessage({ board, hands, level: 10, isHintRequest: true, isAwakened: true, history: moveObjectsHistory, hashHistory: boardHashHistory, targetOwner: 'PLAYER', timeLimit: 5000 });
  } else {
    setOrderMessage({ line1: '局面打開の一手を探索中…', line2: '盤上の急所と連携を検証いたしております。' }, true, 'hint');
    aiWorker.postMessage({ board, hands, level: 8, isHintRequest: true, isAwakened: false, history: moveObjectsHistory, hashHistory: boardHashHistory, targetOwner: 'PLAYER', timeLimit: 5000 });
  }
}

function undoMove() {
  if (isGameOver || historyStates.length <= 1 || isExhibitionActive || isPieceAnimating) return;
  stopAutoReplay(); playUiClickSound();
  if (isAiThinking || isHintThinking) { createNewWorker(); isAiThinking = false; isHintThinking = false; }
  
  const stepsToRewind = (historyStates.length > 2) ? 2 : 1;
  for (let s = 0; s < stepsToRewind; s++) {
    historyStates.pop();
    if (evalScoresHistory.length > 1) evalScoresHistory.pop();
    if (boardHashHistory.length > 1) boardHashHistory.pop();
    if (checkHistory.length > 1) checkHistory.pop();
    if (moveMetricsHistory.length > 0) moveMetricsHistory.pop();
  }

  const target = historyStates[historyStates.length - 1];
  board = cloneBoardState(target.board); hands = JSON.parse(JSON.stringify(target.hands));
  moveObjectsHistory = JSON.parse(JSON.stringify(target.moveObjectsHistory));
  lastMove = (moveObjectsHistory.length > 0) ? moveObjectsHistory[moveObjectsHistory.length - 1] : null;
  reviewingIndex = historyStates.length - 1;
  turn = 'PLAYER'; selectedPos = null; currentValidMoves = [];
  tacticsCandidates = [];
  lastSettledMoveInfo = { PLAYER: null, AI: null };
  document.getElementById('btn-alt-tactic').style.display = 'none';

  updateTurnLabels();
  updateTurnFocus('PLAYER');
  renderBoard();
  updateTroopsAndSituation();
  updateWarlordQuotes();
  updateReviewModeUI();

  const kifuModal = document.getElementById('kifu-modal');
  if (kifuModal && kifuModal.style.display === 'flex') {
    openKifuModal();
  }

  startTurnTimer('PLAYER', PLAYER_WARLORDS[currentMyWarlordId].name);
}

function surrenderGame() {
  if (isGameOver || isExhibitionActive) return;
  stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer();
  isGameOver = true; triggerCutin('無念… 降伏いたす…');
  updateTurnFocus(null);
  
  const enemy = WARLORDS_DATA[currentAiLevel];
  const p = PLAYER_WARLORDS[currentMyWarlordId];
  if (enemy && enemy.victoryQuote) document.getElementById('ai-quote-disp').textContent = enemy.victoryQuote;
  if (p && p.quotes.defeat) document.getElementById('player-quote-disp').textContent = p.quotes.defeat;

  showWarlordResultPlaque('AI');
  updateTroopsAndSituation();
  setOrderMessage('再起の陣を敷き、雪辱を期されよ！', false, 'settle');
  saveBattleRecord('lose', '降伏(投了)');
  updateReviewModeUI();
}

function checkGameOver(nextOwner) {
  if (moveObjectsHistory.length >= 256) {
    isGameOver = true;
    stopAutoReplay(); stopTurnTimer();
    if (isExhibitionActive) stopExhibitionTimer();
    updateTurnFocus(null);
    updateTroopsAndSituation();
    clearWarlordResultPlaques();

    const exhModeTxt = (exhibitionSpeed === 'fast') ? '早指し戦' : '通常本将棋';
    triggerCutin('二百五十六手！ 両軍兵粮尽き引き分け！', true);
    setOrderMessage({
      line1: `第256手 ── <b>【合戦結び】両軍互角の死闘の末、規定手数に達し候！</b>`,
      line2: `痛み分けの引き分け（合戦終局）にござる。`
    }, false, 'settle');
    saveBattleRecord(isExhibitionActive ? 'exhibition' : 'draw', isExhibitionActive ? `御前${exhModeTxt}(256手引分)` : '256手引分');
    updateReviewModeUI();
    return true;
  }

  const isKingGone = checkGameOverState(nextOwner, board);
  const legalsEmpty = getLegalMoves(nextOwner).length === 0;

  if (isKingGone || legalsEmpty) {
    isGameOver = true;
    playVictorySound();
    stopAutoReplay(); stopTurnTimer();
    if (isExhibitionActive) stopExhibitionTimer();
    updateTurnFocus(null);
    updateTroopsAndSituation();

    const exhModeTxt = (exhibitionSpeed === 'fast') ? '早指し戦' : '通常本将棋';

    if (isExhibitionActive) {
      const sData = getTargetAIData(exhibitionSenteTarget);
      const gData = getTargetAIData(exhibitionGoteTarget);
      const winnerSide = (nextOwner === 'AI') ? 'PLAYER' : 'AI';
      const winnerName = (nextOwner === 'AI') ? sData.name : gData.name;
      const pQuoteEl = document.getElementById('player-quote-disp');
      const aiQuoteEl = document.getElementById('ai-quote-disp');

      showWarlordResultPlaque(winnerSide);

      if (nextOwner === 'AI') {
        if (pQuoteEl) pQuoteEl.textContent = sData.victoryQuote || sData.quotes?.victory || '「先手陣の大勝利！ 見事に本陣を討ち破れり！」';
        if (aiQuoteEl) aiQuoteEl.textContent = gData.defeatQuote || gData.quotes?.defeat || '「参り申した… 先手の妙技、見事なり！」';
      } else {
        if (aiQuoteEl) aiQuoteEl.textContent = gData.victoryQuote || gData.quotes?.victory || '「後手陣の大勝利！ 鉄壁の陣にて制したり！」';
        if (pQuoteEl) pQuoteEl.textContent = sData.defeatQuote || sData.quotes?.defeat || '「無念… 後手陣の堅守に屈し申した！」';
      }

      triggerCutin(`【御前試合 決着】${winnerName}の勝利！`, true);
      setOrderMessage({
        line1: `御前試合が結びとなりました！ <b>${winnerName}</b>が見事合戦を制しました！`,
        line2: `［▶自動］や［◀］［▶］で合戦を振り返られよ！`
      }, false, 'settle');
      
      saveBattleRecord('exhibition', `御前${exhModeTxt}：${winnerName}勝`);
      updateReviewModeUI();
      return true;
    }

    const enemy = WARLORDS_DATA[currentAiLevel];
    const p = PLAYER_WARLORDS[currentMyWarlordId];

    if (nextOwner === 'AI') {
      showWarlordResultPlaque('PLAYER');
      const isNewClear = !clearedProvinces.includes(currentAiLevel);
      saveProgress(currentAiLevel); launchFireworksCelebration(); triggerCutin('敵将討ち取ったり！', true);
      if (enemy && enemy.defeatQuote) document.getElementById('ai-quote-disp').textContent = enemy.defeatQuote;
      if (p && p.quotes.victory) document.getElementById('player-quote-disp').textContent = p.quotes.victory;

      const earnedBonus = Math.round((enemy.maxTroops * 0.40) / 500) * 500;
      const growthNotice = isNewClear ? `【天下布武】領国平定！ 総動員力 +${earnedBonus.toLocaleString()} 兵 獲得！` : '';

      let victoryMsg1 = '';
      if (currentAiLevel === 11) victoryMsg1 = `天下無双・前田慶次を討ち破り、日ノ本最強の覇王となり候！`;
      else if (currentAiLevel === 10) victoryMsg1 = `徳川幕府を平定し、日ノ本の覇者となり候！ 誠に見事！`;
      else victoryMsg1 = `${enemy.name}を討ち取り、${enemy.province}を平定いたし候！`;

      setOrderMessage({ line1: victoryMsg1, line2: growthNotice || '天下統一の偉業へまた一歩近づき候！' }, false, 'settle');
      saveBattleRecord('win', '大勝利');
    } else {
      showWarlordResultPlaque('AI');
      triggerCutin('本陣陥落… 敗北に候…');
      if (enemy && enemy.victoryQuote) document.getElementById('ai-quote-disp').textContent = enemy.victoryQuote;
      if (p && p.quotes.defeat) document.getElementById('player-quote-disp').textContent = p.quotes.defeat;
      setOrderMessage('敵将に敗れ候。再起の陣を敷き、雪辱を期されよ！', false, 'settle');
      saveBattleRecord('lose', '本陣陥落');
    }
    updateReviewModeUI();
    return true;
  }
  return false;
}

function updateTroopsAndSituation() {
  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;

  const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);
  const pMax = getPlayerMaxTroops();
  const aiMax = getAiMaxTroops();
  const pCurrent = Math.round(pMax * (pPct / 100));
  const aiCurrent = Math.round(aiMax * (aiPct / 100));

  const pBar = document.getElementById('player-troops-bar');
  const aiBar = document.getElementById('ai-troops-bar');
  const pDisp = document.getElementById('player-troops-disp');
  const aiDisp = document.getElementById('ai-troops-disp');

  if (pBar) pBar.style.width = `${pPct}%`;
  if (aiBar) aiBar.style.width = `${aiPct}%`;
  if (pDisp) pDisp.textContent = `${pCurrent.toLocaleString()} / ${pMax.toLocaleString()} 兵`;
  if (aiDisp) aiDisp.textContent = `${aiCurrent.toLocaleString()} / ${aiMax.toLocaleString()} 兵`;

  const diffPct = pPct - aiPct;
  if (!isReviewingPast()) evalScoresHistory.push(diffPct);

  const hintBtn = document.getElementById('btn-master-hint');
  const isPinchState = (pPct <= 40) || isCheckState('PLAYER');
  const canAwaken = (currentAiLevel >= 8) && isPinchState;

  if (hintBtn) {
    if (canAwaken && !isGameOver && !isExhibitionActive) {
      hintBtn.classList.add('awakened'); hintBtn.textContent = '🔥 覚醒進言';
    } else {
      hintBtn.classList.remove('awakened'); hintBtn.textContent = '💡 軍師進言';
    }
  }

  const sitBadge = document.getElementById('situation-badge');
  const sit = document.getElementById('situation-text');
  const sitBanner = document.getElementById('situation-banner');

  if (sit && sitBadge && !isReviewingPast()) {
    let badgeText = '【互角】';
    let badgeClass = 'situation-badge badge-gokaku';
    let newSitText = '';

    if (isGameOver) {
      if (pPct > aiPct) {
        badgeText = isExhibitionActive ? '【決着】' : '【完全勝利】';
        badgeClass = 'situation-badge badge-player-win';
        newSitText = isExhibitionActive ? '先手陣が見事敵本陣を陥落せしめ候！' : '我が軍の大勝利！ 敵本陣を陥落せり！';
      } else {
        badgeText = isExhibitionActive ? '【決着】' : '【本陣陥落】';
        badgeClass = 'situation-badge badge-enemy-win';
        newSitText = isExhibitionActive ? '後手陣の鉄壁の陣勢、見事に勝利を収め候。' : '本陣陥落… 敵の猛攻に屈し候。';
      }
    } else {
      if (diffPct >= 35) {
        badgeText = isExhibitionActive ? '【先手勝勢】' : '【我が軍 勝勢】';
        badgeClass = 'situation-badge badge-player-win';
        newSitText = isExhibitionActive ? '先手陣怒涛の進撃！ 敵本陣を完全に包囲中！' : '我が軍怒涛の進撃！ 敵本陣を完全に包囲中！';
      } else if (diffPct >= 12) {
        badgeText = isExhibitionActive ? '【先手有利】' : '【我が軍 有利】';
        badgeClass = 'situation-badge badge-player-adv';
        newSitText = isExhibitionActive ? '先手陣が主導権を握り、敵陣へ圧力を強めております。' : '敵陣に突破口を開き、優位に軍を進めております！';
      } else if (diffPct <= -35) {
        badgeText = isExhibitionActive ? '【後手勝勢】' : '【本陣危急】';
        badgeClass = 'situation-badge badge-enemy-win';
        newSitText = isExhibitionActive ? '後手陣の猛威止まらず！ 先手陣本陣が危急に候！' : '我が本陣危急！ 直ちに王手を凌ぎ、防衛陣列を再編せよ！';
      } else if (diffPct <= -12) {
        badgeText = isExhibitionActive ? '【後手有利】' : '【敵軍有利】';
        badgeClass = 'situation-badge badge-enemy-adv';
        newSitText = isExhibitionActive ? '後手陣が駒得を重ね、着実に包囲網を狭めております。' : '敵将の鋭い攻勢。受けの態勢を整える刻に候。';
      } else {
        badgeText = '【互角】';
        badgeClass = 'situation-badge badge-gokaku';
        newSitText = '両軍ともに布陣堅牢、白兵戦の機を伺っております。';
      }
    }

    sitBadge.className = badgeClass;
    sitBadge.textContent = badgeText;

    if (sit.textContent !== newSitText) {
      sit.textContent = newSitText;
      if (sitBanner) {
        sitBanner.classList.remove('flash-pulse');
        void sitBanner.offsetWidth;
        sitBanner.classList.add('flash-pulse');
      }
    }
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
  board = cloneBoardState(snap.board);
  hands = JSON.parse(JSON.stringify(snap.hands));
  lastMove = (reviewingIndex > 0) ? snap.moveObjectsHistory[snap.moveObjectsHistory.length - 1] : null;

  renderBoard();
  updateTroopsAndSituation();
  updateReviewModeUI();
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

function toggleAutoReplay() {
  if (isAutoReplaying) stopAutoReplay();
  else startAutoReplay();
}

function startAutoReplay() {
  if (historyStates.length <= 1) return;
  initAudio(); isAutoReplaying = true;
  const btn = document.getElementById('btn-auto-replay');
  if (btn) { btn.innerHTML = '⏸ 停止'; btn.classList.add('is-playing'); }

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
  const btn = document.getElementById('btn-auto-replay');
  if (btn) { btn.innerHTML = '▶ 自動'; btn.classList.remove('is-playing'); }
}

function cycleReplaySpeed() {
  playUiClickSound();
  replaySpeedIndex = (replaySpeedIndex + 1) % REPLAY_SPEEDS.length;
  const speedBtn = document.getElementById('btn-replay-speed');
  if (speedBtn) speedBtn.textContent = REPLAY_SPEED_LABELS[replaySpeedIndex];
  if (isAutoReplaying) {
    if (autoReplayTimer) clearTimeout(autoReplayTimer);
    runAutoReplayStep();
  }
}

/* 御前試合：選定対象（戦国武将10名 ＋ 客分四英傑 ＋ 軍師AI） */
const ALL_EXHIBITION_AI_KEYS = [
  'lvl_1', 'lvl_2', 'lvl_3', 'lvl_4', 'lvl_5',
  'lvl_6', 'lvl_7', 'lvl_8', 'lvl_9', 'lvl_10',
  'nanban', 'kenshi', 'inja', 'sokei',
  'strategist'
];

function switchExhibitionMobileTab(tabSide) {
  playUiClickSound(); exhibitionMobileCurrentTab = tabSide;
  const btnSente = document.getElementById('btn-exh-tab-sente');
  const btnGote = document.getElementById('btn-exh-tab-gote');
  const colSente = document.getElementById('exhibition-col-sente');
  const colGote = document.getElementById('exhibition-col-gote');

  if (btnSente) btnSente.classList.toggle('active', tabSide === 'sente');
  if (btnGote) btnGote.classList.toggle('active', tabSide === 'gote');
  if (colSente) colSente.classList.toggle('mobile-active-col', tabSide === 'sente');
  if (colGote) colGote.classList.toggle('mobile-active-col', tabSide === 'gote');
}

function openExhibitionModal() {
  initAudio(); playUiClickSound(); stopAutoReplay(); stopExhibitionTimer();
  pickRandomStrategistWarlord();
  renderExhibitionVisualPickers();
  switchExhibitionMobileTab('sente');
  document.getElementById('exhibition-modal').style.display = 'flex';
}
function closeExhibitionModal() {
  playUiClickSound();
  document.getElementById('exhibition-modal').style.display = 'none';
}

function getAiBadgeHtml(k, data) {
  if (k === 'sokei') return `<span class="badge-ai-meijin">一世名人</span>`;
  if (['nanban', 'kenshi', 'inja'].includes(k)) return `<span class="badge-ai-dan">${data.rank || '指南役'}</span>`;
  if (k.startsWith('lvl_')) return `<span class="badge-ai-level">Lv.${k.replace('lvl_', '')}</span>`;
  if (k === 'strategist') return `<span class="badge-ai-tactician">軍師AI</span>`;
  return `<span class="badge-ai-level">武将</span>`;
}

function renderExhibitionVisualPickers() {
  const senteListEl = document.getElementById('exhibition-sente-pick-list');
  const goteListEl = document.getElementById('exhibition-gote-pick-list');
  if (!senteListEl || !goteListEl) return;

  senteListEl.innerHTML = `<div class="exhibition-list-header">📜 控え武将一覧（全十五傑より選定）</div>`;
  goteListEl.innerHTML = `<div class="exhibition-list-header">📜 控え武将一覧（全十五傑より選定）</div>`;

  ALL_EXHIBITION_AI_KEYS.forEach(k => {
    const data = getTargetAIData(k);
    const badgeHtml = getAiBadgeHtml(k, data);
    const troopsNum = (data.maxTroops || data.baseTroops || 10000).toLocaleString();
    const depthTxt = data.depthSpec || '深さ3＋静止探索';
    const sourceTxt = data.sourceEngine ? `<span class="badge-source-tag">技術出典: ${data.sourceEngine}</span>` : '';
    const tacticTxt = data.featureShort || data.clan || '正道布陣';

    const isSenteActive = (exhibitionSenteTarget === k);
    const senteItem = document.createElement('div');
    senteItem.className = `pick-avatar-item ${isSenteActive ? 'active' : ''}`;
    senteItem.innerHTML = `
      <div class="pick-thumb-box">${getWarlordPortraitHtml(data, false)}</div>
      <div class="pick-info-col">
        <div class="pick-name-row">
          <span class="pick-name-txt">${getWarlordDisplayNameHtml(data)}</span>
          ${isSenteActive ? '<span class="badge-active-stamp">✔ 出陣決定</span>' : ''}
          ${badgeHtml}
        </div>
        <div class="pick-stats-row">
          <span class="badge-ai-troops">⚔ ${troopsNum} 兵</span>
          <span class="badge-ai-depth">🧠 ${depthTxt}</span>
          ${sourceTxt}
        </div>
        <div class="pick-desc-txt">兵法：${tacticTxt}</div>
      </div>
    `;
    senteItem.onclick = () => { playUiClickSound(); exhibitionSenteTarget = k; renderExhibitionVisualPickers(); };
    senteListEl.appendChild(senteItem);

    const isGoteActive = (exhibitionGoteTarget === k);
    const goteItem = document.createElement('div');
    goteItem.className = `pick-avatar-item ${isGoteActive ? 'active' : ''}`;
    goteItem.innerHTML = `
      <div class="pick-thumb-box">${getWarlordPortraitHtml(data, false)}</div>
      <div class="pick-info-col">
        <div class="pick-name-row">
          <span class="pick-name-txt">${getWarlordDisplayNameHtml(data)}</span>
          ${isGoteActive ? '<span class="badge-active-stamp">✔ 出陣決定</span>' : ''}
          ${badgeHtml}
        </div>
        <div class="pick-stats-row">
          <span class="badge-ai-troops">⚔ ${troopsNum} 兵</span>
          <span class="badge-ai-depth">🧠 ${depthTxt}</span>
          ${sourceTxt}
        </div>
        <div class="pick-desc-txt">兵法：${tacticTxt}</div>
      </div>
    `;
    goteItem.onclick = () => { playUiClickSound(); exhibitionGoteTarget = k; renderExhibitionVisualPickers(); };
    goteListEl.appendChild(goteItem);
  });

  updateExhibitionPreviewCards();
}

function updateExhibitionPreviewCards() {
  const sData = getTargetAIData(exhibitionSenteTarget);
  const gData = getTargetAIData(exhibitionGoteTarget);

  const sBox = document.getElementById('preview-sente-avatar');
  const gBox = document.getElementById('preview-gote-avatar');
  if (sBox) sBox.innerHTML = getWarlordPortraitHtml(sData, false);
  if (gBox) gBox.innerHTML = getWarlordPortraitHtml(gData, false);

  const sName = document.getElementById('preview-sente-name');
  const sBadge = document.getElementById('preview-sente-badge');
  const sDesc = document.getElementById('preview-sente-desc');
  const sTroops = (sData.baseTroops || sData.maxTroops || 10000).toLocaleString();
  const sDepth = sData.depthSpec || '深さ3＋静止探索';
  const sSource = sData.sourceEngine ? `<div class="preview-stat-row"><span>技術出典：</span><span class="preview-spec-highlight" style="color:#a8e6cf;">${sData.sourceEngine}</span></div>` : '';

  if (sName) sName.innerHTML = getWarlordDisplayNameHtml(sData);
  if (sBadge) sBadge.textContent = sData.rank || (sData.province ? `${sData.province}` : '出陣');
  if (sDesc) {
    sDesc.innerHTML = `
      <div class="preview-stat-grid">
        <div class="preview-stat-row"><span>総動員力：</span><span class="preview-troops-highlight">⚔ ${sTroops} 兵</span></div>
        <div class="preview-stat-row"><span>思考仕様：</span><span class="preview-spec-highlight">${sDepth}</span></div>
        ${sSource}
      </div>`;
  }

  const gName = document.getElementById('preview-gote-name');
  const gBadge = document.getElementById('preview-gote-badge');
  const gDesc = document.getElementById('preview-gote-desc');
  const gTroops = (gData.maxTroops || gData.baseTroops || 10000).toLocaleString();
  const gDepth = gData.depthSpec || '深さ3＋静止探索';
  const gSource = gData.sourceEngine ? `<div class="preview-stat-row"><span>技術出典：</span><span class="preview-spec-highlight" style="color:#a8e6cf;">${gData.sourceEngine}</span></div>` : '';

  if (gName) gName.innerHTML = getWarlordDisplayNameHtml(gData);
  if (gBadge) gBadge.textContent = gData.rank || (gData.province ? `${gData.province}` : '出陣');
  if (gDesc) {
    gDesc.innerHTML = `
      <div class="preview-stat-grid">
        <div class="preview-stat-row"><span>総動員力：</span><span class="preview-troops-highlight">⚔ ${gTroops} 兵</span></div>
        <div class="preview-stat-row"><span>思考仕様：</span><span class="preview-spec-highlight">${gDepth}</span></div>
        ${sSource}
      </div>`;
  }
}

function setExhibitionModalSpeed(speed) {
  playUiClickSound();
  exhibitionSpeed = speed;
  const normalBtn = document.getElementById('btn-speed-normal');
  const fastBtn = document.getElementById('btn-speed-fast');
  if (normalBtn) normalBtn.classList.toggle('active', speed === 'normal');
  if (fastBtn) fastBtn.classList.toggle('active', speed === 'fast');
}

function startExhibitionFromModal() {
  closeExhibitionModal();
  stopAutoReplay(); stopExhibitionTimer(); stopTurnTimer();
  playUiClickSound();

  createNewWorker(); initExternalAiWorker();

  if (!isGameOver && moveObjectsHistory.length > 0 && !isExhibitionActive) {
    savedActiveBattle = {
      isExhibitionActive: false,
      currentMyWarlordId, currentAiLevel,
      board: cloneBoardState(board),
      hands: JSON.parse(JSON.stringify(hands)),
      turn, battleStartTurn,
      moveObjectsHistory: JSON.parse(JSON.stringify(moveObjectsHistory)),
      historyStates: JSON.parse(JSON.stringify(historyStates)),
      evalScoresHistory: JSON.parse(JSON.stringify(evalScoresHistory)),
      boardHashHistory: JSON.parse(JSON.stringify(boardHashHistory)),
      checkHistory: JSON.parse(JSON.stringify(checkHistory)),
      moveMetricsHistory: JSON.parse(JSON.stringify(moveMetricsHistory)),
      lastMove, hintUsedCount, awakenedHintCount,
      totalTimeSpentMs: JSON.parse(JSON.stringify(totalTimeSpentMs)),
      movesCountBySide: JSON.parse(JSON.stringify(movesCountBySide))
    };
  }

  isExhibitionActive = true;
  isPastReplayActive = false;
  turn = 'PLAYER'; battleStartTurn = 'PLAYER'; isGameOver = false;

  initBoardState();

  const sData = getTargetAIData(exhibitionSenteTarget);
  const gData = getTargetAIData(exhibitionGoteTarget);
  const sTroops = sData.baseTroops || sData.maxTroops || 10000;
  const gTroops = gData.maxTroops || gData.baseTroops || 10000;

  document.getElementById('player-name-disp').innerHTML = `☗ ${getWarlordDisplayNameHtml(sData)}`;
  document.getElementById('player-clan-disp').textContent = sData.clan;
  document.getElementById('player-quote-disp').textContent = sData.quotes ? (sData.quotes.opening || sData.quotes.default) : '「先手陣、堂々たる進撃を見せてくれよう！」';
  document.getElementById('player-troops-disp').textContent = `${sTroops.toLocaleString()} / ${sTroops.toLocaleString()} 兵`;

  document.getElementById('ai-name-disp').innerHTML = `☖ ${getWarlordDisplayNameHtml(gData)}`;
  document.getElementById('ai-clan-disp').textContent = gData.clan;
  document.getElementById('ai-quote-disp').textContent = gData.quotes ? (gData.quotes.opening || gData.quotes.default) : '「後手陣、一歩も退かぬ鉄壁の陣を敷く！」';
  document.getElementById('ai-troops-disp').textContent = `${gTroops.toLocaleString()} / ${gTroops.toLocaleString()} 兵`;

  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  const playerChangeBtn = document.getElementById('btn-player-change');
  if (enemyChangeBtn) enemyChangeBtn.style.display = 'none';
  if (playerChangeBtn) playerChangeBtn.style.display = 'none';

  updateTurnLabels();
  renderMainPortraits();
  updateReviewModeUI();

  const modeTxt = (exhibitionSpeed === 'fast') ? '早指し戦' : '通常本将棋';
  triggerCutin(`【御前${modeTxt}】${sData.name} vs ${gData.name}`, true);
  updateTurnFocus('PLAYER');

  setTimeout(() => {
    if (!isExhibitionActive || isGameOver) return;
    dispatchExhibitionTurn();
  }, 250);
}

function dispatchExhibitionTurn() {
  if (!isExhibitionActive || isGameOver) return;

  const isSenteTurn = (turn === 'PLAYER');
  const targetKey = isSenteTurn ? exhibitionSenteTarget : exhibitionGoteTarget;
  const targetSide = isSenteTurn ? 'PLAYER' : 'AI';
  const targetData = getTargetAIData(targetKey);

  exhibitionAchievedDepth = 1;
  exhibitionTargetDepth = targetData.targetDepth || (targetKey === 'strategist' ? 5 : 3);

  isAiThinking = true;
  startTurnTimer(targetSide, targetData.name);

  const safeLimit = EXHIBITION_TIME_LIMITS[exhibitionSpeed] || 8500;

  clearTimeout(exhibitionSafetyTimer);
  exhibitionSafetyTimer = setTimeout(() => {
    if (isAiThinking && isExhibitionActive && !isGameOver) {
      console.warn('御前試合AI思考制限時間超過検知：安全フォールバック発動');
      const legals = getLegalMoves(targetSide);
      if (legals.length > 0) {
        const fallbackMove = legals[0];
        handleWorkerMessage({ data: { type: 'done', bestMove: fallbackMove, depth: 1, targetDepth: 1, nodes: 0, timeSpentMs: safeLimit } });
      }
    }
  }, safeLimit + 2000);

  if (['nanban', 'kenshi', 'inja', 'sokei'].includes(targetKey)) {
    const payload = {
      board: cloneBoardState(board),
      hands: JSON.parse(JSON.stringify(hands)),
      engineType: targetKey,
      owner: targetSide,
      history: moveObjectsHistory,
      hashHistory: boardHashHistory,
      timeLimit: safeLimit
    };

    if (externalAiWorker) {
      externalAiWorker.postMessage(payload);
    } else {
      setTimeout(() => {
        if (!isExhibitionActive || isGameOver) return;
        const res = window.thinkInstructorMoveDirect ? window.thinkInstructorMoveDirect(payload) : null;
        if (res) handleExternalWorkerMessage({ data: res });
      }, 50);
    }
  } else {
    let lvl = 1;
    if (targetKey.startsWith('lvl_')) lvl = parseInt(targetKey.replace('lvl_', ''), 10);
    else if (targetKey === 'strategist') lvl = 11;

    aiWorker.postMessage({
      board, hands,
      level: lvl,
      history: moveObjectsHistory,
      hashHistory: boardHashHistory,
      isExhibition: true,
      targetOwner: targetSide,
      timeLimit: safeLimit
    });
  }
}

function scheduleNextExhibitionTurn() {
  if (!isExhibitionActive || isGameOver) return;
  stopExhibitionTimer();
  stopTurnTimer();
  const delay = EXHIBITION_DELAYS[exhibitionSpeed] || 1200;

  exhibitionTimer = setTimeout(() => {
    if (!isExhibitionActive || isGameOver) return;
    dispatchExhibitionTurn();
  }, delay);
}

function stopExhibition() {
  playUiClickSound();
  stopExhibitionTimer(); stopTurnTimer();
  
  if (isExhibitionActive && moveObjectsHistory.length >= 5 && !isGameOver) {
    const exhModeTxt = (exhibitionSpeed === 'fast') ? '早指し戦' : '本将棋';
    saveBattleRecord('exhibition', `御前${exhModeTxt}(観戦終了)`);
  }
  
  isExhibitionActive = false;
  
  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  const playerChangeBtn = document.getElementById('btn-player-change');
  if (enemyChangeBtn) enemyChangeBtn.style.display = 'inline-flex';
  if (playerChangeBtn) playerChangeBtn.style.display = 'inline-flex';

  exitReplayMode();
}

function stopExhibitionTimer() {
  if (exhibitionTimer) {
    clearTimeout(exhibitionTimer);
    exhibitionTimer = null;
  }
  if (exhibitionSafetyTimer) {
    clearTimeout(exhibitionSafetyTimer);
    exhibitionSafetyTimer = null;
  }
}

/* 当局・合戦絵巻（棋譜モーダル）リアルタイム自動追従システム */
function updateKifuModalLive() {
  const isPlayerSente = (battleStartTurn === 'PLAYER');
  let p = null, e = null;

  if (isExhibitionActive) {
    p = getTargetAIData(exhibitionSenteTarget);
    e = getTargetAIData(exhibitionGoteTarget);
  } else {
    p = isPlayerSente ? PLAYER_WARLORDS[currentMyWarlordId] : WARLORDS_DATA[currentAiLevel];
    e = isPlayerSente ? WARLORDS_DATA[currentAiLevel] : PLAYER_WARLORDS[currentMyWarlordId];
  }

  const pMax = getPlayerMaxTroops();
  const aiMax = getAiMaxTroops();

  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;
  const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);

  const pCurrent = Math.round(pMax * (pPct / 100));
  const aiCurrent = Math.round(aiMax * (aiPct / 100));

  const pVal = document.getElementById('kifu-player-troops-val');
  const eVal = document.getElementById('kifu-enemy-troops-val');
  if (pVal) pVal.textContent = `${pCurrent.toLocaleString()} 兵`;
  if (eVal) eVal.textContent = `${aiCurrent.toLocaleString()} 兵`;

  const troopsDiff = pCurrent - aiCurrent;
  const diffBadge = document.getElementById('kifu-troops-diff-disp');
  if (diffBadge) {
    if (troopsDiff >= 0) {
      diffBadge.textContent = `☗ 先手 +${troopsDiff.toLocaleString()} 兵優勢`;
      diffBadge.style.color = '#ffd700';
    } else {
      diffBadge.textContent = `☖ 後手 +${Math.abs(troopsDiff).toLocaleString()} 兵優勢`;
      diffBadge.style.color = '#ffe6aa';
    }
  }

  const curSitText = document.getElementById('situation-text')?.textContent || '';
  const modalSit = document.getElementById('kifu-modal-situation-text');
  if (modalSit) modalSit.textContent = curSitText;

  drawTerritoryChart();

  const l = document.getElementById('kifu-list');
  if (l && moveObjectsHistory.length > 0) {
    const idx = moveObjectsHistory.length - 1;
    if (l.children.length < moveObjectsHistory.length) {
      const m = moveObjectsHistory[idx];
      const d = document.createElement('div');
      d.className = 'kifu-row-item';
      
      const officialMoveTxt = formatOfficialKifuMove(m, idx, false);
      const moveStr = `${idx + 1}手目：${officialMoveTxt}`;

      const metric = moveMetricsHistory[idx] || { timeSec: '0.1', depth: 1 };
      const metricHtml = `<span class="kifu-metric-pill">⏱ ${metric.timeSec}秒 ｜ 深さ${metric.depth}</span>`;

      let badgeHtml = '';
      if (m.isCap) {
        badgeHtml = `<span class="kifu-badge-critical badge-tennozan">⚔ 敵駒討捕</span>`;
      } else if (m.promote) {
        badgeHtml = `<span class="kifu-badge-critical badge-shock">🔥 成駒覚醒！</span>`;
      }

      d.innerHTML = `
        <span class="kifu-move-txt">${moveStr}</span>
        <div class="kifu-row-right-group">
          ${badgeHtml}
          ${metricHtml}
        </div>
      `;

      d.onclick = () => {
        playUiClickSound();
        reviewingIndex = idx + 1;
        const snap = historyStates[reviewingIndex];
        board = cloneBoardState(snap.board);
        hands = JSON.parse(JSON.stringify(snap.hands));
        lastMove = snap.moveObjectsHistory[snap.moveObjectsHistory.length - 1] || null;
        renderBoard();
        updateTroopsAndSituation(); updateReviewModeUI();
        closeKifuModal();
        setOrderMessage(`【合戦絵巻鑑賞中】第 ${reviewingIndex} 手目の布陣を再現しております。`, false, 'player');
      };

      l.appendChild(d);
      l.scrollTop = l.scrollHeight;
    }
  }
}

function openKifuModal() {
  initAudio(); playUiClickSound(); stopAutoReplay();

  const isPlayerSente = (battleStartTurn === 'PLAYER');
  let p = null, e = null;

  if (isExhibitionActive) {
    p = getTargetAIData(exhibitionSenteTarget);
    e = getTargetAIData(exhibitionGoteTarget);
  } else {
    p = isPlayerSente ? PLAYER_WARLORDS[currentMyWarlordId] : WARLORDS_DATA[currentAiLevel];
    e = isPlayerSente ? WARLORDS_DATA[currentAiLevel] : PLAYER_WARLORDS[currentMyWarlordId];
  }

  const pMax = getPlayerMaxTroops();
  const aiMax = getAiMaxTroops();

  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;
  const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);

  const pCurrent = Math.round(pMax * (pPct / 100));
  const aiCurrent = Math.round(aiMax * (aiPct / 100));

  const pTag = document.getElementById('kifu-player-tag');
  const eTag = document.getElementById('kifu-enemy-tag');
  const pVal = document.getElementById('kifu-player-troops-val');
  const eVal = document.getElementById('kifu-enemy-troops-val');

  if (pTag) pTag.innerHTML = getWarlordDisplayNameHtml(p);
  if (eTag) eTag.innerHTML = getWarlordDisplayNameHtml(e);
  if (pVal) pVal.textContent = `${pCurrent.toLocaleString()} 兵`;
  if (eVal) eVal.textContent = `${aiCurrent.toLocaleString()} 兵`;

  const troopsDiff = pCurrent - aiCurrent;
  const diffBadge = document.getElementById('kifu-troops-diff-disp');
  if (diffBadge) {
    if (troopsDiff >= 0) {
      diffBadge.textContent = `☗ 先手 +${troopsDiff.toLocaleString()} 兵優勢`;
      diffBadge.style.color = '#ffd700';
    } else {
      diffBadge.textContent = `☖ 後手 +${Math.abs(troopsDiff).toLocaleString()} 兵優勢`;
      diffBadge.style.color = '#ffe6aa';
    }
  }

  const badgeEl = document.getElementById('kifu-modal-status-badge');
  if (badgeEl) {
    if (isGameOver) {
      if (pPct > aiPct) { badgeEl.textContent = '【天下掌握】完全勝利'; badgeEl.style.color = '#ffd700'; }
      else { badgeEl.textContent = '【本陣陥落】合戦決着'; badgeEl.style.color = '#ff3d00'; }
    } else {
      if (pPct >= 80 && aiPct <= 45) { badgeEl.textContent = '【天下掌握】勝勢'; badgeEl.style.color = '#ffd700'; }
      else if (pPct > aiPct) { badgeEl.textContent = '【敵陣蹂躙】優勢'; badgeEl.style.color = '#ffd700'; }
      else if (aiPct >= 80 && pPct <= 45) { badgeEl.textContent = '【本陣陥落寸前】敗勢'; badgeEl.style.color = '#ff3d00'; }
      else if (pPct < aiPct) { badgeEl.textContent = '【防戦一方】劣勢'; badgeEl.style.color = '#ffb74d'; }
      else { badgeEl.textContent = '【天下分水嶺】互角の白兵戦'; badgeEl.style.color = '#ffeb3b'; }
    }
  }

  const chartPlayerTag = document.getElementById('chart-player-name-tag');
  const chartEnemyTag = document.getElementById('chart-enemy-name-tag');
  if (chartPlayerTag) chartPlayerTag.innerHTML = `☗ 先手陣領地（${p.name}：下陣）`;
  if (chartEnemyTag) chartEnemyTag.innerHTML = `☖ 後手陣領地（${e.name}：上陣）`;

  const curSitText = document.getElementById('situation-text')?.textContent || '';
  const modalSit = document.getElementById('kifu-modal-situation-text');
  if (modalSit) modalSit.textContent = curSitText;

  const l = document.getElementById('kifu-list');
  if (l) {
    l.innerHTML = '';
    moveObjectsHistory.forEach((m, idx) => {
      const d = document.createElement('div');
      d.className = 'kifu-row-item';
      
      const officialMoveTxt = formatOfficialKifuMove(m, idx, false);
      const moveStr = `${idx + 1}手目：${officialMoveTxt}`;

      const metric = moveMetricsHistory[idx] || { timeSec: '0.1', depth: 1 };
      const metricHtml = `<span class="kifu-metric-pill">⏱ ${metric.timeSec}秒 ｜ 深さ${metric.depth}</span>`;

      let badgeHtml = '';
      if (m.isCap) {
        badgeHtml = `<span class="kifu-badge-critical badge-tennozan">⚔ 敵駒討捕</span>`;
      } else if (m.promote) {
        badgeHtml = `<span class="kifu-badge-critical badge-shock">🔥 成駒覚醒！</span>`;
      }

      d.innerHTML = `
        <span class="kifu-move-txt">${moveStr}</span>
        <div class="kifu-row-right-group">
          ${badgeHtml}
          ${metricHtml}
        </div>
      `;

      d.onclick = () => {
        playUiClickSound();
        reviewingIndex = idx + 1;
        const snap = historyStates[reviewingIndex];
        board = cloneBoardState(snap.board);
        hands = JSON.parse(JSON.stringify(snap.hands));
        lastMove = snap.moveObjectsHistory[snap.moveObjectsHistory.length - 1] || null;
        renderBoard();
        updateTroopsAndSituation(); updateReviewModeUI();
        closeKifuModal();
        setOrderMessage(`【合戦絵巻鑑賞中】第 ${reviewingIndex} 手目の布陣を再現しております。`, false, 'player');
      };
      l.appendChild(d);
    });
    l.scrollTop = l.scrollHeight;
  }

  const modalEl = document.getElementById('kifu-modal');
  if (modalEl) modalEl.style.display = 'flex';
  setTimeout(drawTerritoryChart, 50);
}

function closeKifuModal() {
  playUiClickSound();
  const modalEl = document.getElementById('kifu-modal');
  if (modalEl) modalEl.style.display = 'none';
}

function drawTerritoryChart() {
  const cvs = document.getElementById('chart-canvas');
  if (!cvs) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = cvs.getBoundingClientRect();
  cvs.width = (rect.width || 450) * dpr;
  cvs.height = (rect.height || 130) * dpr;
  const ctx = cvs.getContext('2d');
  const w = cvs.width, h = cvs.height;
  ctx.clearRect(0, 0, w, h);

  const midY = h / 2;
  const enemyTerritoryGrad = ctx.createLinearGradient(0, 0, 0, h);
  enemyTerritoryGrad.addColorStop(0, '#060a12');
  enemyTerritoryGrad.addColorStop(0.5, '#0e1726');
  enemyTerritoryGrad.addColorStop(1, '#1b2a42');
  ctx.fillStyle = enemyTerritoryGrad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255, 215, 0, 0.2)';
  ctx.lineWidth = 1 * dpr;
  ctx.setLineDash([3 * dpr, 3 * dpr]);
  [h * 0.2, h * 0.35, h * 0.65, h * 0.8].forEach(y => {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  });

  ctx.setLineDash([]);
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.85)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.beginPath(); ctx.moveTo(0, midY); ctx.lineTo(w, midY); ctx.stroke();

  if (historyStates.length < 2) return;

  const count = historyStates.length;
  const step = w / Math.max(1, count - 1);
  const points = historyStates.map((snap, idx) => {
    const { pPct, aiPct } = calculateTroopsPercentages(snap.board, snap.hands);
    const diff = pPct - aiPct;
    const clampedDiff = Math.max(-75, Math.min(75, diff));
    const y = midY - (clampedDiff / 75) * (midY * 0.85);
    const x = idx * step;
    return { x, y, pPct, aiPct, diff, idx };
  });

  ctx.beginPath();
  ctx.moveTo(points[0].x, h);
  ctx.lineTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.lineTo(points[points.length - 1].x, h);
  ctx.closePath();

  const playerTerritoryGrad = ctx.createLinearGradient(0, 0, 0, h);
  playerTerritoryGrad.addColorStop(0, 'rgba(255, 215, 0, 0.95)');
  playerTerritoryGrad.addColorStop(0.2, 'rgba(212, 35, 35, 0.90)');
  playerTerritoryGrad.addColorStop(0.65, 'rgba(128, 18, 18, 0.95)');
  playerTerritoryGrad.addColorStop(1, '#300505');
  ctx.fillStyle = playerTerritoryGrad;
  ctx.fill();

  ctx.beginPath();
  ctx.lineWidth = 3.0 * dpr;
  ctx.strokeStyle = '#fff8b3';
  ctx.shadowColor = '#ffd700';
  ctx.shadowBlur = 8 * dpr;
  points.forEach((pt, idx) => {
    if (idx === 0) ctx.moveTo(pt.x, pt.y); else ctx.lineTo(pt.x, pt.y);
  });
  ctx.stroke();
  ctx.shadowBlur = 0;

  const lastPt = points[points.length - 1];
  ctx.beginPath();
  ctx.arc(lastPt.x, lastPt.y, 5 * dpr, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 2.5 * dpr;
  ctx.fill();
  ctx.stroke();

  const topEl = document.getElementById('chart-eval-num-top');
  const btmEl = document.getElementById('chart-eval-num-bottom');
  const playerDominancePct = Math.round(50 + (lastPt.diff / 150) * 100);
  const enemyDominancePct = 100 - playerDominancePct;

  if (topEl) topEl.textContent = `後手側支配 ${enemyDominancePct}%`;
  if (btmEl) {
    const advNotice = playerDominancePct >= 65 ? '（本陣へ肉薄！）' : (playerDominancePct <= 35 ? '（本陣防衛急務！）' : '（互角）');
    btmEl.textContent = `先手側支配 ${playerDominancePct}% ${advNotice}`;
  }
}

function renderDynamicTactics() {
  const container = document.getElementById('dynamic-tactics-content');
  if (!container) return;
  const w = WARLORDS_DATA[currentAiLevel];
  const p = PLAYER_WARLORDS[currentMyWarlordId];

  container.innerHTML = `
    <div class="guide-card-box beginner-highlight-box" id="guide-card-dynamic-1">
      <div class="guide-card-header-row">
        <h4>🔰 【Lv.${currentAiLevel} ${w.province}｜${w.name}】を討ち破る兵法</h4>
        <button class="card-speech-btn btn-3d" onclick="toggleCardSpeech('guide-card-dynamic-1')">🔊 朗読</button>
      </div>
      専属軍師・<b>${p.strategistName}</b>による、対「${w.name}」専用の極意に候！<br><br>
      <b class="kw-gold">一、敵将の癖と弱点を見抜け！</b><br>
      ・${w.tacticsHint}<br><br>
      <b class="kw-crimson">二、大駒（飛車・角行）を敵陣へ突入させて成れ！</b><br>
      ・飛車と角は自軍最強の矛。敵陣へ飛び込み、必ず<span class="kw-crimson">「成る」</span>べし！<br><br>
      <b class="kw-blue">三、玉将（大将）の守りを固めよ！</b><br>
      ・金銀を玉の周りに配し、堅牢な陣形を築いてから出撃されよ！
    </div>

    <div class="guide-card-box" id="guide-card-dynamic-2">
      <div class="guide-card-header-row">
        <h4>💡 ${w.name}戦おすすめの「開戦五手」</h4>
        <button class="card-speech-btn btn-3d" onclick="toggleCardSpeech('guide-card-dynamic-2')">🔊 朗読</button>
      </div>
      対局が始まったら、まずはこの手順で盤面を有利に進められよ！<br>
      1. <b>７六歩</b>（角の道を開く）<br>
      2. <b>２六歩</b>（飛車の前の歩を進める）<br>
      3. <b>４八銀</b> または <b>６八玉</b>（玉を少し避難させ、銀を前線へ）<br>
      4. <b>２五歩</b>（飛車先を伸ばす）<br>
      5. 敵の隙を突き、飛車を敵陣へ突撃させて<b>【龍王】</b>へ覚醒せよ！
    </div>
  `;
}

function openGuideModal() {
  playUiClickSound();
  stopGuideSpeech(); stopAutoReplay(); renderDynamicTactics();
  document.getElementById('guide-modal').style.display = 'flex';
}
function closeGuideModal() {
  playUiClickSound(); stopGuideSpeech();
  document.getElementById('guide-modal').style.display = 'none';
}
function switchGuideTab(tabIdx) {
  playUiClickSound(); stopGuideSpeech();
  document.querySelectorAll('.guide-tab-btn').forEach((b, idx) => b.classList.toggle('active', idx === tabIdx));
  for (let i = 0; i <= 4; i++) {
    const pane = document.getElementById(`guide-pane-${i}`);
    if (pane) pane.classList.toggle('active', i === tabIdx);
  }
}

function openConquestMapModal() {
  playUiClickSound(); stopAutoReplay(); updateConquestMapUI();
  document.getElementById('conquest-modal').style.display = 'flex';
}
function closeConquestMapModal() {
  playUiClickSound();
  document.getElementById('conquest-modal').style.display = 'none';
}
function confirmConquestTarget() {
  playUiClickSound(); selectConquestProvince(currentAiLevel); closeConquestMapModal();
}

function openPlayerWarlordModal() {
  playUiClickSound(); stopAutoReplay();
  const l = document.getElementById('player-warlord-list');
  if (!l) return;
  l.innerHTML = '';
  const currentTotalTroops = getPlayerMaxTroops();

  for(let k in PLAYER_WARLORDS) {
    const p = PLAYER_WARLORDS[k];
    const d = document.createElement('div');
    d.className = `warlord-select-card btn-3d ${k === currentMyWarlordId ? 'active' : ''}`;
    d.innerHTML = `
      <div class="card-avatar-mini" style="background:${p.bgGrad};">${getWarlordPortraitHtml(p, false)}</div>
      <div class="card-info-col">
        <div class="card-name-title">${p.name}</div>
        <div class="card-clan-tag">${p.clan}（総動員 ${currentTotalTroops.toLocaleString()} 兵）</div>
        <div class="card-strategist-tag">軍師: ${p.strategistName} (${p.strategistTitle})</div>
      </div>`;
    d.onclick = () => {
      playUiClickSound();
      setPlayerWarlord(k);
      closePlayerWarlordModal();
      const conquestModal = document.getElementById('conquest-modal');
      if (conquestModal && conquestModal.style.display === 'flex') updateConquestMapUI();
    };
    l.appendChild(d);
  }
  document.getElementById('player-warlord-modal').style.display = 'flex';
}

function closePlayerWarlordModal() {
  playUiClickSound();
  document.getElementById('player-warlord-modal').style.display = 'none';
}
function confirmPlayerWarlord() {
  playUiClickSound(); setPlayerWarlord(currentMyWarlordId); closePlayerWarlordModal();
}

function updateConquestMapUI() {
  const clearedCount = clearedProvinces.length;
  const pct = Math.round((clearedCount / 11) * 100);

  const pctDisp = document.getElementById('conquest-pct-disp');
  const pctBar = document.getElementById('conquest-pct-bar');
  const clrCount = document.getElementById('conquest-cleared-count');
  if (pctDisp) pctDisp.textContent = `${pct}%`;
  if (pctBar) pctBar.style.width = `${pct}%`;
  if (clrCount) clrCount.textContent = `${clearedCount} / 11 将平定`;

  const totalTroops = getPlayerMaxTroops();
  const baseTroops = PLAYER_WARLORDS[currentMyWarlordId]?.baseTroops || 3000;
  const bonusTroops = totalTroops - baseTroops;
  const growthDisp = document.getElementById('conquest-total-troops-disp');
  const bonusDisp = document.getElementById('conquest-troops-bonus-disp');
  if (growthDisp) growthDisp.textContent = `${totalTroops.toLocaleString()} 兵`;
  if (bonusDisp) bonusDisp.textContent = `（平定ボーナス：+${bonusTroops.toLocaleString()} 兵）`;

  const maxAvailableLevel = clearedCount > 0 ? Math.min(11, Math.max(...clearedProvinces) + 1) : 1;

  for(let i=1; i<=11; i++) {
    const n = document.getElementById(`map-node-${i}`);
    if (n) {
      n.classList.remove('cleared', 'current', 'locked');
      if (clearedProvinces.includes(i)) n.classList.add('cleared');
      else if (i === currentAiLevel) n.classList.add('current');
      else if (i > maxAvailableLevel) n.classList.add('locked');
    }
  }

  const l = document.getElementById('conquest-warlord-list');
  if (!l) return;
  l.innerHTML = '';
  for(let i=1; i<=11; i++) {
    const w = WARLORDS_DATA[i];
    const isCleared = clearedProvinces.includes(i);
    const isLocked = !isCleared && (i > maxAvailableLevel);
    const isCurrent = (i === currentAiLevel);

    const d = document.createElement('div');
    d.className = `conquest-card-item btn-3d ${isCurrent ? 'selected' : ''} ${isCleared ? 'cleared' : ''} ${isLocked ? 'locked' : ''}`;
    
    let badgeHtml = '';
    if (isCleared) badgeHtml = `<span class="conquest-status-badge badge-conquered">平定済</span>`;
    else if (isLocked) badgeHtml = `<span class="conquest-status-badge badge-locked">未開放</span>`;
    else badgeHtml = `<span class="conquest-status-badge badge-challenge">進軍可</span>`;

    d.innerHTML = `
      <div class="conquest-card-left">
        <div class="conquest-avatar-thumb">${getWarlordPortraitHtml(w, false)}</div>
        <div class="conquest-card-info">
          <div class="conquest-card-title">Lv.${i} ${w.province} ｜ ${w.name}</div>
          <div class="conquest-card-clan">${w.clan} （動員 ${w.maxTroops.toLocaleString()} 兵）</div>
          <div class="conquest-card-feature">⚔ ${w.featureShort}</div>
        </div>
      </div>
      <div>${badgeHtml}</div>`;

    if (!isLocked) d.onclick = () => { playUiClickSound(); selectConquestProvince(i); closeConquestMapModal(); };
    l.appendChild(d);
  }
}

function selectConquestProvince(lvl) {
  const clearedCount = clearedProvinces.length;
  const maxAvailableLevel = clearedCount > 0 ? Math.min(11, Math.max(...clearedProvinces) + 1) : 1;
  if (!clearedProvinces.includes(lvl) && lvl > maxAvailableLevel) return;

  currentAiLevel = lvl;
  const w = WARLORDS_DATA[lvl];
  const p = PLAYER_WARLORDS[currentMyWarlordId];
  const pMax = getPlayerMaxTroops();

  document.getElementById('ai-name-disp').textContent = w.name;
  document.getElementById('ai-clan-disp').textContent = `${w.clan} (Lv.${lvl})`;
  document.getElementById('ai-quote-disp').textContent = w.quotes.opening || w.quotes.default;
  document.getElementById('ai-troops-disp').textContent = `${w.maxTroops.toLocaleString()} / ${w.maxTroops.toLocaleString()} 兵`;
  document.getElementById('player-troops-disp').textContent = `${pMax.toLocaleString()} / ${pMax.toLocaleString()} 兵`;

  const aiBox = document.getElementById('ai-avatar-container');
  if (aiBox) aiBox.innerHTML = getWarlordPortraitHtml(w, true, 'ai');

  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  if (enemyChangeBtn && !isExhibitionActive) {
    enemyChangeBtn.textContent = '⚔ 敵将変更';
    enemyChangeBtn.style.display = 'inline-flex';
  }
  
  updateTurnLabels();
  updateWarlordBGM(lvl);
  updateConquestMapUI();

  const rivalKey = `${currentMyWarlordId}_${currentAiLevel}`;
  const levelHint = w.tacticsHint ? `【${p.strategistShort}の兵法】${w.tacticsHint}` : '';

  if (RIVALRIES[rivalKey]) {
    setOrderMessage({
      line1: RIVALRIES[rivalKey].title,
      line2: `${levelHint} 「対局開始」を押して雌雄を決されよ！`
    }, true, 'alert');
  } else {
    setOrderMessage({
      line1: `${w.province}・「${w.name}」との決戦に候！`,
      line2: `${levelHint} 「対局開始」を押されよ。`
    }, false, 'player');
  }
  updateRivalryButton();
}

function setPlayerWarlord(k) {
  currentMyWarlordId = k;
  try { localStorage.setItem('shogi_my_warlord', k); } catch(e){}
  const p = PLAYER_WARLORDS[k];
  const pMax = getPlayerMaxTroops();

  document.documentElement.style.setProperty('--player-theme-color', p.themeColor);
  document.getElementById('player-name-disp').textContent = p.name;
  document.getElementById('player-clan-disp').textContent = p.clan;
  document.getElementById('player-quote-disp').textContent = p.quotes.opening || p.quotes.default;
  document.getElementById('player-troops-disp').textContent = `${pMax.toLocaleString()} / ${pMax.toLocaleString()} 兵`;
  
  const pBox = document.getElementById('player-avatar-container');
  if (pBox) pBox.innerHTML = getWarlordPortraitHtml(p, true, 'player');

  const playerChangeBtn = document.getElementById('btn-player-change');
  if (playerChangeBtn && !isExhibitionActive) {
    playerChangeBtn.style.display = 'inline-flex';
  }

  updateTurnLabels();
  updateStrategistUI();
  selectConquestProvince(currentAiLevel);
}

/* 日本将棋連盟・柿木将棋公式規格 KIF保存機能 */
function downloadKifu() {
  playUiClickSound();
  const isPlayerSente = (battleStartTurn === 'PLAYER');
  let senteName = '', goteName = '';

  if (isExhibitionActive) {
    senteName = getTargetAIData(exhibitionSenteTarget).name;
    goteName = getTargetAIData(exhibitionGoteTarget).name;
  } else {
    senteName = isPlayerSente ? PLAYER_WARLORDS[currentMyWarlordId].name : WARLORDS_DATA[currentAiLevel].name;
    goteName = isPlayerSente ? WARLORDS_DATA[currentAiLevel].name : PLAYER_WARLORDS[currentMyWarlordId].name;
  }

  const now = new Date();
  const dateStr = `${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

  let txt = `#KIF version=2.0 encoding=UTF-8\n開始日時：${dateStr}\n棋戦：将棋王 2026 〜 天下統一・戦国決戦 〜\n手合割：平手\n先手：${senteName}\n後手：${goteName}\n手数----指手---------消費時間--\n`;

  let totalSec = { SENTE: 0, GOTE: 0 };

  moveObjectsHistory.forEach((m, i) => {
    const isSenteMove = (i % 2 === 0);
    const sideKey = isSenteMove ? 'SENTE' : 'GOTE';
    const metric = moveMetricsHistory[i] || { timeSec: '1' };
    const stepSec = Math.max(1, Math.round(parseFloat(metric.timeSec) || 1));
    totalSec[sideKey] += stepSec;

    const mMin = Math.floor(stepSec / 60);
    const mSec = stepSec % 60;
    const timeStepStr = `${mMin}:${mSec.toString().padStart(2, '0')}`;

    const tHour = Math.floor(totalSec[sideKey] / 3600);
    const tMin = Math.floor((totalSec[sideKey] % 3600) / 60);
    const tSec = totalSec[sideKey] % 60;
    const timeTotalStr = `${tHour.toString().padStart(2,'0')}:${tMin.toString().padStart(2,'0')}:${tSec.toString().padStart(2,'0')}`;

    const officialKifMove = formatOfficialKifuMove(m, i, true);
    const stepNumStr = (i + 1).toString().padStart(4, ' ');
    const paddedMove = officialKifMove.padEnd(7, '　');

    txt += `${stepNumStr} ${paddedMove} ( ${timeStepStr}/${timeTotalStr})\n`;
  });

  if (isGameOver) {
    const totalMoves = moveObjectsHistory.length;
    txt += `${(totalMoves + 1).toString().padStart(4, ' ')} 投了         ( 0:01/00:00:00)\n`;
    const lastWinner = (totalMoves % 2 === 1) ? '先手' : '後手';
    txt += `まで${totalMoves}手にて${lastWinner}の勝ち\n`;
  }

  const b = new Blob([txt], { type: 'text/plain;charset=UTF-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(b);
  a.download = `将棋王_公式合戦棋譜_${senteName}対${goteName}.kif`;
  a.click();
}

function saveBattleRecord(resultType, resultLabel) {
  if (moveObjectsHistory.length < 5) return;
  const now = new Date();
  const dateStr = `${now.getFullYear()}/${(now.getMonth()+1).toString().padStart(2,'0')}/${now.getDate().toString().padStart(2,'0')} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;
  
  let pName = '', eName = '', eProvince = '';
  if (isExhibitionActive) {
    pName = getTargetAIData(exhibitionSenteTarget).name;
    eName = getTargetAIData(exhibitionGoteTarget).name;
    eProvince = '御前試合';
  } else {
    pName = PLAYER_WARLORDS[currentMyWarlordId].name;
    eName = WARLORDS_DATA[currentAiLevel].name;
    eProvince = WARLORDS_DATA[currentAiLevel].province;
  }

  const pTotalSec = Math.round((totalTimeSpentMs.PLAYER || 0) / 1000);
  const aiTotalSec = Math.round((totalTimeSpentMs.AI || 0) / 1000);
  const pAvgSec = movesCountBySide.PLAYER > 0 ? ((pTotalSec / movesCountBySide.PLAYER).toFixed(1)) : '0.0';
  const aiAvgSec = movesCountBySide.AI > 0 ? ((aiTotalSec / movesCountBySide.AI).toFixed(1)) : '0.0';

  const record = {
    id: Date.now(),
    date: dateStr,
    playerWarlordId: isExhibitionActive ? exhibitionSenteTarget : currentMyWarlordId,
    playerWarlordName: pName,
    playerTroops: getPlayerMaxTroops(),
    enemyLevel: currentAiLevel,
    enemyName: eName,
    enemyProvince: eProvince,
    enemyTroops: getAiMaxTroops(),
    result: resultType,
    resultLabel: resultLabel,
    movesCount: moveObjectsHistory.length,
    sente: (battleStartTurn === 'PLAYER') ? '先手' : '後手',
    battleStartTurn: battleStartTurn,
    hintUsed: hintUsedCount,
    awakenedHintUsed: awakenedHintCount,
    isExhibition: !!isExhibitionActive,
    exhibitionSpeed: isExhibitionActive ? exhibitionSpeed : null,
    timeStats: { playerTotalSec: pTotalSec, playerAvgSec: pAvgSec, aiTotalSec: aiTotalSec, aiAvgSec: aiAvgSec },
    moveObjectsHistory: JSON.parse(JSON.stringify(moveObjectsHistory)),
    moveMetricsHistory: JSON.parse(JSON.stringify(moveMetricsHistory)),
    exhibitionSenteTarget: isExhibitionActive ? exhibitionSenteTarget : null,
    exhibitionGoteTarget: isExhibitionActive ? exhibitionGoteTarget : null,
    exhibitionStrategistKey: isExhibitionActive ? exhibitionRandomStrategistWarlordKey : null
  };

  try {
    const storageKey = isExhibitionActive ? 'shogi_battle_records_exhibition' : 'shogi_battle_records_player';
    let records = JSON.parse(localStorage.getItem(storageKey) || '[]');
    records.unshift(record);
    if (records.length > 50) records = records.slice(0, 50);
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch(e) {}
}

function rebuildHistoryStatesFromMoves(moves) {
  const rBoard = Array.from({length: 9}, () => Array(9).fill(null));
  const rHands = { PLAYER: {}, AI: {} };

  rBoard[0] = [{code:'KY',owner:'AI'},{code:'KE',owner:'AI'},{code:'GI',owner:'AI'},{code:'KI',owner:'AI'},{code:'OU',owner:'AI'},{code:'KI',owner:'AI'},{code:'GI',owner:'AI'},{code:'KE',owner:'AI'},{code:'KY',owner:'AI'}];
  rBoard[1][1] = {code:'KA',owner:'AI'}; rBoard[1][7] = {code:'HI',owner:'AI'};
  for(let c=0; c<9; c++) rBoard[2][c] = {code:'FU',owner:'AI'};
  for(let c=0; c<9; c++) rBoard[6][c] = {code:'FU',owner:'PLAYER'};
  rBoard[7][1] = {code:'KA',owner:'PLAYER'}; rBoard[7][7] = {code:'HI',owner:'PLAYER'};
  rBoard[8] = [{code:'KY',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'OU',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'KY',owner:'PLAYER'}];

  const states = [];
  const evalHistory = [0];
  const appliedMoves = [];

  states.push({ board: cloneBoardState(rBoard), hands: JSON.parse(JSON.stringify(rHands)), turn: 'PLAYER', moveObjectsHistory: [] });

  moves.forEach((m) => {
    appliedMoves.push(m);
    if (m.type === 'drop') {
      rHands[m.owner][m.code]--;
      rBoard[m.to.r][m.to.c] = { code: m.code, owner: m.owner };
    } else {
      const fp = rBoard[m.from.r][m.from.c], tp = rBoard[m.to.r][m.to.c];
      if (tp && tp.code !== 'OU') {
        const raw = UNPROMOTE_MAP[tp.code];
        rHands[m.owner][raw] = (rHands[m.owner][raw] || 0) + 1;
      }
      if (m.promote) fp.code = PROMOTE_MAP[fp.code];
      rBoard[m.to.r][m.to.c] = fp;
      rBoard[m.from.r][m.from.c] = null;
    }

    const { pPct, aiPct } = calculateTroopsPercentages(rBoard, rHands);
    evalHistory.push(pPct - aiPct);

    states.push({
      board: cloneBoardState(rBoard),
      hands: JSON.parse(JSON.stringify(rHands)),
      turn: (m.owner === 'PLAYER') ? 'AI' : 'PLAYER',
      moveObjectsHistory: JSON.parse(JSON.stringify(appliedMoves))
    });
  });

  return { states, evalHistory };
}

function openHistoryModal() {
  playUiClickSound(); stopAutoReplay(); renderBattleHistoryList();
  document.getElementById('battle-history-modal').style.display = 'flex';
}
function closeHistoryModal() {
  playUiClickSound();
  document.getElementById('battle-history-modal').style.display = 'none';
}

function switchHistoryTab(tab) {
  playUiClickSound(); currentHistoryTab = tab;
  document.getElementById('tab-btn-history-player').classList.toggle('active', tab === 'player');
  document.getElementById('tab-btn-history-exhibition').classList.toggle('active', tab === 'exhibition');
  
  const wSelect = document.getElementById('filter-warlord');
  const eSelect = document.getElementById('filter-level');

  if (tab === 'player') {
    if (wSelect) {
      wSelect.innerHTML = `
        <option value="all">すべて</option>
        <option value="sanada">真田幸村</option>
        <option value="keiji">前田慶次</option>
        <option value="masamune">伊達政宗</option>
        <option value="kanetsugu">直江兼続</option>
        <option value="tadakatsu">本多忠勝</option>
      `;
    }
    if (eSelect) {
      eSelect.innerHTML = `
        <option value="all">すべての敵将</option>
        <option value="1">Lv.1 木下藤吉郎</option>
        <option value="2">Lv.2 前田利家</option>
        <option value="3">Lv.3 柴田勝家</option>
        <option value="4">Lv.4 浅井長政</option>
        <option value="5">Lv.5 明智光秀</option>
        <option value="6">Lv.6 上杉謙信</option>
        <option value="7">Lv.7 武田信玄</option>
        <option value="8">Lv.8 織田信長</option>
        <option value="9">Lv.9 豊臣秀吉</option>
        <option value="10">Lv.10 徳川家康</option>
        <option value="11">Lv.11 前田慶次 (軍師AI)</option>
      `;
    }
  } else {
    if (wSelect) {
      wSelect.innerHTML = `
        <option value="all">すべての対陣</option>
        <option value="lvl_1">Lv.1 木下藤吉郎</option>
        <option value="lvl_2">Lv.2 前田利家</option>
        <option value="lvl_3">Lv.3 柴田勝家</option>
        <option value="lvl_4">Lv.4 浅井長政</option>
        <option value="lvl_5">Lv.5 明智光秀</option>
        <option value="lvl_6">Lv.6 上杉謙信</option>
        <option value="lvl_7">Lv.7 武田信玄</option>
        <option value="lvl_8">Lv.8 織田信長</option>
        <option value="lvl_9">Lv.9 豊臣秀吉</option>
        <option value="lvl_10">Lv.10 徳川家康</option>
        <option value="nanban">蒲生氏郷 (MicroMax系)</option>
        <option value="kenshi">柳生石舟斎 (Sunfish系)</option>
        <option value="inja">黒田如水 (Bonanza系)</option>
        <option value="sokei">大橋宗桂 (初代名人)</option>
        <option value="strategist">軍師AI</option>
      `;
    }
    if (eSelect) {
      eSelect.innerHTML = `
        <option value="all">すべての方式</option>
        <option value="normal">通常本将棋</option>
        <option value="fast">早指し戦</option>
      `;
    }
  }
  renderBattleHistoryList();
}

function renderBattleHistoryList() {
  const isPlayerTab = (currentHistoryTab === 'player');
  const storageKey = isPlayerTab ? 'shogi_battle_records_player' : 'shogi_battle_records_exhibition';
  let records = [];
  try { records = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) { records = []; }

  if (records.length === 0 && isPlayerTab) {
    try {
      const old = JSON.parse(localStorage.getItem('shogi_battle_records') || '[]');
      if (old.length > 0) records = old.filter(r => !r.isExhibition);
    } catch(e) {}
  }

  const resF = document.getElementById('filter-result')?.value || 'all';
  const warF = document.getElementById('filter-warlord')?.value || 'all';
  const lvlF = document.getElementById('filter-level')?.value || 'all';
  const summaryStripEl = document.getElementById('history-summary-strip');

  if (isPlayerTab) {
    const pTotal = records.length;
    const pWins = records.filter(r => r.result === 'win').length;
    const pLoses = records.filter(r => r.result === 'lose').length;
    const pDraws = records.filter(r => r.result === 'draw').length;
    const pWinRate = pTotal > 0 ? Math.round((pWins / (pTotal - pDraws || 1)) * 100) : 0;

    let rankTitle = '初陣の若武者';
    if (pTotal >= 10 && pWinRate >= 80) rankTitle = '天下無双';
    else if (pTotal >= 5 && pWinRate >= 60) rankTitle = '歴戦の覇者';
    else if (pWins >= 3) rankTitle = '一騎当千';

    if (summaryStripEl) {
      summaryStripEl.innerHTML = `
        <span class="summary-rank-tag">🏆 ${rankTitle}</span>
        <span class="summary-stats-txt">通算 <b>${pTotal}</b>戦 <b>${pWins}</b>勝 <b>${pLoses}</b>敗 <b>${pDraws}</b>分（勝率 <b>${pWinRate}%</b>）</span>
      `;
    }
  } else {
    const exhTotal = records.length;
    let instWins = 0, warlordWins = 0;
    records.forEach(r => {
      if (r.resultLabel && r.resultLabel.includes('勝')) {
        const match = r.resultLabel.match(/：(.+)勝/);
        if (match) {
          const wName = match[1];
          if (wName.includes('蒲生') || wName.includes('柳生') || wName.includes('如水') || wName.includes('宗桂') || wName.includes('南蛮') || wName.includes('剣士') || wName.includes('隠者')) instWins++;
          else warlordWins++;
        }
      }
    });

    if (summaryStripEl) {
      summaryStripEl.innerHTML = `
        <span class="summary-rank-tag">⚔ 御前武芸録</span>
        <span class="summary-stats-txt">通算 <b>${exhTotal}</b>戦 ｜ 客分英傑 <b>${instWins}</b>勝 vs 戦国武将 <b>${warlordWins}</b>勝</span>
      `;
    }
  }

  const filtered = records.filter(r => {
    if (resF !== 'all' && r.result !== resF) return false;
    if (isPlayerTab) {
      if (warF !== 'all' && r.playerWarlordId !== warF) return false;
      if (lvlF !== 'all' && r.enemyLevel !== parseInt(lvlF, 10)) return false;
    } else {
      if (warF !== 'all' && r.playerWarlordId !== warF && r.exhibitionSenteTarget !== warF) return false;
      if (lvlF !== 'all' && r.exhibitionSpeed !== lvlF) return false;
    }
    return true;
  });

  const listEl = document.getElementById('history-records-list');
  if (!listEl) return;
  listEl.innerHTML = '';

  if (filtered.length === 0) {
    listEl.innerHTML = `<div style="text-align:center; padding:30px 10px; color:#c4aa76; font-size:12px;">条件に合致する合戦記録はござらぬ。</div>`;
    return;
  }

  filtered.forEach(r => {
    const card = document.createElement('div');
    card.className = 'history-record-card';

    let badgeClass = 'badge-lose';
    if (r.result === 'win') badgeClass = 'badge-win';
    else if (r.result === 'draw') badgeClass = 'badge-draw';
    else if (r.result === 'exhibition') {
      badgeClass = (r.exhibitionSpeed === 'fast') ? 'badge-exhibition-hayazashi' : 'badge-exhibition-honshogi';
    }

    let isPlayerWinner = false, isEnemyWinner = false;
    if (r.result === 'win') isPlayerWinner = true;
    else if (r.result === 'lose') isEnemyWinner = true;
    else if (r.result === 'exhibition' && r.resultLabel?.includes('勝')) {
      const match = r.resultLabel.match(/：(.+)勝/);
      if (match && match[1] === r.playerWarlordName) isPlayerWinner = true;
      else isEnemyWinner = true;
    }

    let playerAvatarData = null, enemyAvatarData = null;
    if (r.isExhibition) {
      playerAvatarData = getTargetAIData(r.exhibitionSenteTarget || r.playerWarlordId);
      enemyAvatarData = getTargetAIData(r.exhibitionGoteTarget || `lvl_${r.enemyLevel}`);
    } else {
      playerAvatarData = PLAYER_WARLORDS[r.playerWarlordId] || PLAYER_WARLORDS['sanada'];
      enemyAvatarData = WARLORDS_DATA[r.enemyLevel] || WARLORDS_DATA[1];
    }

    const tStats = r.timeStats || { playerTotalSec: 0, aiTotalSec: 0 };
    const totalBattleSec = (tStats.playerTotalSec || 0) + (tStats.aiTotalSec || 0);
    const durationStr = formatTimeMinutesSeconds(totalBattleSec);

    let honorBadgeHtml = '';
    if (r.isExhibition) {
      const modeTxt = (r.exhibitionSpeed === 'fast') ? '⚡ 早指し戦' : '⚔ 通常本将棋';
      honorBadgeHtml = `<span class="footer-stat-pill" style="border-color:#ffd700; color:#ffd700;">${modeTxt}</span>`;
    } else if (r.hintUsed === 0) {
      honorBadgeHtml = `<span class="footer-stat-pill footer-stat-selfwin">✨ 完全自力勝利(助言無)</span>`;
    } else {
      honorBadgeHtml = `<span class="footer-stat-pill">💡 軍師助言: ${r.hintUsed}回</span>`;
    }

    const senteMarkIcon = (r.sente === '先手') ? '☗' : '☖';

    card.innerHTML = `
      <div class="card-tier-header">
        <div class="tier-header-left">
          <span class="history-res-badge ${badgeClass}">【${r.resultLabel}】</span>
          <span class="tier-header-meta">第${r.movesCount}手 結び</span>
        </div>
        <div style="display:flex; align-items:center; gap:5px;">
          <span class="tier-header-meta">📅 ${r.date}</span>
          <button class="btn-delete-card-mini" onclick="deleteSingleHistoryRecord(${r.id}, '${storageKey}')" title="この記録を抹消">🗑</button>
        </div>
      </div>

      <div class="card-tier-clash">
        <div class="clash-side ${isPlayerWinner ? 'is-winner' : (isEnemyWinner ? 'is-loser' : '')}">
          <div class="clash-avatar-box">${getWarlordPortraitHtml(playerAvatarData, false)}</div>
          <span class="clash-name-txt">${getWarlordDisplayNameHtml(playerAvatarData)}</span>
          <span class="clash-tag-sente">${senteMarkIcon} ${r.sente}</span>
        </div>
        <span class="clash-vs-mark">⚔</span>
        <div class="clash-side clash-side-enemy ${isEnemyWinner ? 'is-winner' : (isPlayerWinner ? 'is-loser' : '')}">
          <div class="clash-avatar-box">${getWarlordPortraitHtml(enemyAvatarData, false)}</div>
          <span class="clash-name-txt">${getWarlordDisplayNameHtml(enemyAvatarData)}</span>
        </div>
      </div>

      <div class="card-tier-footer">
        <div class="tier-footer-stats">
          <span class="footer-stat-pill">⏱ 合戦刻: <b>${durationStr}</b></span>
          ${honorBadgeHtml}
        </div>
        <button class="btn-replay-card-main btn-3d" onclick="replayFromHistory(${r.id}, '${storageKey}')">盤上再現</button>
      </div>
    `;
    listEl.appendChild(card);
  });
}

function deleteSingleHistoryRecord(recordId, storageKey) {
  playUiClickSound();
  try {
    let records = JSON.parse(localStorage.getItem(storageKey) || '[]');
    records = records.filter(r => r.id !== recordId);
    localStorage.setItem(storageKey, JSON.stringify(records));
    triggerCutin('合戦記録を抹消いたし候');
    renderBattleHistoryList();
  } catch(e) {}
}

function replayFromHistory(recordId, storageKey) {
  let records = [];
  try { records = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) { records = []; }
  
  const rec = records.find(r => r.id === recordId);
  if (!rec) return;

  if (!isGameOver && moveObjectsHistory.length > 0) {
    savedActiveBattle = {
      isExhibitionActive: !!isExhibitionActive,
      exhibitionSenteTarget: isExhibitionActive ? exhibitionSenteTarget : null,
      exhibitionGoteTarget: isExhibitionActive ? exhibitionGoteTarget : null,
      exhibitionSpeed: isExhibitionActive ? exhibitionSpeed : 'normal',
      exhibitionStrategistKey: isExhibitionActive ? exhibitionRandomStrategistWarlordKey : null,
      exhibitionAchievedDepth, exhibitionTargetDepth, exhibitionTotalNodes,
      currentMyWarlordId, currentAiLevel,
      board: cloneBoardState(board),
      hands: JSON.parse(JSON.stringify(hands)),
      turn, battleStartTurn,
      moveObjectsHistory: JSON.parse(JSON.stringify(moveObjectsHistory)),
      historyStates: JSON.parse(JSON.stringify(historyStates)),
      evalScoresHistory: JSON.parse(JSON.stringify(evalScoresHistory)),
      boardHashHistory: JSON.parse(JSON.stringify(boardHashHistory)),
      checkHistory: JSON.parse(JSON.stringify(checkHistory)),
      moveMetricsHistory: JSON.parse(JSON.stringify(moveMetricsHistory)),
      lastMove, hintUsedCount, awakenedHintCount,
      totalTimeSpentMs: JSON.parse(JSON.stringify(totalTimeSpentMs)),
      movesCountBySide: JSON.parse(JSON.stringify(movesCountBySide))
    };
  }

  stopAutoReplay(); stopExhibitionTimer(); stopTurnTimer();
  playUiClickSound(); closeHistoryModal();

  isPastReplayActive = true;
  isExhibitionActive = !!rec.isExhibition;
  battleStartTurn = rec.battleStartTurn || (rec.sente === '先手' ? 'PLAYER' : 'AI');

  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  const playerChangeBtn = document.getElementById('btn-player-change');
  if (enemyChangeBtn) enemyChangeBtn.style.display = 'none';
  if (playerChangeBtn) playerChangeBtn.style.display = 'none';

  if (isExhibitionActive) {
    exhibitionSenteTarget = rec.exhibitionSenteTarget || rec.playerWarlordId;
    exhibitionGoteTarget = rec.exhibitionGoteTarget || `lvl_${rec.enemyLevel}`;
    if (rec.exhibitionStrategistKey) exhibitionRandomStrategistWarlordKey = rec.exhibitionStrategistKey;
    renderMainPortraits();
  } else {
    currentMyWarlordId = rec.playerWarlordId;
    currentAiLevel = rec.enemyLevel;
    setPlayerWarlord(currentMyWarlordId);
    selectConquestProvince(currentAiLevel);
  }

  moveObjectsHistory = rec.moveObjectsHistory || [];
  moveMetricsHistory = rec.moveMetricsHistory || [];
  const rebuilt = rebuildHistoryStatesFromMoves(moveObjectsHistory);
  historyStates = rebuilt.states;
  evalScoresHistory = rebuilt.evalHistory;

  reviewingIndex = historyStates.length - 1;
  const lastSnap = historyStates[reviewingIndex];
  board = cloneBoardState(lastSnap.board);
  hands = JSON.parse(JSON.stringify(lastSnap.hands));
  lastMove = (reviewingIndex > 0) ? lastSnap.moveObjectsHistory[lastSnap.moveObjectsHistory.length - 1] : null;
  isGameOver = true;

  updateTurnLabels();
  updateTurnFocus(null);
  renderBoard();
  updateTroopsAndSituation();
  updateWarlordQuotes();
  updateReviewModeUI();
  
  const pauseNotice = savedActiveBattle ? '（※進行中の対戦は一時中断中。［⚔ 対局へ戻る］でいつでも再開できます）' : '';
  setOrderMessage({
    line1: `【${rec.playerWarlordName} vs ${rec.enemyName}の合戦を再現中】`,
    line2: `［▶自動］や［◀］［▶］で一手ずつ鑑賞可能。${pauseNotice}`
  }, false, 'player');
}

function clearBattleHistory() {
  playUiClickSound();
  const isPlayerTab = (currentHistoryTab === 'player');
  const storageKey = isPlayerTab ? 'shogi_battle_records_player' : 'shogi_battle_records_exhibition';
  localStorage.removeItem(storageKey);
  if (isPlayerTab) localStorage.removeItem('shogi_battle_records');
  triggerCutin(`${isPlayerTab ? '我が合戦録' : '御前試合録'}の全記録を消去いたし候`);
  renderBattleHistoryList();
}

/* 起動イベント */
document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('touchstart', () => initAudio(), { once: true });

loadProgress();
setPlayerWarlord(currentMyWarlordId);
initBoardState();

