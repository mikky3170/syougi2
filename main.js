
/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   メインスクリプト（前編）
   【状態管理一元化 ＆ 動的指南称号 ＆ 高品位音声最適化】
   ========================================================= */

// AI Web Workerコード（通常対局・軍師思考エンジン：深さ厳格維持＋早指し適正化＋気風ボーナス）
const workerScriptContent = `
const PIECE_CODES = ['OU','HI','KA','KI','GI','KE','KY','FU','RY','UM','NG','NK','NY','TO'];
const VALUES = { OU: 30000, HI: 1050, KA: 880, KI: 580, GI: 480, KE: 380, KY: 280, FU: 100, RY: 1450, UM: 1250, NG: 570, NK: 490, NY: 430, TO: 430 };
const UNPROMOTE_MAP = { RY: 'HI', UM: 'KA', NG: 'GI', NK: 'KE', NY: 'KY', TO: 'FU', HI: 'HI', KA: 'KA', KI: 'KI', GI: 'GI', KE: 'KE', KY: 'KY', FU: 'FU', OU: 'OU' };
const PROMOTE_MAP = { HI: 'RY', KA: 'UM', GI: 'NG', KE: 'NK', KY: 'NY', FU: 'TO' };
const MATE_SCORE = 100000;

let board = [], hands = { PLAYER: {}, AI: {} };
let searchStartTime = 0, searchTimeLimit = 5000, isSearchTimeout = false, nodeCount = 0;
let moveHistory = [], pastHashes = [];

const ttWorker = new Map();
const TT_EXACT = 0, TT_ALPHA = 1, TT_BETA = 2;
let workerKillerMoves = Array.from({ length: 60 }, () => [null, null]);

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
  10: { depth: 5, qDepth: 4 }
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
  let s = (t || 'EMPTY') + ':';
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
        if (evalLevel === 1) {
          if (p.code === 'FU') { val += relativeRank * 24; if (relativeRank >= 5) val += 60; }
          if (p.code === 'TO') val += 120;
        }
        if (evalLevel === 2) {
          if (c === 4) val += 35;
          if (p.code === 'GI' || p.code === 'FU') { val += relativeRank * 20; if (c >= 3 && c <= 5) val += 30; }
          if (p.code === 'HI' || p.code === 'RY') val *= 1.20;
        }
        if (evalLevel === 3 && (p.code === 'GI' || p.code === 'FU')) val += relativeRank * 22;
        if (evalLevel === 4 && p.code === 'HI' && c === 2) score += 45;
        if (evalLevel === 5 && p.code === 'FU' && relativeRank >= 5) score += 25;
        if (evalLevel === 6 && (p.code === 'KA' || p.code === 'UM')) val *= 1.25;
        if (evalLevel === 7 && ['KI','GI'].includes(p.code) && relativeRank <= 2) score += 30;
        if (evalLevel === 8 && ['RY','UM'].includes(p.code)) val *= 1.35;
        if (evalLevel === 9 && ['KI','GI'].includes(p.code) && relativeRank >= 5) score += 35;
        if (evalLevel >= 10 && ['RY','UM','KE'].includes(p.code)) val *= 1.35;
      }

      score += sign * val;

      if (p.code !== 'OU') {
        const myDefs = defenseCount[p.owner][r][c];
        const otherSide = (p.owner === 'AI') ? 'PLAYER' : 'AI';
        const oppAttacks = defenseCount[otherSide][r][c];
        if (myDefs > 0) score += sign * 25;
        if (oppAttacks > myDefs) {
          const penaltyRate = (evalLevel === 1) ? 0.12 : ((evalLevel === 2) ? 0.22 : 0.42);
          score -= sign * (val * penaltyRate);
        }
      }

      if (p.code === 'FU' || p.code === 'GI') {
        const advBonus = (evalLevel === 1) ? 14 : ((evalLevel === 2) ? 16 : 10);
        score += sign * (relativeRank * advBonus);
        if (c >= 2 && c <= 6) score += sign * 15;
      }
    }
  }

  if (oppKing && myKing) {
    for (let r=0; r<9; r++) {
      for (let c=0; c<9; c++) {
        const p = board[r][c];
        if (p && p.owner === evalPerspective && ['FU','GI','KE','HI','KA','RY','UM'].includes(p.code)) {
          const distToOpp = Math.abs(r - oppKing.r) + Math.abs(c - oppKing.c);
          if (distToOpp <= 3) score += 25;
        }
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
  for (const hCode in hands[evalPerspective]) score += (hands[evalPerspective][hCode] || 0) * (VALUES[hCode] || 0) * handMul;
  for (const hCode in hands[oppOwner])        score -= (hands[oppOwner][hCode] || 0) * (VALUES[hCode] || 0) * 1.15;
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
      if (!m.isCap && ply < 60) {
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
  const { board: bD, hands: hD, level = 1, isHintRequest = false, isAwakened = false, history = [], hashHistory = [], isExhibition = false, targetOwner = 'AI', timeLimit = 5000, speedMode = 'normal' } = e.data;
  board = bD; hands = hD; moveHistory = history; pastHashes = hashHistory;
  searchStartTime = Date.now(); isSearchTimeout = false; nodeCount = 0;
  
  searchTimeLimit = (typeof timeLimit === 'number' && timeLimit > 0) ? timeLimit : (isExhibition ? 8500 : 9000);
  const isFastMode = (speedMode === 'fast' || searchTimeLimit <= 3000);

  const searchOwner = isHintRequest ? 'PLAYER' : targetOwner;
  const enemyOwner = (searchOwner === 'AI') ? 'PLAYER' : 'AI';
  const effectiveLevel = isHintRequest ? (isAwakened ? 10 : 8) : level;
  const curEval = evaluatePosition(searchOwner, effectiveLevel);

  let cfg = isHintRequest ? (isAwakened ? { depth: 5, qDepth: 4 } : { depth: 4, qDepth: 3 })
                          : (LEVEL_CFG[level] || LEVEL_CFG[1]);

  let targetD = cfg.depth;
  if (isFastMode && !isHintRequest) {
    targetD = Math.max(1, targetD - 1);
  }

  const legals = genLegalMoves(searchOwner, false, true);
  if (legals.length === 0) {
    self.postMessage({ type: isHintRequest ? 'hintDone' : 'done', bestMove: null, candidateMoves: [], evalScore: curEval, depth: 0, targetDepth: targetD, nodes: 0, timeSpentMs: 10 });
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
    
    if (m.type === 'move' && ['KI','GI'].includes(m.code)) {
      const fwd = (m.owner === 'AI') ? (m.to.r - m.from.r) : (m.from.r - m.to.r);
      if (fwd < 0 && ((m.owner === 'AI' && m.from.r <= 2) || (m.owner === 'PLAYER' && m.from.r >= 6))) {
        penalty += 40;
      }
    }

    unmakeMove(undo);
    return penalty;
  };

  let scoredMoves = legals.map(m => ({ move: m, score: 0 }));
  let confirmedBestMove = legals[0];
  let confirmedBestScore = curEval;
  let achievedDepth = 1;

  for (let d = 1; d <= targetD; d++) {
    if (checkTimeout()) break;

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

    if (iterationCompleted && !isSearchTimeout) {
      achievedDepth = d;
      currentIterationMoves.sort((a, b) => b.score - a.score);
      scoredMoves = currentIterationMoves;
      confirmedBestMove = scoredMoves[0].move;
      confirmedBestScore = scoredMoves[0].score;
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
    targetDepth: targetD,
    nodes: nodeCount,
    isAwakened,
    timeSpentMs: elapsedMs
  });
};
`;

/* =========================================================
   三大名盤（材質・色）着せ替えエンジン
   ========================================================= */
let currentBoardThemeIndex = 0;

function loadSavedBoardTheme() {
  try {
    const saved = localStorage.getItem('shogi_board_theme');
    if (saved) {
      const idx = BOARD_THEMES.findIndex(t => t.id === saved);
      if (idx !== -1) currentBoardThemeIndex = idx;
    }
  } catch(e){}
  applyBoardTheme();
}

function applyBoardTheme() {
  const theme = BOARD_THEMES[currentBoardThemeIndex];
  document.body.setAttribute('data-board-theme', theme.id);
  const btn = document.getElementById('btn-theme-switch');
  if (btn) btn.innerHTML = `🏯 ${theme.name.split('・')[0]}`;
}

function cycleBoardTheme() {
  playUiClickSound();
  currentBoardThemeIndex = (currentBoardThemeIndex + 1) % BOARD_THEMES.length;
  const theme = BOARD_THEMES[currentBoardThemeIndex];
  try {
    localStorage.setItem('shogi_board_theme', theme.id);
  } catch(e){}
  applyBoardTheme();
  triggerCutin(`名盤換装：【${theme.name}】`, false);
}

/* =========================================================
   立体五角形将棋駒インラインアイコン 生成エンジン
   ========================================================= */
function getKomaMarkHtml(isSente, sizeType = 'normal') {
  let w = 12, h = 13, vAlign = '-1.5px', mRight = '3px';
  if (sizeType === 'mini') {
    w = 11; h = 12; vAlign = '-1px'; mRight = '2px';
  } else if (sizeType === 'tiny') {
    w = 10; h = 11; vAlign = '-1px'; mRight = '2px';
  }

  const baseStyle = `display:inline-block; vertical-align:${vAlign}; width:${w}px !important; height:${h}px !important; max-width:${w}px !important; max-height:${h}px !important; margin-right:${mRight}; flex-shrink:0; pointer-events:none;`;

  if (isSente) {
    return `<svg viewBox="0 0 100 115" width="${w}" height="${h}" class="koma-icon-svg" style="${baseStyle}">
      <defs>
        <linearGradient id="koma-sente-gold-${w}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#fff6b8"/>
          <stop offset="40%" stop-color="#ffd700"/>
          <stop offset="85%" stop-color="#c98a12"/>
          <stop offset="100%" stop-color="#7a4e05"/>
        </linearGradient>
      </defs>
      <polygon points="50,4 94,24 82,110 18,110 6,24" fill="#080301" stroke="url(#koma-sente-gold-${w})" stroke-width="8" stroke-linejoin="round"/>
      <polygon points="50,16 82,30 72,98 28,98 18,30" fill="#140702" stroke="#cca114" stroke-width="2.5"/>
      <polygon points="50,26 74,36 66,88 34,88 26,36" fill="#000000"/>
    </svg>`;
  } else {
    return `<svg viewBox="0 0 100 115" width="${w}" height="${h}" class="koma-icon-svg" style="${baseStyle} transform:rotate(180deg);">
      <defs>
        <linearGradient id="koma-gote-silver-${w}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="40%" stop-color="#e8eef7"/>
          <stop offset="85%" stop-color="#9bb2cf"/>
          <stop offset="100%" stop-color="#556c8a"/>
        </linearGradient>
      </defs>
      <polygon points="50,4 94,24 82,110 18,110 6,24" fill="#f8fafc" stroke="url(#koma-gote-silver-${w})" stroke-width="8" stroke-linejoin="round"/>
      <polygon points="50,16 82,30 72,98 28,98 18,30" fill="#ffffff" stroke="#cbd5e1" stroke-width="2.5"/>
      <polygon points="50,26 74,36 66,88 34,88 26,36" fill="#e2e8f0"/>
    </svg>`;
  }
}

/* =========================================================
   音響エンジン ＆ Web Speech API（高品質AI合成音声最適化）
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
    stopExhibitionTimer();
    if (audioCtx && audioCtx.state === 'suspended') audioCtx.suspend().catch(() => {});
  } else {
    isPageHidden = false;
    if (soundEnabled) {
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
      startBgm();
    }
    if (!isGameOver && !isReviewingPast()) resumeTurnTimer();
    else if (!isGameOver && isExhibitionActive && !isAiThinking) scheduleNextExhibitionTurn();
  }
}
document.addEventListener('visibilitychange', handleVisibilityChange);
window.addEventListener('pagehide', () => { isPageHidden = true; pauseBgm(); stopGuideSpeech(); stopAutoReplay(); stopTurnTimer(); stopExhibitionTimer(); });
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

/* Web Speech API 朗読管理（Natural / Neural 高品位音声優先選択） */
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
  
  // 自然音声（Natural/Neural/Online/Siri等）を最優先で検索
  if (guideVoiceGender === 'female') {
    const fNaturalVoice = jaVoices.find(v => /natural|neural|online|premium/i.test(v.name) && /female|kyoko|haruka|ayumi|sayaka|nanami|hikari/i.test(v.name));
    const fVoice = fNaturalVoice || jaVoices.find(v => /female|kyoko|haruka|ayumi|sayaka|nanami|hikari/i.test(v.name));
    if (fVoice) uttr.voice = fVoice;
    uttr.pitch = 1.12; uttr.rate = 0.98;
  } else {
    const mNaturalVoice = jaVoices.find(v => /natural|neural|online|premium/i.test(v.name) && /male|otoya|keita|ichiro|hattori|kenji/i.test(v.name));
    const mVoice = mNaturalVoice || jaVoices.find(v => /male|otoya|keita|ichiro|hattori|kenji/i.test(v.name));
    if (mVoice) uttr.voice = mVoice;
    uttr.pitch = 0.88; uttr.rate = 0.95;
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
   【視線誘導 ＆ 手番・思考タイマー・直前指し手管理エンジン】
   ========================================================= */
let turnStartTime = 0;
let turnTimerInterval = null;
let currentThinkingSide = 'PLAYER';
let currentThinkingName = '';

let totalTimeSpentMs = { PLAYER: 0, AI: 0 };
let movesCountBySide = { PLAYER: 0, AI: 0 };

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

  const lastMoveDispId = (side === 'PLAYER') ? 'player-last-move-disp' : 'ai-last-move-disp';
  const lastMoveEl = document.getElementById(lastMoveDispId);
  if (lastMoveEl) lastMoveEl.style.display = 'none';

  updateTurnFocus(side);
  updateThinkingTimerDisplay();

  turnTimerInterval = setInterval(() => {
    updateThinkingTimerDisplay();
  }, 100);
}

function updateThinkingTimerDisplay() {
  if (isGameOver || isReviewingPast()) return;
  const elapsedSec = Math.max(0.1, (Date.now() - turnStartTime) / 1000).toFixed(1);
  const currentStep = getMoveCount() + 1;
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
    if (aiThinkDisp) {
      if (lastSettledMoveInfo.AI) {
        aiThinkDisp.style.display = 'inline-flex';
        aiThinkDisp.className = 'warlord-thinking-inline timer-confirmed-box';
        const dStr = lastSettledMoveInfo.AI.targetDepth 
          ? ` (深さ ${lastSettledMoveInfo.AI.depth}/${lastSettledMoveInfo.AI.targetDepth})` 
          : ` (深さ ${lastSettledMoveInfo.AI.depth})`;
        aiThinkDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo.AI.timeSec}秒</b>${dStr}`;
      } else {
        aiThinkDisp.style.display = 'none';
      }
    }
  } else {
    if (aiThinkDisp) {
      aiThinkDisp.style.display = 'inline-flex';
      aiThinkDisp.className = 'warlord-thinking-inline timer-gold-box';
      const targetD = WARLORDS_DATA[currentAiLevel]?.targetDepth || 1;
      aiThinkDisp.innerHTML = `🧠 敵将熟慮 <b>${elapsedSec}秒</b> (深さ ${targetD})`;
    }
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
    const markHtml = getKomaMarkHtml(isPlayerSente);
    setOrderMessage({
      line1: `第${currentStep}手 ── ${markHtml} <b style="color:#ffd700;">${pName}公の手番に候</b>`,
      line2: '盤上の駒または持ち駒を選び、次の一手を指されよ！'
    }, true, 'player');
  } else if (!isPlayer) {
    const eName = WARLORDS_DATA[currentAiLevel].name;
    const markHtml = getKomaMarkHtml(!isPlayerSente);
    setOrderMessage({
      line1: `第${currentStep}手 ── ${markHtml} <b style="color:#ffe6aa;">${eName}が軍略を巡らせております…</b>`,
      line2: '敵の狙いを見定め、受けの構えを整えられよ。'
    }, false, 'enemy');
  }
}

function updateExhibitionThinkingDisplay(isThinking = true) {
  if (!isExhibitionActive) return;
  const elapsedSec = Math.max(0.1, (Date.now() - turnStartTime) / 1000).toFixed(1);
  const currentStep = getMoveCount() + 1;
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
      const dStr = lastSettledMoveInfo[oppSide].targetDepth 
        ? ` (深さ ${lastSettledMoveInfo[oppSide].depth}/${lastSettledMoveInfo[oppSide].targetDepth})` 
        : ` (深さ ${lastSettledMoveInfo[oppSide].depth})`;
      otherThinkingDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo[oppSide].timeSec}秒</b>${dStr}`;
    } else {
      otherThinkingDisp.style.display = 'none';
    }
  }

  const currentTargetKey = isPlayerSide ? exhibitionSenteTarget : exhibitionGoteTarget;
  const currentWarlordData = getTargetAIData(currentTargetKey);
  const isFast = (exhibitionSpeed === 'fast');
  let charTargetDepth = currentWarlordData.targetDepth || 3;
  if (isFast) charTargetDepth = Math.max(1, charTargetDepth - 1);

  if (targetThinkingDisp) {
    if (isThinking) {
      targetThinkingDisp.style.display = 'inline-flex';
      targetThinkingDisp.className = 'warlord-thinking-inline timer-gold-box';
      targetThinkingDisp.innerHTML = `🧠 神算熟慮 <b>${elapsedSec}秒</b> (深さ ${charTargetDepth})`;
    } else {
      const mySide = isPlayerSide ? 'PLAYER' : 'AI';
      if (lastSettledMoveInfo[mySide]) {
        targetThinkingDisp.style.display = 'inline-flex';
        targetThinkingDisp.className = 'warlord-thinking-inline timer-confirmed-box';
        const dStr = lastSettledMoveInfo[mySide].targetDepth 
          ? ` (深さ ${lastSettledMoveInfo[mySide].depth}/${lastSettledMoveInfo[mySide].targetDepth})` 
          : ` (深さ ${lastSettledMoveInfo[mySide].depth})`;
        targetThinkingDisp.innerHTML = `✔ 決断 <b>${lastSettledMoveInfo[mySide].timeSec}秒</b>${dStr}`;
      } else {
        targetThinkingDisp.style.display = 'none';
      }
    }
  }

  const sData = getTargetAIData(exhibitionSenteTarget);
  const gData = getTargetAIData(exhibitionGoteTarget);
  const inCheck = isCheckState(turn, board);
  let commentatorLine1 = '', commentatorLine2 = '';
  const speedNotice = isFast ? '（※早指し戦につき即断即決・波乱あり）' : '';

  if (inCheck) {
    commentatorLine1 = `第${currentStep}手 ── <b>【急転直下】王手の一撃が放たれましたぞ！</b>`;
    commentatorLine2 = `「本陣に迫る刃をどう凌ぐか、${currentThinkingName}の受けの妙手に刮目めされよ！」`;
  } else if (currentStep <= 12) {
    commentatorLine1 = `第${currentStep}手 ── <b>【序盤戦】両雄、堂々たる陣形構築の刻 ${speedNotice}</b>`;
    commentatorLine2 = `「${getKomaMarkHtml(true)}<b>${sData.name}</b> と ${getKomaMarkHtml(false)}<b>${gData.name}</b>、互いに隙のない布陣を敷き機を伺っております。」`;
  } else if (currentStep <= 30) {
    commentatorLine1 = `第${currentStep}手 ── <b>【中盤戦】前線にて火花散る白兵戦！</b>`;
    commentatorLine2 = `「駒の利きが交錯する天下分水嶺。${currentThinkingName}（${tagSide}）が急所を睨んでおります。」`;
  } else {
    commentatorLine1 = `第${currentStep}手 ── <b>【終盤決戦】敵玉を包囲する寄せ合い！</b>`;
    commentatorLine2 = `「一手の遅れが命取りとなる大激戦！ 一挙に勝負を決する神算の一撃や如何に！」`;
  }

  setOrderMessage({ line1: commentatorLine1, line2: commentatorLine2 }, isThinking, 'exhibition');
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
   【状態管理一元化アーキテクチャ（Single Source of Truth）】
   ========================================================= */
let currentMyWarlordId = 'sanada', currentAiLevel = 1, clearedProvinces = [];
let board = [], hands = { PLAYER: {}, AI: {} }, turn = null, isGameOver = true;
let selectedPos = null, currentValidMoves = [], lastMove = null;
let hintSourceCell = null, hintTargetCell = null, pendingMove = null, isAiThinking = false, isHintThinking = false;

/* 一元管理配列：historyStates[0] は初期配置（0手目）、1手ごとに完全スナップショットを追加 */
let historyStates = [];
let reviewingIndex = -1;

function getMoveCount() {
  return Math.max(0, historyStates.length - 1);
}

function getMoveObjectsList() {
  return historyStates.slice(1).map(s => s.move).filter(Boolean);
}

function getMoveMetricsList() {
  return historyStates.slice(1).map(s => s.metrics || { timeSec: '1.0', depth: 1, targetDepth: 1 });
}

function getEvalScoresList() {
  return historyStates.map(s => s.evalScore || 0);
}

function getHashHistoryList() {
  return historyStates.map(s => s.hash);
}

/* =========================================================
   【過去合戦棋譜・完全シミュレーション再構築エンジン】
   ========================================================= */
function rebuildHistoryStatesFromMoves(moves = [], metrics = [], startTurn = 'PLAYER') {
  const rBoard = Array.from({length: 9}, () => Array(9).fill(null));
  const rHands = { PLAYER: {}, AI: {} };

  rBoard[0] = [{code:'KY',owner:'AI'},{code:'KE',owner:'AI'},{code:'GI',owner:'AI'},{code:'KI',owner:'AI'},{code:'OU',owner:'AI'},{code:'KI',owner:'AI'},{code:'GI',owner:'AI'},{code:'KE',owner:'AI'},{code:'KY',owner:'AI'}];
  rBoard[1][1] = {code:'HI',owner:'AI'}; rBoard[1][7] = {code:'KA',owner:'AI'};
  for(let c=0; c<9; c++) rBoard[2][c] = {code:'FU',owner:'AI'};

  for(let c=0; c<9; c++) rBoard[6][c] = {code:'FU',owner:'PLAYER'};
  rBoard[7][1] = {code:'KA',owner:'PLAYER'}; rBoard[7][7] = {code:'HI',owner:'PLAYER'};
  rBoard[8] = [{code:'KY',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'OU',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'KY',owner:'PLAYER'}];

  const states = [];
  let curTurn = startTurn;

  // 第0手（初期配置スナップショット）
  states.push({
    step: 0,
    board: cloneBoardState(rBoard),
    hands: JSON.parse(JSON.stringify(rHands)),
    turn: curTurn,
    hash: getBoardHash(rBoard, rHands, curTurn),
    inCheck: false,
    move: null,
    metrics: { timeSec: '0.0', depth: 0, targetDepth: 0 },
    evalScore: 0
  });

  moves.forEach((m, idx) => {
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

    const nextTurn = (m.owner === 'PLAYER') ? 'AI' : 'PLAYER';
    curTurn = nextTurn;

    const { pPct, aiPct } = calculateTroopsPercentages(rBoard, rHands);
    const evalScore = pPct - aiPct;
    const hash = getBoardHash(rBoard, rHands, nextTurn);
    const inCheck = isCheckState(nextTurn, rBoard);
    const metric = metrics[idx] || { timeSec: '1.0', depth: 1, targetDepth: 1 };

    states.push({
      step: idx + 1,
      board: cloneBoardState(rBoard),
      hands: JSON.parse(JSON.stringify(rHands)),
      turn: nextTurn,
      hash: hash,
      inCheck: inCheck,
      move: m,
      metrics: metric,
      evalScore: evalScore
    });
  });

  return states;
}

let hintUsedCount = 0, awakenedHintCount = 0, battleStartTurn = 'PLAYER';
let tacticsCandidates = [], currentTacticIndex = 0, isCurrentHintAwakened = false;

let autoReplayTimer = null, isAutoReplaying = false;
const REPLAY_SPEEDS = [1500, 750, 350], REPLAY_SPEED_LABELS = ['1x', '2x', '4x'];
let replaySpeedIndex = 0;

let isPastReplayActive = false, savedActiveBattle = null;
let isExhibitionActive = false, exhibitionTimer = null, exhibitionSpeed = 'normal';
const EXHIBITION_DELAYS = { normal: 1200, fast: 650 };
const EXHIBITION_TIME_LIMITS = { normal: 8500, fast: 2500 };

let exhibitionSenteTarget = 'sanada', exhibitionGoteTarget = 'lvl_10';
let exhibitionMobileCurrentTab = 'sente';
let exhibitionAchievedDepth = 1, exhibitionTargetDepth = 3, exhibitionTotalNodes = 0;

let isPieceAnimating = false, currentHistoryTab = 'player';
let isFurigomaRunning = false;

let externalAiWorker = null;
function initExternalAiWorker() {
  if (externalAiWorker) {
    try { externalAiWorker.terminate(); } catch(e){}
  }
  try {
    externalAiWorker = new Worker('external_ai.js');
    externalAiWorker.onmessage = handleExternalWorkerMessage;
  } catch (e) { externalAiWorker = null; }
}
initExternalAiWorker();

function formatOfficialKifuMove(m, idx, isKifFile = false) {
  if (!m) return '';
  const isSenteMove = (m.owner === (battleStartTurn === 'PLAYER' ? 'PLAYER' : 'AI'));
  const markChar = isSenteMove ? '☗' : '☖';
  
  const rawCode = m.code || 'FU';
  const pieceName = KIF_PIECE_NAMES[rawCode] || '歩';

  let isSameSquare = false;
  const moveList = getMoveObjectsList();
  if (idx > 0 && moveList[idx - 1]) {
    const prev = moveList[idx - 1];
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

function updateButtonStates() {
  const isPlayingBattle = !isGameOver && !isReviewingPast() && !isExhibitionActive;
  const isStandby = isGameOver && !isReviewingPast() && !isExhibitionActive;

  const furigomaBtn = document.getElementById('furigoma-btn');
  if (furigomaBtn) furigomaBtn.disabled = !isStandby || isFurigomaRunning;

  const exhBtn = document.getElementById('btn-cmd-exhibition');
  if (exhBtn) exhBtn.disabled = !isStandby;

  const surrenderBtn = document.getElementById('btn-cmd-surrender');
  if (surrenderBtn) surrenderBtn.disabled = !isPlayingBattle;

  const hintBtn = document.getElementById('btn-master-hint');
  if (hintBtn) hintBtn.disabled = !(isPlayingBattle && turn === 'PLAYER' && !isAiThinking);

  const undoBtn = document.getElementById('btn-cmd-undo');
  if (undoBtn) undoBtn.disabled = !(isPlayingBattle && turn === 'PLAYER' && getMoveCount() > 0 && !isAiThinking);

  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  const playerChangeBtn = document.getElementById('btn-player-change');
  if (enemyChangeBtn) enemyChangeBtn.disabled = !isStandby;
  if (playerChangeBtn) playerChangeBtn.disabled = !isStandby;

  const conquestConfirmBtn = document.getElementById('btn-conquest-confirm');
  const conquestPlayerLinkBtn = document.getElementById('btn-conquest-player-link');
  const playerWarlordConfirmBtn = document.getElementById('btn-player-warlord-confirm');
  if (conquestConfirmBtn) conquestConfirmBtn.disabled = !isStandby;
  if (conquestPlayerLinkBtn) conquestPlayerLinkBtn.disabled = !isStandby;
  if (playerWarlordConfirmBtn) playerWarlordConfirmBtn.disabled = !isStandby;
}

function updateTurnLabels() {
  const pDock = document.getElementById('player-dock-label');
  const aiDock = document.getElementById('ai-dock-label');
  const pNameEl = document.getElementById('player-name-disp');
  const aiNameEl = document.getElementById('ai-name-disp');

  if (isExhibitionActive) {
    const sData = getTargetAIData(exhibitionSenteTarget);
    const gData = getTargetAIData(exhibitionGoteTarget);
    const senteIcon = getKomaMarkHtml(true);
    const goteIcon = getKomaMarkHtml(false);
    if (pDock) pDock.innerHTML = `${senteIcon}先手陣`;
    if (aiDock) aiDock.innerHTML = `${goteIcon}後手陣`;
    if (pNameEl) pNameEl.innerHTML = `${senteIcon}${getWarlordDisplayNameHtml(sData)}`;
    if (aiNameEl) aiNameEl.innerHTML = `${goteIcon}${getWarlordDisplayNameHtml(gData)}`;
    updateStrategistUI();
    return;
  }

  const p = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];
  const w = WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1];
  const isPlayerSente = (battleStartTurn === 'PLAYER');

  const pIcon = getKomaMarkHtml(isPlayerSente);
  const aiIcon = getKomaMarkHtml(!isPlayerSente);

  if (pDock) pDock.innerHTML = `${pIcon}自駒`;
  if (aiDock) aiDock.innerHTML = `${aiIcon}敵駒`;
  if (pNameEl) pNameEl.innerHTML = `${pIcon}${p.name}`;
  if (aiNameEl) aiNameEl.innerHTML = `${aiIcon}${w.name}`;
  updateStrategistUI();
}

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

  const totalMoves = getMoveCount();
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

function updateWarlordQuotes() {
  const pQuoteEl = document.getElementById('player-quote-disp');
  const aiQuoteEl = document.getElementById('ai-quote-disp');
  if (!pQuoteEl || !aiQuoteEl) return;

  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;
  const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);

  const playerInCheck = isCheckState('PLAYER', curBoard);
  const aiInCheck = isCheckState('AI', curBoard);
  const totalMoves = (reviewingIndex >= 0) ? reviewingIndex : getMoveCount();

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
    clearedProvinces = clearedProvinces.filter(lvl => lvl <= 10);
    currentAiLevel = clearedProvinces.length > 0 ? Math.min(10, Math.max(...clearedProvinces) + 1) : 1;
    const mw = localStorage.getItem('shogi_my_warlord');
    if (mw && PLAYER_WARLORDS[mw]) currentMyWarlordId = mw;
  } catch (e) { clearedProvinces = []; currentAiLevel = 1; }
  updateConquestMapUI();
}

function saveProgress(clearedLvl) {
  if (isExhibitionActive || clearedLvl > 10) return;
  try {
    const s = localStorage.getItem('shogi_cleared_provinces');
    let stored = s !== null ? JSON.parse(s) : [];
    const mergedSet = new Set([...stored, ...clearedProvinces, clearedLvl]);
    clearedProvinces = Array.from(mergedSet).filter(lvl => lvl <= 10).sort((a,b) => a - b);
    localStorage.setItem('shogi_cleared_provinces', JSON.stringify(clearedProvinces));
  } catch (e) {}
  updateConquestMapUI();
}

window.addEventListener('storage', function(e) {
  if (e.key === 'shogi_cleared_provinces') {
    try {
      clearedProvinces = JSON.parse(e.newValue || '[]').filter(lvl => lvl <= 10);
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
  let s = (t || 'EMPTY') + ':';
  for(let r=0; r<9; r++) for(let c=0; c<9; c++) {
    const p = b[r][c]; if (p) s += `${r}${c}${p.code}${p.owner[0]}|`;
  }
  for (const ow of ['PLAYER','AI']) for (const k in h[ow]) {
    if (h[ow][k] > 0) s += `${ow[0]}${k}${h[ow][k]}`;
  }
  return s;
}

/* =========================================================
   【無矛盾千日手判定エンジン（一元化スナップショット直結）】
   ========================================================= */
function checkSennichite(targetNextTurn = turn) {
  if (historyStates.length < 4) return false;

  const currentSnap = historyStates[historyStates.length - 1];
  const curHash = currentSnap.hash;

  const matchingIndices = [];
  for (let i = 0; i < historyStates.length; i++) {
    if (historyStates[i].hash === curHash) matchingIndices.push(i);
  }

  if (matchingIndices.length >= 4) {
    const firstIdx = matchingIndices[0];
    const lastIdx = matchingIndices[matchingIndices.length - 1];

    let playerAlwaysChecking = true, aiAlwaysChecking = true, stepsInCycle = 0;
    for (let i = firstIdx; i < lastIdx; i++) {
      const snap = historyStates[i];
      if (snap) {
        stepsInCycle++;
        if (snap.turn === 'AI' && !snap.inCheck) playerAlwaysChecking = false;
        if (snap.turn === 'PLAYER' && !snap.inCheck) aiAlwaysChecking = false;
      }
    }

    isGameOver = true; playCheckSound();
    stopAutoReplay(); stopTurnTimer();
    if (isExhibitionActive) stopExhibitionTimer();
    updateTurnFocus(null);
    updateButtonStates();

    const exhModeTxt = (exhibitionSpeed === 'fast') ? '早指し戦' : '本将棋';
    const sData = isExhibitionActive ? getTargetAIData(exhibitionSenteTarget) : null;
    const gData = isExhibitionActive ? getTargetAIData(exhibitionGoteTarget) : null;

    if (stepsInCycle >= 6 && playerAlwaysChecking && !aiAlwaysChecking) {
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
    } else if (stepsInCycle >= 6 && aiAlwaysChecking && !playerAlwaysChecking) {
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
  historyStates = [];
  reviewingIndex = -1; lastMove = null;
  hintSourceCell = null; hintTargetCell = null; selectedPos = null; currentValidMoves = [];
  isAiThinking = false; isHintThinking = false; isPieceAnimating = false;
  tacticsCandidates = []; currentTacticIndex = 0;
  totalTimeSpentMs = { PLAYER: 0, AI: 0 };
  movesCountBySide = { PLAYER: 0, AI: 0 };
  exhibitionAchievedDepth = 1; exhibitionTargetDepth = 3;
  lastSettledMoveInfo = { PLAYER: null, AI: null };

  const pLastMove = document.getElementById('player-last-move-disp');
  const aiLastMove = document.getElementById('ai-last-move-disp');
  if (pLastMove) pLastMove.style.display = 'none';
  if (aiLastMove) aiLastMove.style.display = 'none';

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
  updateButtonStates();

  board[0] = [{code:'KY',owner:'AI'},{code:'KE',owner:'AI'},{code:'GI',owner:'AI'},{code:'KI',owner:'AI'},{code:'OU',owner:'AI'},{code:'KI',owner:'AI'},{code:'GI',owner:'AI'},{code:'KE',owner:'AI'},{code:'KY',owner:'AI'}];
  board[1][1] = {code:'HI',owner:'AI'}; board[1][7] = {code:'KA',owner:'AI'};
  for(let c=0; c<9; c++) board[2][c] = {code:'FU',owner:'AI'};
  
  for(let c=0; c<9; c++) board[6][c] = {code:'FU',owner:'PLAYER'};
  board[7][1] = {code:'KA',owner:'PLAYER'}; board[7][7] = {code:'HI',owner:'PLAYER'};
  board[8] = [{code:'KY',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'OU',owner:'PLAYER'},{code:'KI',owner:'PLAYER'},{code:'GI',owner:'PLAYER'},{code:'KE',owner:'PLAYER'},{code:'KY',owner:'PLAYER'}];

  // 第0手（初期配置スナップショット）の完全格納
  historyStates.push({
    step: 0,
    board: cloneBoardState(board),
    hands: JSON.parse(JSON.stringify(hands)),
    turn: turn || 'START',
    hash: getBoardHash(board, hands, turn || 'START'),
    inCheck: false,
    move: null,
    metrics: { timeSec: '0.0', depth: 0, targetDepth: 0 },
    evalScore: 0
  });

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
  const pBadge = document.getElementById('player-strategist-badge');
  const aiBadge = document.getElementById('ai-strategist-badge');

  if (isExhibitionActive) {
    const sData = getTargetAIData(exhibitionSenteTarget);
    const gData = getTargetAIData(exhibitionGoteTarget);

    if (pBadge) {
      if (sData.strategistShort) {
        pBadge.style.display = 'inline-block';
        pBadge.textContent = `軍師:${sData.strategistShort}`;
      } else {
        pBadge.style.display = 'none';
      }
    }
    if (aiBadge) {
      if (gData.strategistShort) {
        aiBadge.style.display = 'inline-block';
        aiBadge.textContent = `軍師:${gData.strategistShort}`;
      } else {
        aiBadge.style.display = 'none';
      }
    }
    return;
  }

  const p = PLAYER_WARLORDS[currentMyWarlordId];
  if (pBadge) {
    pBadge.style.display = 'inline-block';
    pBadge.textContent = `軍師:${p.strategistShort}`;
  }
  if (aiBadge) {
    aiBadge.style.display = 'none';
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
  const shouldShow = (isReplay || (isExhibitionActive && isGameOver));

  const repCtrlTablet = document.getElementById('replay-controls-tablet');
  const repCtrlMobile = document.getElementById('replay-controls-mobile');

  if (repCtrlTablet) repCtrlTablet.style.display = shouldShow ? 'flex' : 'none';
  if (repCtrlMobile) repCtrlMobile.style.display = shouldShow ? 'flex' : 'none';

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
  updateButtonStates();
}

/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   メインスクリプト（後編）
   【合戦絵巻一手再現 ＆ 持ち駒バッジ文字切れ根絶 ＆ 動的指南・覇者決戦】
   ========================================================= */

/* =========================================================
   【合戦鑑賞時：一手連動完全表示エンジン（臨場感再現）】
   ========================================================= */
function updateReplayStepDisplay(stepIdx) {
  if (stepIdx < 0 || stepIdx >= historyStates.length) return;
  reviewingIndex = stepIdx;
  const snap = historyStates[stepIdx];

  // 1. 盤面と手駒を完全同期
  board = cloneBoardState(snap.board);
  hands = JSON.parse(JSON.stringify(snap.hands));
  lastMove = snap.move || null;

  renderBoard();
  updateTroopsAndSituation();
  updateWarlordQuotes();
  updateReviewModeUI();

  // 2. 指し手バッジとタイマー表示の同期
  const pLast = document.getElementById('player-last-move-disp');
  const aiLast = document.getElementById('ai-last-move-disp');
  const pThink = document.getElementById('player-thinking-disp');
  const aiThink = document.getElementById('ai-thinking-disp');

  if (stepIdx === 0) {
    if (pLast) pLast.style.display = 'none';
    if (aiLast) aiLast.style.display = 'none';
    if (pThink) pThink.style.display = 'none';
    if (aiThink) aiThink.style.display = 'none';
    updateTurnFocus(null);
    clearWarlordResultPlaques();

    setOrderMessage({
      line1: `【合戦絵巻鑑賞】第0手 ── 初期陣形の構えに候`,
      line2: '［▶］または［▶ 自動］を押して初手より開戦されよ。'
    }, false, 'replay');
    return;
  }

  const m = snap.move;
  const isPlayerMove = (m.owner === 'PLAYER');
  const officialMoveTxt = formatOfficialKifuMove(m, stepIdx - 1);
  const metric = snap.metrics || { timeSec: '1.0', depth: 1, targetDepth: 1 };

  // 手番オーラをその手を指した武将側に点灯
  updateTurnFocus(m.owner);

  if (isPlayerMove) {
    if (pLast) { pLast.innerHTML = `${officialMoveTxt}`; pLast.style.display = 'inline-flex'; }
    if (aiLast) aiLast.style.display = 'none';
    if (pThink) {
      pThink.innerHTML = `✔ 決断 <b>${metric.timeSec}秒</b> (深さ ${metric.depth})`;
      pThink.className = 'warlord-thinking-inline timer-confirmed-box';
      pThink.style.display = 'inline-flex';
    }
    if (aiThink) aiThink.style.display = 'none';
  } else {
    if (aiLast) { aiLast.innerHTML = `${officialMoveTxt}`; aiLast.style.display = 'inline-flex'; }
    if (pLast) pLast.style.display = 'none';
    if (aiThink) {
      aiThink.innerHTML = `✔ 決断 <b>${metric.timeSec}秒</b> (深さ ${metric.depth})`;
      aiThink.className = 'warlord-thinking-inline timer-confirmed-box';
      aiThink.style.display = 'inline-flex';
    }
    if (pThink) pThink.style.display = 'none';
  }

  // 3. 軍令高札メッセージのリアルタイム同期
  const isEndStep = (stepIdx === historyStates.length - 1);
  const { pPct, aiPct } = calculateTroopsPercentages(board, hands);
  const pCur = Math.round(getPlayerMaxTroops() * (pPct / 100));
  const aiCur = Math.round(getAiMaxTroops() * (aiPct / 100));

  let actionNotice = '';
  if (m.promote) actionNotice = ' 🔥成駒覚醒！';
  else if (m.isCap) actionNotice = ' ⚔敵駒討捕！';

  if (isEndStep) {
    const isPlayerWinner = (pPct > aiPct);
    const winnerName = isPlayerWinner 
      ? (isExhibitionActive ? getTargetAIData(exhibitionSenteTarget).name : PLAYER_WARLORDS[currentMyWarlordId].name)
      : (isExhibitionActive ? getTargetAIData(exhibitionGoteTarget).name : WARLORDS_DATA[currentAiLevel].name);

    showWarlordResultPlaque(isPlayerWinner ? 'PLAYER' : 'AI');
    setOrderMessage({
      line1: `【終局結び】第${stepIdx}手にて <b>${winnerName}</b> の勝ち！`,
      line2: `最後まで一手乱れぬ名局にござる。［⏮］で初手へ、［⚔ 対局へ戻る］で平時へ。`
    }, false, 'settle');
  } else {
    clearWarlordResultPlaques();
    setOrderMessage({
      line1: `第${stepIdx}手 ── <b style="color:#ffd700;">${officialMoveTxt}</b>${actionNotice}`,
      line2: `⏱ 考慮 ${metric.timeSec}秒 ｜ ［残存兵力：我が軍 ${pCur.toLocaleString()} 兵 vs 敵軍 ${aiCur.toLocaleString()} 兵］`
    }, false, isPlayerMove ? 'player' : 'enemy');
  }
}

/* =========================================================
   【対局へ戻る：完全一元化復元システム】
   ========================================================= */
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

      board = cloneBoardState(savedActiveBattle.board);
      hands = JSON.parse(JSON.stringify(savedActiveBattle.hands));
      turn = savedActiveBattle.turn;
      battleStartTurn = savedActiveBattle.battleStartTurn || 'PLAYER';
      isGameOver = false;

      historyStates = JSON.parse(JSON.stringify(savedActiveBattle.historyStates));
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

      document.getElementById('player-name-disp').innerHTML = `${getKomaMarkHtml(true)}${getWarlordDisplayNameHtml(sData)}`;
      document.getElementById('player-clan-disp').textContent = sData.clan;
      document.getElementById('player-troops-disp').textContent = `${sTroops.toLocaleString()} / ${sTroops.toLocaleString()} 兵`;

      document.getElementById('ai-name-disp').innerHTML = `${getKomaMarkHtml(false)}${getWarlordDisplayNameHtml(gData)}`;
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
      updateButtonStates();

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

      historyStates = JSON.parse(JSON.stringify(savedActiveBattle.historyStates));
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
      updateButtonStates();

      triggerCutin('真剣勝負へ復帰！', true);
      startTurnTimer(turn, (turn === 'PLAYER' ? PLAYER_WARLORDS[currentMyWarlordId].name : WARLORDS_DATA[currentAiLevel].name));
    }

  } else {
    isPastReplayActive = false;
    isExhibitionActive = false;
    isGameOver = true;
    turn = null;
    reviewingIndex = -1;
    
    const enemyChangeBtn = document.getElementById('btn-enemy-change');
    const playerChangeBtn = document.getElementById('btn-player-change');
    if (enemyChangeBtn) enemyChangeBtn.style.display = 'inline-flex';
    if (playerChangeBtn) playerChangeBtn.style.display = 'inline-flex';

    setPlayerWarlord(currentMyWarlordId);
    selectConquestProvince(currentAiLevel);
    initBoardState();

    const sitBadge = document.getElementById('situation-badge');
    const sitText = document.getElementById('situation-text');
    if (sitBadge) {
      sitBadge.className = 'situation-badge badge-gokaku';
      sitBadge.textContent = '【互角】';
    }
    if (sitText) {
      sitText.textContent = '両軍ともに布陣堅牢、白兵戦の機を伺っております。';
    }

    const pMax = getPlayerMaxTroops();
    const aiMax = getAiMaxTroops();
    const pBar = document.getElementById('player-troops-bar');
    const aiBar = document.getElementById('ai-troops-bar');
    const pDisp = document.getElementById('player-troops-disp');
    const aiDisp = document.getElementById('ai-troops-disp');
    if (pBar) pBar.style.width = '100%';
    if (aiBar) aiBar.style.width = '100%';
    if (pDisp) pDisp.textContent = `${pMax.toLocaleString()} / ${pMax.toLocaleString()} 兵`;
    if (aiDisp) aiDisp.textContent = `${aiMax.toLocaleString()} / ${aiMax.toLocaleString()} 兵`;

    updateButtonStates();
    triggerCutin('初期布陣へと立ち返り候', false);
    setOrderMessage({
      line1: '合戦絵巻の鑑賞が結びとなり候。',
      line2: '「対局開始」を押して新たな合戦を始められよ！'
    }, false, 'player');
  }
}

/* =========================================================
   【軍師評定：深層分析テキスト生成エンジン】
   ========================================================= */
function generateStrategistEvaluationText() {
  let pData = null, eData = null;

  if (isExhibitionActive) {
    pData = getTargetAIData(exhibitionSenteTarget);
    eData = getTargetAIData(exhibitionGoteTarget);
  } else {
    pData = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];
    eData = WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1];
  }

  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;
  const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);
  const totalMoves = (reviewingIndex >= 0) ? reviewingIndex : getMoveCount();
  const diffPct = pPct - aiPct;

  if (isGameOver) {
    if (pPct > aiPct) {
      if (isExhibitionActive) {
        return `【御前総括】先手・${pData.name}の怒涛の攻勢が実を結び、後手陣の急所を的確に突いて本陣壊滅に至り候。見事なる棋芸にござる。`;
      } else {
        const moveList = getMoveObjectsList();
        const lastMoveObj = moveList[moveList.length - 1];
        const lastActionStr = lastMoveObj?.promote ? '成駒の電撃突破' : (lastMoveObj?.isCap ? '敵防壁の討捕' : '包囲網の狭撃');
        return `【軍師総括】我が軍の快勝！ ${lastActionStr}が見事に奏功し、${eData.name}の本陣を完全包囲して討ち取り候。天晴れなる采配にござる！`;
      }
    } else {
      if (isExhibitionActive) {
        return `【御前総括】後手・${eData.name}の鉄壁の受けと鋭利なる反撃が冴え渡り、先手陣を圧倒して勝勢を築き上げ候。`;
      } else {
        return `【軍師総括】無念の本陣陥落… ${eData.name}の執拗な攻めに対し、受けの手筋が一歩遅れを取り候。再起の陣形再建を期すべし。`;
      }
    }
  }

  if (totalMoves <= 12) {
    return `【序盤布陣評定】第${totalMoves}手。両軍陣容を整える刻。大駒（飛車・角行）の道を開きつつ、金銀による玉囲いの構築を急ぐべし。`;
  } else if (totalMoves <= 32) {
    if (diffPct >= 20) {
      return `【中盤戦況評定】我が軍の前線部隊が敵の防衛線を突破し、好拠点を確保。敵の浮き駒を狙い撃つ強襲の好機に候。`;
    } else if (diffPct <= -20) {
      return `【中盤戦況評定】敵軍の圧力が自陣へ迫りつつあり候。無理な攻めは自重し、まずは金銀の連結を強めて防壁を固められよ。`;
    } else {
      return `【中盤白兵評定】第${totalMoves}手。天下分水嶺の激突。歩の叩き合いと拠点争奪が勝敗の分かれ目となっております。`;
    }
  } else {
    if (isCheckState('PLAYER', curBoard)) {
      return `【終盤危急評定】我が本陣に王手の急襲！ 玉の逃げ道を確保し、持ち駒による合駒（あいごま）で急場を凌ぐべし！`;
    } else if (isCheckState('AI', curBoard)) {
      return `【終盤勝機評定】敵玉へ王手の一撃！ 逃げ道を桂馬や香車で確実に断ち、玉を包むように寄せ切るべし！`;
    } else if (diffPct >= 25) {
      return `【終盤寄せ評定】敵玉は包囲網の中にあり。駒の損得に囚われず、最短の手数で詰めろを連続して仕掛けるべし。`;
    } else if (diffPct <= -25) {
      return `【終盤防戦評定】敵の寄せ足が極めて速し。一手の遅れが命取りとなる局面、自玉の安全度を再点検されよ。`;
    } else {
      return `【終盤激戦評定】両軍玉将が接近する一手争いの死闘。自玉が詰まないか冷静に見極め、敵陣の喉首を狙われよ。`;
    }
  }
}

function openConquestMapModal() {
  playUiClickSound(); stopAutoReplay(); updateConquestMapUI();
  updateButtonStates();
  document.getElementById('conquest-modal').style.display = 'flex';
}
function closeConquestMapModal() {
  playUiClickSound();
  document.getElementById('conquest-modal').style.display = 'none';
}

function confirmConquestTarget() {
  if (!isGameOver && !isReviewingPast()) return;
  playUiClickSound();
  selectConquestProvince(currentAiLevel);
  closeConquestMapModal();
}

function selectConquestProvince(lvl) {
  if (!isGameOver && !isReviewingPast()) return;
  const safeLvl = Math.min(10, lvl);
  const clearedCount = clearedProvinces.length;
  const maxAvailableLevel = clearedCount > 0 ? Math.min(10, Math.max(...clearedProvinces) + 1) : 1;
  
  if (!clearedProvinces.includes(safeLvl) && safeLvl > maxAvailableLevel) return;

  currentAiLevel = safeLvl;
  const w = WARLORDS_DATA[safeLvl];
  const p = PLAYER_WARLORDS[currentMyWarlordId];

  initBoardState();

  const pMax = getPlayerMaxTroops();
  document.getElementById('ai-name-disp').textContent = w.name;
  document.getElementById('ai-clan-disp').textContent = `${w.clan} (Lv.${safeLvl})`;
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
  
  const sitBadge = document.getElementById('situation-badge');
  const sitText = document.getElementById('situation-text');
  if (sitBadge) {
    sitBadge.className = 'situation-badge badge-gokaku';
    sitBadge.textContent = '【互角】';
  }
  if (sitText) {
    sitText.textContent = '両軍ともに布陣堅牢、白兵戦の機を伺っております。';
  }

  updateTurnLabels();
  updateWarlordBGM(safeLvl);
  updateConquestMapUI();
  updateButtonStates();

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

function updateConquestMapUI() {
  const clearedCount = clearedProvinces.length;
  const pct = Math.round((clearedCount / 10) * 100);

  const pctDisp = document.getElementById('conquest-pct-disp');
  const pctBar = document.getElementById('conquest-pct-bar');
  const clrCount = document.getElementById('conquest-cleared-count');
  if (pctDisp) pctDisp.textContent = `${pct}%`;
  if (pctBar) pctBar.style.width = `${pct}%`;
  if (clrCount) clrCount.textContent = `${clearedCount} / 10 将平定`;

  const totalTroops = getPlayerMaxTroops();
  const baseTroops = PLAYER_WARLORDS[currentMyWarlordId]?.baseTroops || 3000;
  const bonusTroops = totalTroops - baseTroops;
  const growthDisp = document.getElementById('conquest-total-troops-disp');
  const bonusDisp = document.getElementById('conquest-troops-bonus-disp');
  if (growthDisp) growthDisp.textContent = `${totalTroops.toLocaleString()} 兵`;
  if (bonusDisp) bonusDisp.textContent = `（平定ボーナス：+${bonusTroops.toLocaleString()} 兵）`;

  const maxAvailableLevel = clearedCount > 0 ? Math.min(10, Math.max(...clearedProvinces) + 1) : 1;

  for(let i=1; i<=10; i++) {
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
  for(let i=1; i<=10; i++) {
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
  updateButtonStates();
  document.getElementById('player-warlord-modal').style.display = 'flex';
}

function closePlayerWarlordModal() {
  playUiClickSound();
  document.getElementById('player-warlord-modal').style.display = 'none';
}
function confirmPlayerWarlord() {
  if (!isGameOver && !isReviewingPast()) return;
  playUiClickSound(); setPlayerWarlord(currentMyWarlordId); closePlayerWarlordModal();
}

function setPlayerWarlord(k) {
  if (!isGameOver && !isReviewingPast()) return;
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
  updateButtonStates();
  selectConquestProvince(currentAiLevel);
}

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
  const moveList = getMoveObjectsList();
  const metricList = getMoveMetricsList();

  moveList.forEach((m, i) => {
    const isSenteMove = (i % 2 === 0);
    const sideKey = isSenteMove ? 'SENTE' : 'GOTE';
    const metric = metricList[i] || { timeSec: '1', depth: 1 };
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
    const totalMoves = getMoveCount();
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
  const moveCount = getMoveCount();
  if (moveCount < 5) return;
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

  const effectiveResult = (resultType === 'exhibition' && resultLabel?.includes('千日手')) ? 'draw' : resultType;

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
    result: effectiveResult,
    resultLabel: resultLabel,
    movesCount: moveCount,
    sente: (battleStartTurn === 'PLAYER') ? '先手' : '後手',
    battleStartTurn: battleStartTurn,
    hintUsed: hintUsedCount,
    awakenedHintUsed: awakenedHintCount,
    isExhibition: !!isExhibitionActive,
    exhibitionSpeed: isExhibitionActive ? exhibitionSpeed : null,
    timeStats: { playerTotalSec: pTotalSec, playerAvgSec: pAvgSec, aiTotalSec: aiTotalSec, aiAvgSec: aiAvgSec },
    historyStates: JSON.parse(JSON.stringify(historyStates)),
    moveObjectsHistory: JSON.parse(JSON.stringify(getMoveObjectsList())),
    moveMetricsHistory: JSON.parse(JSON.stringify(getMoveMetricsList())),
    exhibitionSenteTarget: isExhibitionActive ? exhibitionSenteTarget : null,
    exhibitionGoteTarget: isExhibitionActive ? exhibitionGoteTarget : null
  };

  try {
    const storageKey = isExhibitionActive ? 'shogi_battle_records_exhibition' : 'shogi_battle_records_player';
    let records = JSON.parse(localStorage.getItem(storageKey) || '[]');
    records.unshift(record);
    if (records.length > 50) records = records.slice(0, 50);
    localStorage.setItem(storageKey, JSON.stringify(records));
  } catch(e) {}
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
  const enemyLabel = document.getElementById('filter-enemy-label');

  if (tab === 'player') {
    if (enemyLabel) enemyLabel.textContent = '敵将:';
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
      `;
    }
  } else {
    if (enemyLabel) enemyLabel.textContent = '方式:';
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
        <option value="nanban">蒲生氏郷 [MicroMax系]</option>
        <option value="kenshi">柳生石舟斎 [Sunfish系]</option>
        <option value="inja">黒田如水 [Bonanza系]</option>
        <option value="sokei">大橋宗桂 [Apery系]</option>
        <option value="sanada">真田幸村 (軍師AI)</option>
        <option value="keiji">前田慶次 (軍師AI)</option>
        <option value="masamune">伊達政宗 (軍師AI)</option>
        <option value="kanetsugu">直江兼続 (軍師AI)</option>
        <option value="tadakatsu">本多忠勝 (軍師AI)</option>
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

    const isSenteWin = (r.sente === '先手');
    const senteIconHtml = getKomaMarkHtml(isSenteWin);

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
          <span class="clash-tag-sente">${senteIconHtml}${r.sente}</span>
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

/* =========================================================
   【過去合戦再現エントリー】
   ========================================================= */
function replayFromHistory(recordId, storageKey) {
  let records = [];
  try { records = JSON.parse(localStorage.getItem(storageKey) || '[]'); } catch(e) { records = []; }
  
  const rec = records.find(r => r.id === recordId);
  if (!rec) return;

  if (!isGameOver && getMoveCount() > 0) {
    savedActiveBattle = {
      isExhibitionActive: !!isExhibitionActive,
      exhibitionSenteTarget: isExhibitionActive ? exhibitionSenteTarget : null,
      exhibitionGoteTarget: isExhibitionActive ? exhibitionGoteTarget : null,
      exhibitionSpeed: isExhibitionActive ? exhibitionSpeed : 'normal',
      exhibitionAchievedDepth, exhibitionTargetDepth, exhibitionTotalNodes,
      currentMyWarlordId, currentAiLevel,
      board: cloneBoardState(board),
      hands: JSON.parse(JSON.stringify(hands)),
      turn, battleStartTurn,
      historyStates: JSON.parse(JSON.stringify(historyStates)),
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
    renderMainPortraits();
  } else {
    currentMyWarlordId = rec.playerWarlordId;
    currentAiLevel = Math.min(10, rec.enemyLevel);
    setPlayerWarlord(currentMyWarlordId);
    selectConquestProvince(currentAiLevel);
  }

  if (rec.historyStates && rec.historyStates.length > 0) {
    historyStates = JSON.parse(JSON.stringify(rec.historyStates));
  } else {
    const moves = rec.moveObjectsHistory || [];
    const metrics = rec.moveMetricsHistory || [];
    historyStates = rebuildHistoryStatesFromMoves(moves, metrics, battleStartTurn);
  }

  isGameOver = true;
  updateTurnLabels();

  updateReplayStepDisplay(0);
  updateButtonStates();
  
  const pauseNotice = savedActiveBattle ? '（※進行中の対戦は一時中断中。［⚔ 対局へ戻る］でいつでも再開できます）' : '';
  setOrderMessage({
    line1: `【${rec.playerWarlordName} vs ${rec.enemyName}の合戦を再現中】`,
    line2: `［▶ 自動］で初手から開戦。［◀］［▶］で一手ずつ鑑賞可能。${pauseNotice}`
  }, false, 'replay');
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

/* =========================================================
   盤面描画・駒操作レンダラー
   ========================================================= */
function getPieceDisplayName(code) {
  const name = PIECES[code] || '';
  if (name.length === 2) {
    return `<span class="piece-char-top">${name[0]}</span><span class="piece-char-bottom">${name[1]}</span>`;
  }
  return name;
}

function renderBoard() {
  const boardEl = document.getElementById('board');
  if (!boardEl) return;

  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;

  const existingCells = boardEl.querySelectorAll('.cell');
  if (existingCells.length === 81) {
    let idx = 0;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = existingCells[idx++];
        cell.className = 'cell';
        cell.innerHTML = '';
        cell.onclick = () => onCellClick(r, c);

        const piece = curBoard[r][c];
        if (piece) {
          const pEl = document.createElement('div');
          const isPromoted = PROMOTED_PIECES.includes(piece.code);
          pEl.className = `piece ${piece.owner.toLowerCase()} ${isPromoted ? 'promoted' : ''}`;
          pEl.innerHTML = getPieceDisplayName(piece.code);
          cell.appendChild(pEl);
        }

        if (selectedPos && selectedPos.r === r && selectedPos.c === c) cell.classList.add('selected');
        if (lastMove && lastMove.to && lastMove.to.r === r && lastMove.to.c === c) cell.classList.add('last-move-to');

        if (currentValidMoves.some(m => m.r === r && m.c === c)) {
          if (curBoard[r][c]) cell.classList.add('target-capture');
          else cell.classList.add('target-move');
        }

        if (hintSourceCell && hintSourceCell.r === r && hintSourceCell.c === c) cell.classList.add('hint-source');
        if (hintTargetCell && hintTargetCell.r === r && hintTargetCell.c === c) cell.classList.add('hint-target');

        if (piece && piece.code === 'OU') {
          if (isCheckState(piece.owner, curBoard)) cell.classList.add('in-check-king');
        }
      }
    }
  } else {
    boardEl.innerHTML = `
      <div class="board-star" id="star-1"></div>
      <div class="board-star" id="star-2"></div>
      <div class="board-star" id="star-3"></div>
      <div class="board-star" id="star-4"></div>
    `;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.onclick = () => onCellClick(r, c);

        const piece = curBoard[r][c];
        if (piece) {
          const pEl = document.createElement('div');
          const isPromoted = PROMOTED_PIECES.includes(piece.code);
          pEl.className = `piece ${piece.owner.toLowerCase()} ${isPromoted ? 'promoted' : ''}`;
          pEl.innerHTML = getPieceDisplayName(piece.code);
          cell.appendChild(pEl);
        }
        boardEl.appendChild(cell);
      }
    }
  }

  renderHands(curHands);
}

/* =========================================================
   【持ち駒レンダラー：五角形シェイプと枚数バッジを完全分離】
   （clip-pathによる文字欠けを根本根絶する新工芸設計）
   ========================================================= */
function renderHands(curHands = hands) {
  const pHandBox = document.getElementById('player-hand');
  const aiHandBox = document.getElementById('ai-hand');
  if (pHandBox) pHandBox.innerHTML = '';
  if (aiHandBox) aiHandBox.innerHTML = '';

  const pieceOrder = ['HI', 'KA', 'KI', 'GI', 'KE', 'KY', 'FU'];
  const hintDropCode = (tacticsCandidates[currentTacticIndex]?.move?.type === 'drop') 
    ? tacticsCandidates[currentTacticIndex].move.code : null;

  pieceOrder.forEach(code => {
    // 自軍（下陣）持ち駒
    const pCount = curHands.PLAYER[code] || 0;
    if (pCount > 0 && pHandBox) {
      const pieceEl = document.createElement('div');
      const isHintPiece = (hintDropCode === code);
      const isSelected = (selectedPos?.type === 'hand' && selectedPos.code === code);
      
      pieceEl.className = `hand-piece player ${isSelected ? 'selected' : ''} ${isHintPiece ? 'hint-hand-pulse' : ''}`;
      
      // 内部に独立した五角形背景シェイプと枚数バッジを配置
      let countHtml = (pCount > 1) ? `<span class="hand-piece-count">${pCount}</span>` : '';
      pieceEl.innerHTML = `
        <div class="hand-piece-shape">${getPieceDisplayName(code)}</div>
        ${countHtml}
      `;
      
      pieceEl.onclick = (e) => { e.stopPropagation(); onHandPieceClick('PLAYER', code); };
      pHandBox.appendChild(pieceEl);
    }

    // 敵軍（上陣）持ち駒
    const aiCount = curHands.AI[code] || 0;
    if (aiCount > 0 && aiHandBox) {
      const pieceEl = document.createElement('div');
      pieceEl.className = 'hand-piece ai';
      
      let countHtml = (aiCount > 1) ? `<span class="hand-piece-count">${aiCount}</span>` : '';
      pieceEl.innerHTML = `
        <div class="hand-piece-shape">${getPieceDisplayName(code)}</div>
        ${countHtml}
      `;
      
      aiHandBox.appendChild(pieceEl);
    }
  });
}

function onCellClick(r, c) {
  if (isGameOver || isReviewingPast() || isAiThinking || isExhibitionActive || isPieceAnimating) return;
  if (turn !== 'PLAYER') return;

  clearTacticsHint();

  if (selectedPos) {
    const targetMove = currentValidMoves.find(m => m.r === r && m.c === c);
    if (targetMove) {
      executePlayerMove(targetMove);
      return;
    }
  }

  const piece = board[r][c];
  if (piece && piece.owner === 'PLAYER') {
    playUiClickSound();
    selectedPos = { type: 'board', r, c, piece };
    const allLegals = getLegalMoves('PLAYER');
    currentValidMoves = allLegals
      .filter(m => m.type === 'move' && m.from.r === r && m.from.c === c)
      .map(m => m.to);
    renderBoard();
  } else {
    selectedPos = null;
    currentValidMoves = [];
    renderBoard();
  }
}

function onHandPieceClick(owner, code) {
  if (isGameOver || isReviewingPast() || isAiThinking || isExhibitionActive || isPieceAnimating) return;
  if (turn !== owner || owner !== 'PLAYER') return;

  clearTacticsHint();
  playUiClickSound();

  if (selectedPos && selectedPos.type === 'hand' && selectedPos.code === code) {
    selectedPos = null;
    currentValidMoves = [];
  } else {
    selectedPos = { type: 'hand', code };
    const allLegals = getLegalMoves('PLAYER');
    currentValidMoves = allLegals
      .filter(m => m.type === 'drop' && m.code === code)
      .map(m => m.to);
  }
  renderBoard();
}

function executePlayerMove(targetCoord) {
  if (!selectedPos) return;

  if (selectedPos.type === 'board') {
    const from = { r: selectedPos.r, c: selectedPos.c };
    const piece = board[from.r][from.c];
    const canPromote = PROMOTE_MAP[piece.code] && (from.r <= 2 || targetCoord.r <= 2);
    const mustPromote = (piece.code === 'FU' || piece.code === 'KY') && targetCoord.r === 0 ||
                        (piece.code === 'KE' && targetCoord.r <= 1);

    if (mustPromote) {
      applyMove({ type: 'move', code: piece.code, from, to: targetCoord, owner: 'PLAYER', promote: true }, { depth: 1, targetDepth: 1 });
    } else if (canPromote) {
      pendingMove = { type: 'move', code: piece.code, from, to: targetCoord, owner: 'PLAYER' };
      document.getElementById('promote-modal').style.display = 'flex';
    } else {
      applyMove({ type: 'move', code: piece.code, from, to: targetCoord, owner: 'PLAYER', promote: false }, { depth: 1, targetDepth: 1 });
    }
  } else if (selectedPos.type === 'hand') {
    applyMove({ type: 'drop', code: selectedPos.code, to: targetCoord, owner: 'PLAYER' }, { depth: 1, targetDepth: 1 });
  }

  selectedPos = null;
  currentValidMoves = [];
}

document.getElementById('btn-promote-yes').onclick = () => {
  playUiClickSound();
  document.getElementById('promote-modal').style.display = 'none';
  if (pendingMove) {
    pendingMove.promote = true;
    applyMove(pendingMove, { depth: 1, targetDepth: 1 });
    pendingMove = null;
  }
};

document.getElementById('btn-promote-no').onclick = () => {
  playUiClickSound();
  document.getElementById('promote-modal').style.display = 'none';
  if (pendingMove) {
    pendingMove.promote = false;
    applyMove(pendingMove, { depth: 1, targetDepth: 1 });
    pendingMove = null;
  }
};

/* =========================================================
   【指し手適用エンジン（単一スナップショット完全追加）】
   ========================================================= */
function applyMove(moveObj, moveMetrics = {}) {
  const spentSec = recordTurnTime(moveObj.owner, moveMetrics.timeSpentMs);

  const appliedDepth = moveMetrics.depth || 1;
  const appliedTargetDepth = moveMetrics.targetDepth || appliedDepth;

  lastSettledMoveInfo[moveObj.owner] = {
    timeSec: spentSec,
    depth: appliedDepth,
    targetDepth: appliedTargetDepth
  };

  const isPlayerMove = (moveObj.owner === 'PLAYER');
  const lastMoveDispId = isPlayerMove ? 'player-last-move-disp' : 'ai-last-move-disp';
  const lastMoveEl = document.getElementById(lastMoveDispId);
  if (lastMoveEl) {
    const formattedKifu = formatOfficialKifuMove(moveObj, getMoveCount());
    lastMoveEl.innerHTML = `${formattedKifu}`;
    lastMoveEl.style.display = 'inline-flex';
  }

  makeMove(moveObj);
  lastMove = moveObj;

  const nextTurn = (moveObj.owner === 'PLAYER') ? 'AI' : 'PLAYER';
  turn = nextTurn;

  const { pPct, aiPct } = calculateTroopsPercentages(board, hands);
  const evalScore = pPct - aiPct;
  const hash = getBoardHash(board, hands, nextTurn);
  const inCheck = isCheckState(nextTurn, board);

  const newSnapshot = {
    step: historyStates.length,
    board: cloneBoardState(board),
    hands: JSON.parse(JSON.stringify(hands)),
    turn: nextTurn,
    hash: hash,
    inCheck: inCheck,
    move: moveObj,
    metrics: { timeSec: spentSec, depth: appliedDepth, targetDepth: appliedTargetDepth },
    evalScore: evalScore
  };
  historyStates.push(newSnapshot);
  reviewingIndex = historyStates.length - 1;

  playPieceSound();

  if (moveObj.promote) triggerCutin('成駒覚醒！', false);
  if (inCheck) {
    playCheckSound();
    triggerCutin('王手！', false);
  }

  renderBoard();
  updateTroopsAndSituation();
  updateWarlordQuotes();

  if (checkSennichite(nextTurn)) return;

  const nextLegals = getLegalMoves(nextTurn);
  if (nextLegals.length === 0) {
    handleCheckmate(moveObj.owner);
    return;
  }

  updateButtonStates();

  if (isExhibitionActive) {
    scheduleNextExhibitionTurn();
  } else {
    if (turn === 'AI') {
      const eName = WARLORDS_DATA[currentAiLevel].name;
      startTurnTimer('AI', eName);
      scheduleAiMove();
    } else {
      const pName = PLAYER_WARLORDS[currentMyWarlordId].name;
      startTurnTimer('PLAYER', pName);
    }
  }
}

function handleCheckmate(winnerOwner) {
  isGameOver = true;
  stopTurnTimer(); stopAutoReplay(); stopExhibitionTimer();
  updateTurnFocus(null);
  updateButtonStates();

  const isPlayerWin = (winnerOwner === 'PLAYER');
  showWarlordResultPlaque(winnerOwner);

  if (isExhibitionActive) {
    const sData = getTargetAIData(exhibitionSenteTarget);
    const gData = getTargetAIData(exhibitionGoteTarget);
    const winnerData = isPlayerWin ? sData : gData;
    const modeTxt = (exhibitionSpeed === 'fast') ? '早指し戦' : '本将棋';

    triggerCutin(`【勝者】${winnerData.name}！ 御前試合決着！`, true);
    setOrderMessage({
      line1: `【御前試合 決着】${winnerData.name}が見事に本陣を討ち破りました！`,
      line2: '「合戦絵巻」にて名勝負の全棋譜と陣地支配グラフを鑑賞できます。'
    }, false, 'settle');

    saveBattleRecord('exhibition', `御前${modeTxt}：${winnerData.name}勝`);
  } else {
    if (isPlayerWin) {
      playVictorySound();
      launchFireworksCelebration();
      triggerCutin('大勝利！ 敵本陣を完全平定！', true);
      saveProgress(currentAiLevel);
      saveBattleRecord('win', '大勝利');
      setOrderMessage({
        line1: `【大勝利】${WARLORDS_DATA[currentAiLevel].name}を討ち取り候！`,
        line2: '天下平定の栄光が刻まれました！ 「天下絵巻」より次の国へ進軍されよ。'
      }, false, 'settle');
    } else {
      playCheckSound();
      triggerCutin('本陣陥落… 敗戦に候！', true);
      saveBattleRecord('lose', '本陣陥落');
      setOrderMessage({
        line1: `【本陣陥落】${WARLORDS_DATA[currentAiLevel].name}の軍略に屈し申した…`,
        line2: '陣形を立て直し、「対局開始」にて雪辱戦を挑まれよ！'
      }, false, 'alert');
    }
  }

  updateReviewModeUI();
}

function updateTroopsAndSituation() {
  const curBoard = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].board : board;
  const curHands = (reviewingIndex >= 0 && historyStates[reviewingIndex]) ? historyStates[reviewingIndex].hands : hands;

  const { pPct, aiPct } = calculateTroopsPercentages(curBoard, curHands);
  const pMax = getPlayerMaxTroops();
  const aiMax = getAiMaxTroops();

  const pCur = Math.round(pMax * (pPct / 100));
  const aiCur = Math.round(aiMax * (aiPct / 100));

  const pBar = document.getElementById('player-troops-bar');
  const aiBar = document.getElementById('ai-troops-bar');
  const pDisp = document.getElementById('player-troops-disp');
  const aiDisp = document.getElementById('ai-troops-disp');

  if (pBar) pBar.style.width = `${pPct}%`;
  if (aiBar) aiBar.style.width = `${aiPct}%`;
  if (pDisp) pDisp.textContent = `${pCur.toLocaleString()} / ${pMax.toLocaleString()} 兵`;
  if (aiDisp) aiDisp.textContent = `${aiCur.toLocaleString()} / ${aiMax.toLocaleString()} 兵`;

  const sitBadge = document.getElementById('situation-badge');
  const sitText = document.getElementById('situation-text');
  const diff = pPct - aiPct;

  if (sitBadge && sitText && !isReviewingPast()) {
    if (diff >= 28) {
      sitBadge.className = 'situation-badge badge-player-win';
      sitBadge.textContent = '【勝勢】';
      sitText.textContent = '我が軍怒涛の進撃！ 敵本陣を包囲し追い詰めております！';
    } else if (diff >= 12) {
      sitBadge.className = 'situation-badge badge-player-adv';
      sitBadge.textContent = '【優勢】';
      sitText.textContent = '我が軍有利！ 前線を押し上げ敵の隙を突いております。';
    } else if (diff <= -28) {
      sitBadge.className = 'situation-badge badge-enemy-win';
      sitBadge.textContent = '【敗勢】';
      sitText.textContent = '本陣危急！ 敵の大軍が包囲網を狭めてきております！';
    } else if (diff <= -12) {
      sitBadge.className = 'situation-badge badge-enemy-adv';
      sitBadge.textContent = '【劣勢】';
      sitText.textContent = '敵軍の圧迫激し！ 守りを固め反撃の機を待つべし。';
    } else {
      sitBadge.className = 'situation-badge badge-gokaku';
      sitBadge.textContent = '【互角】';
      sitText.textContent = '両軍ともに布陣堅牢、白兵戦の機を伺っております。';
    }
  }
}

function setOrderMessage(msg, isInteractive = false, badgeType = 'player') {
  const line1 = document.getElementById('order-line-primary');
  const line2 = document.getElementById('order-line-sub');
  const banner = document.getElementById('order-message-banner');
  const badge = document.getElementById('order-tag-badge');
  const row1 = document.getElementById('tag-badge-row1');
  const row2 = document.getElementById('tag-badge-row2');

  const faceBox = document.getElementById('order-strategist-face');
  const imgBox = document.getElementById('strategist-face-img-box');
  const nameTag = document.getElementById('strategist-face-name-tag');

  if (typeof msg === 'string') {
    if (line1) line1.innerHTML = msg;
    if (line2) line2.innerHTML = '';
  } else if (msg) {
    if (line1) line1.innerHTML = msg.line1 || '';
    if (line2) line2.innerHTML = msg.line2 || '';
  }

  if (banner) banner.className = `order-message-banner ${isInteractive ? 'hint-focus' : ''}`;
  if (badge) {
    badge.className = `order-tag-badge badge-tag-${badgeType}`;
    if (badgeType === 'hint' || badgeType === 'hint-awakened') {
      badge.style.display = 'none';
      if (faceBox) {
        faceBox.style.display = 'flex';
        const p = PLAYER_WARLORDS[currentMyWarlordId];
        if (imgBox) imgBox.innerHTML = getStrategistFaceHtml(p.strategistImgId);
        if (nameTag) nameTag.textContent = p.strategistShort;
      }
    } else if (badgeType === 'exhibition') {
      badge.style.display = 'none';
      if (faceBox) {
        faceBox.style.display = 'flex';
        if (imgBox) imgBox.innerHTML = getGunbaiIconHtml();
        if (nameTag) nameTag.textContent = '公儀';
      }
    } else {
      if (faceBox) faceBox.style.display = 'none';
      badge.style.display = 'flex';
      if (badgeType === 'player') { row1.textContent = '自軍'; row2.textContent = '手番'; }
      else if (badgeType === 'enemy') { row1.textContent = '敵将'; row2.textContent = '思案'; }
      else if (badgeType === 'alert') { row1.textContent = '危急'; row2.textContent = '伝令'; }
      else if (badgeType === 'settle') { row1.textContent = '合戦'; row2.textContent = '決着'; }
      else if (badgeType === 'replay') { row1.textContent = '合戦'; row2.textContent = '再現'; }
      else { row1.textContent = '伝令'; row2.textContent = '高札'; }
    }
  }
}

function clearTacticsHint() {
  hintSourceCell = null;
  hintTargetCell = null;
  tacticsCandidates = [];
  const altBtn = document.getElementById('btn-alt-tactic');
  if (altBtn) altBtn.style.display = 'none';
  renderBoard();
}

/* =========================================================
   対局開始・振り駒の儀（多重起動防止ガード付き）
   ========================================================= */
function openFurigomaModal() {
  if (!isGameOver && !isReviewingPast()) return;
  if (isFurigomaRunning) return;
  isFurigomaRunning = true;
  updateButtonStates();

  initAudio(); playUiClickSound();
  const modal = document.getElementById('furigoma-modal');
  const row = document.getElementById('furigoma-pieces-row');
  const resText = document.getElementById('furigoma-result-text');
  if (!modal || !row || !resText) {
    isFurigomaRunning = false;
    return;
  }

  row.innerHTML = '';
  resText.textContent = '天運を見届けております…';
  modal.style.display = 'flex';

  for (let i = 0; i < 5; i++) {
    const pBox = document.createElement('div');
    pBox.className = 'furigoma-piece-box';
    pBox.innerHTML = `
      <div class="furigoma-card spinning">
        <div class="furigoma-face furigoma-front">歩</div>
        <div class="furigoma-face furigoma-back">と</div>
      </div>
    `;
    row.appendChild(pBox);
  }

  setTimeout(() => executeFurigoma(), 1200);
}

function executeFurigoma() {
  const cards = document.querySelectorAll('.furigoma-card');
  let fuCount = 0;

  cards.forEach(card => {
    const isFu = Math.random() < 0.5;
    card.className = `furigoma-card ${isFu ? 'settled-fu' : 'settled-to'}`;
    if (isFu) fuCount++;
  });

  const resText = document.getElementById('furigoma-result-text');
  const isPlayerSente = (fuCount >= 3);
  battleStartTurn = isPlayerSente ? 'PLAYER' : 'AI';

  const pName = PLAYER_WARLORDS[currentMyWarlordId].name;
  const eName = WARLORDS_DATA[currentAiLevel].name;

  playPieceSound();

  if (resText) {
    resText.innerHTML = `歩 ${fuCount}枚 ── <b style="color:#ffd700;">【${isPlayerSente ? pName : eName}】の先手！</b>`;
  }

  setTimeout(() => {
    const modal = document.getElementById('furigoma-modal');
    if (modal) modal.style.display = 'none';
    isFurigomaRunning = false;
    startBattleAfterFurigoma(battleStartTurn);
  }, 1600);
}

function startBattleAfterFurigoma(firstTurn) {
  initBoardState();
  isGameOver = false;
  turn = firstTurn;

  updateTurnLabels();
  updateTurnFocus(firstTurn);
  updateButtonStates();

  const isPlayerSente = (firstTurn === 'PLAYER');
  const p = PLAYER_WARLORDS[currentMyWarlordId];
  const w = WARLORDS_DATA[currentAiLevel];

  triggerCutin(`合戦開始！ 先手：${isPlayerSente ? p.name : w.name}`, true);

  if (isPlayerSente) {
    startTurnTimer('PLAYER', p.name);
    setOrderMessage({
      line1: `第1手 ── ${getKomaMarkHtml(true)} <b style="color:#ffd700;">${p.name}公の先手番に候！</b>`,
      line2: '歩を突いて飛車・角の道を開き、堂々たる布陣を敷かれよ！'
    }, true, 'player');
  } else {
    startTurnTimer('AI', w.name);
    setOrderMessage({
      line1: `第1手 ── ${getKomaMarkHtml(false)} <b style="color:#ffe6aa;">敵将・${w.name}の先手番！</b>`,
      line2: '敵の初手を見極め、堅固な受けの構えを整えられよ。'
    }, false, 'enemy');
    scheduleAiMove();
  }
}

/* =========================================================
   AI思考エンジン連携制御
   ========================================================= */
let aiWorker = null;
function initAiWorker() {
  if (aiWorker) {
    try { aiWorker.terminate(); } catch(e){}
  }
  const blob = new Blob([workerScriptContent], { type: 'application/javascript' });
  aiWorker = new Worker(URL.createObjectURL(blob));
  aiWorker.onmessage = onWorkerMessage;
}
initAiWorker();

function scheduleAiMove() {
  if (isGameOver || turn !== 'AI') return;
  isAiThinking = true;
  updateButtonStates();

  const payload = {
    board, hands, level: currentAiLevel,
    isHintRequest: false, isAwakened: false,
    history: getMoveObjectsList(),
    hashHistory: getHashHistoryList(),
    isExhibition: false, targetOwner: 'AI', timeLimit: 8500
  };

  aiWorker.postMessage(payload);
}

function onWorkerMessage(e) {
  const data = e.data;
  if (data.type === 'done') {
    if (isGameOver) { isAiThinking = false; return; }

    const now = Date.now();
    const elapsed = now - turnStartTime;
    const minWait = 1200;
    const remainWait = Math.max(0, minWait - elapsed);

    setTimeout(() => {
      isAiThinking = false;
      if (isGameOver) return;

      if (data.bestMove) {
        applyMove(data.bestMove, { depth: data.depth, targetDepth: data.targetDepth, timeSpentMs: Date.now() - turnStartTime });
      } else {
        handleCheckmate((turn === 'PLAYER') ? 'AI' : 'PLAYER');
      }
    }, remainWait);

  } else if (data.type === 'hintDone') {
    isHintThinking = false;
    handleMasterHintDone(data);
  }
}

/* =========================================================
   軍師進言エンジン（【☗７六歩】1行目最強調デザイン完全対応）
   ========================================================= */
function showMasterHint() {
  if (isGameOver || isReviewingPast() || isAiThinking || isHintThinking || turn !== 'PLAYER') return;
  initAudio(); playUiClickSound();
  isHintThinking = true;

  hintUsedCount++;
  triggerCutin('軍師進言！ 策を練っております…', false);

  const payload = {
    board, hands, level: currentAiLevel,
    isHintRequest: true, isAwakened: false,
    history: getMoveObjectsList(),
    hashHistory: getHashHistoryList(),
    isExhibition: false, targetOwner: 'PLAYER', timeLimit: 8500
  };

  aiWorker.postMessage(payload);
}

function handleMasterHintDone(data) {
  if (!data.allScoredMoves || data.allScoredMoves.length === 0) {
    setOrderMessage('進言できる妙手が見当たらぬご様子… 玉将の逃げ道を確保されよ！', false, 'alert');
    return;
  }

  tacticsCandidates = data.allScoredMoves.slice(0, 3);
  currentTacticIndex = 0;
  displayTacticsHint(0);
}

function displayTacticsHint(idx) {
  const candidate = tacticsCandidates[idx];
  if (!candidate) return;
  const m = candidate.move;

  hintSourceCell = (m.type === 'move') ? m.from : null;
  hintTargetCell = m.to;

  const tacticTitles = ['【王道の進軍】', '【強襲の急所】', '【堅陣の受け】'];
  const p = PLAYER_WARLORDS[currentMyWarlordId];
  const officialTxt = formatOfficialKifuMove(m, getMoveCount());

  const altBtn = document.getElementById('btn-alt-tactic');
  if (altBtn) altBtn.style.display = (tacticsCandidates.length > 1) ? 'inline-block' : 'none';

  let tacticReason = '盤上の光るマスへ進められよ。敵陣の隙を突く好手なり。';
  if (m.promote) tacticReason = '敵陣突破！ 龍や馬へと成り込み、圧倒的優勢を築かれよ。';
  else if (m.isCap) tacticReason = '敵の防壁を討ち取り、戦局の主導権を握る一撃に候。';
  else if (m.type === 'drop') tacticReason = '持ち駒を急所へ打ち込み、包囲網を狭められよ。';

  setOrderMessage({
    line1: `${p.strategistShort}進言：<b style="color:#ffd700;">${tacticTitles[idx] || '【進言の一手】'}</b> <span class="tactics-highlight-move-box">👉 ${officialTxt}</span>`,
    line2: `「${tacticReason}」`
  }, true, 'hint');

  renderBoard();
}

function cycleNextTacticsHint() {
  playUiClickSound();
  if (tacticsCandidates.length <= 1) return;
  currentTacticIndex = (currentTacticIndex + 1) % tacticsCandidates.length;
  displayTacticsHint(currentTacticIndex);
}

/* =========================================================
   【待った機能（一元化スナップショットの無矛盾巻き戻し）】
   ========================================================= */
function undoMove() {
  if (isGameOver || isReviewingPast() || isAiThinking || turn !== 'PLAYER' || getMoveCount() === 0) return;
  playUiClickSound();

  stopTurnTimer();
  clearTacticsHint();

  const stepsToUndo = (historyStates.length > 2) ? 2 : 1;
  for (let i = 0; i < stepsToUndo; i++) {
    if (historyStates.length > 1) {
      historyStates.pop();
    }
  }

  const lastSnap = historyStates[historyStates.length - 1];
  board = cloneBoardState(lastSnap.board);
  hands = JSON.parse(JSON.stringify(lastSnap.hands));
  turn = 'PLAYER';
  lastMove = lastSnap.move || null;

  lastSettledMoveInfo = { PLAYER: null, AI: null };
  const pLast = document.getElementById('player-last-move-disp');
  const aiLast = document.getElementById('ai-last-move-disp');
  
  if (lastSnap.move) {
    const prevSide = lastSnap.move.owner;
    lastSettledMoveInfo[prevSide] = {
      timeSec: lastSnap.metrics.timeSec,
      depth: lastSnap.metrics.depth,
      targetDepth: lastSnap.metrics.targetDepth
    };
    if (prevSide === 'PLAYER') {
      if (pLast) { pLast.innerHTML = formatOfficialKifuMove(lastSnap.move, getMoveCount() - 1); pLast.style.display = 'inline-flex'; }
      if (aiLast) aiLast.style.display = 'none';
    } else {
      if (aiLast) { aiLast.innerHTML = formatOfficialKifuMove(lastSnap.move, getMoveCount() - 1); aiLast.style.display = 'inline-flex'; }
      if (pLast) pLast.style.display = 'none';
    }
  } else {
    if (pLast) pLast.style.display = 'none';
    if (aiLast) aiLast.style.display = 'none';
  }

  reviewingIndex = historyStates.length - 1;
  triggerCutin('待った！ 局面を巻き戻し候');

  renderBoard();
  updateTroopsAndSituation();
  updateWarlordQuotes();
  updateButtonStates();

  const pName = PLAYER_WARLORDS[currentMyWarlordId].name;
  startTurnTimer('PLAYER', pName);
}

function surrenderGame() {
  if (isGameOver || isReviewingPast() || isAiThinking) return;
  playUiClickSound();

  isGameOver = true;
  stopTurnTimer(); stopExhibitionTimer();
  updateTurnFocus(null);
  updateButtonStates();

  showWarlordResultPlaque('AI');
  saveBattleRecord('lose', '投了');

  triggerCutin('無念の投了… 陣を退き申す！', true);
  setOrderMessage({
    line1: '【投了】形勢覆し難く、潔く陣を引かれました。',
    line2: '「対局開始」を押して新たな合戦へ出陣されよ！'
  }, false, 'settle');

  updateReviewModeUI();
}

/* =========================================================
   合戦絵巻ステップ鑑賞 ＆ 自動再生
   ========================================================= */
function stepReview(dir, fromAuto = false) {
  if (!fromAuto) {
    playUiClickSound();
    stopAutoReplay();
  }
  if (historyStates.length === 0) return;

  let targetIdx = (reviewingIndex >= 0 ? reviewingIndex : historyStates.length - 1) + dir;
  targetIdx = Math.max(0, Math.min(historyStates.length - 1, targetIdx));

  updateReplayStepDisplay(targetIdx);
}

function stepReviewToStart(fromAuto = false) {
  if (!fromAuto) {
    playUiClickSound(); stopAutoReplay();
  }
  updateReplayStepDisplay(0);
}

function stepReviewToEnd() {
  playUiClickSound(); stopAutoReplay();
  updateReplayStepDisplay(historyStates.length - 1);
}

function toggleAutoReplay() {
  playUiClickSound();
  if (isAutoReplaying) {
    stopAutoReplay();
  } else {
    isAutoReplaying = true;
    document.querySelectorAll('.kifu-auto-btn').forEach(b => {
      b.classList.add('is-playing');
      b.innerHTML = '⏹ 停止';
    });
    if (reviewingIndex >= historyStates.length - 1) {
      updateReplayStepDisplay(0);
    }
    runAutoReplayLoop();
  }
}

function stopAutoReplay() {
  isAutoReplaying = false;
  if (autoReplayTimer) { clearTimeout(autoReplayTimer); autoReplayTimer = null; }
  document.querySelectorAll('.kifu-auto-btn').forEach(b => {
    b.classList.remove('is-playing');
    b.innerHTML = '▶ 自動';
  });
}

function runAutoReplayLoop() {
  if (!isAutoReplaying) return;
  if (reviewingIndex < historyStates.length - 1) {
    stepReview(1, true);
    autoReplayTimer = setTimeout(runAutoReplayLoop, REPLAY_SPEEDS[replaySpeedIndex]);
  } else {
    stopAutoReplay();
  }
}

function cycleReplaySpeed() {
  playUiClickSound();
  replaySpeedIndex = (replaySpeedIndex + 1) % REPLAY_SPEEDS.length;
  const label = REPLAY_SPEED_LABELS[replaySpeedIndex];
  document.querySelectorAll('.kifu-speed-btn').forEach(b => b.textContent = label);
}

/* =========================================================
   合戦絵巻モーダル制御
   ========================================================= */
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

  const finalSnap = historyStates[historyStates.length - 1] || historyStates[0];
  const { pPct, aiPct } = calculateTroopsPercentages(finalSnap.board, finalSnap.hands);

  const pCurrent = Math.round(pMax * (pPct / 100));
  const aiCurrent = Math.round(aiMax * (aiPct / 100));

  const pAvatarBox = document.getElementById('kifu-player-avatar-box');
  const eAvatarBox = document.getElementById('kifu-enemy-avatar-box');
  if (pAvatarBox) pAvatarBox.innerHTML = getWarlordPortraitHtml(p, false);
  if (eAvatarBox) eAvatarBox.innerHTML = getWarlordPortraitHtml(e, false);

  const pOutcomePlaque = document.getElementById('kifu-player-outcome-plaque');
  const eOutcomePlaque = document.getElementById('kifu-enemy-outcome-plaque');

  if (pOutcomePlaque) pOutcomePlaque.style.display = 'none';
  if (eOutcomePlaque) eOutcomePlaque.style.display = 'none';

  if (isGameOver) {
    const isPlayerWin = (pPct > aiPct);
    const winTxt = isExhibitionActive ? '🏆【御前勝者】' : '🏆【大勝利】';
    const loseTxt = isExhibitionActive ? '⚔【御前敗者】' : '⚔【本陣陥落】';

    if (isPlayerWin) {
      if (pOutcomePlaque) {
        pOutcomePlaque.textContent = winTxt;
        pOutcomePlaque.className = 'kifu-outcome-crown-plaque crown-win';
        pOutcomePlaque.style.display = 'inline-flex';
      }
      if (eOutcomePlaque) {
        eOutcomePlaque.textContent = loseTxt;
        eOutcomePlaque.className = 'kifu-outcome-crown-plaque crown-lose';
        eOutcomePlaque.style.display = 'inline-flex';
      }
    } else {
      if (eOutcomePlaque) {
        eOutcomePlaque.textContent = winTxt;
        eOutcomePlaque.className = 'kifu-outcome-crown-plaque crown-win';
        eOutcomePlaque.style.display = 'inline-flex';
      }
      if (pOutcomePlaque) {
        pOutcomePlaque.textContent = loseTxt;
        pOutcomePlaque.className = 'kifu-outcome-crown-plaque crown-lose';
        pOutcomePlaque.style.display = 'inline-flex';
      }
    }
  }

  const pVal = document.getElementById('kifu-player-troops-val');
  const eVal = document.getElementById('kifu-enemy-troops-val');
  if (pVal) pVal.textContent = `${pCurrent.toLocaleString()} 兵`;
  if (eVal) eVal.textContent = `${aiCurrent.toLocaleString()} 兵`;

  const troopsDiff = pCurrent - aiCurrent;
  const diffBadge = document.getElementById('kifu-troops-diff-disp');
  if (diffBadge) {
    if (troopsDiff >= 0) {
      diffBadge.innerHTML = `${getKomaMarkHtml(true)} 先手 +${troopsDiff.toLocaleString()} 兵優勢`;
      diffBadge.style.color = '#ffd700';
    } else {
      diffBadge.innerHTML = `${getKomaMarkHtml(false)} 後手 +${Math.abs(troopsDiff).toLocaleString()} 兵優勢`;
      diffBadge.style.color = '#ffe6aa';
    }
  }

  const modalSit = document.getElementById('kifu-modal-situation-text');
  if (modalSit) modalSit.textContent = generateStrategistEvaluationText();

  drawTerritoryChart();

  const l = document.getElementById('kifu-list');
  const moveList = getMoveObjectsList();
  const metricList = getMoveMetricsList();

  if (l && moveList.length > 0) {
    const idx = moveList.length - 1;
    if (l.children.length < moveList.length) {
      const m = moveList[idx];
      const d = document.createElement('div');
      d.className = 'kifu-row-item';
      
      const officialMoveTxt = formatOfficialKifuMove(m, idx, false);
      const moveStr = `${idx + 1}手目：${officialMoveTxt}`;

      const metric = metricList[idx] || { timeSec: '0.1', depth: 1 };
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
        updateReplayStepDisplay(reviewingIndex);
        closeKifuModal();
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

  const pTag = document.getElementById('kifu-player-tag');
  const eTag = document.getElementById('kifu-enemy-tag');
  if (pTag) pTag.innerHTML = `${getKomaMarkHtml(true)}${getWarlordDisplayNameHtml(p)}`;
  if (eTag) eTag.innerHTML = `${getKomaMarkHtml(false)}${getWarlordDisplayNameHtml(e)}`;

  const l = document.getElementById('kifu-list');
  const moveList = getMoveObjectsList();
  const metricList = getMoveMetricsList();

  if (l) {
    l.innerHTML = '';
    moveList.forEach((m, idx) => {
      const d = document.createElement('div');
      d.className = 'kifu-row-item';
      
      const officialMoveTxt = formatOfficialKifuMove(m, idx, false);
      const moveStr = `${idx + 1}手目：${officialMoveTxt}`;

      const metric = metricList[idx] || { timeSec: '0.1', depth: 1 };
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
        updateReplayStepDisplay(reviewingIndex);
        closeKifuModal();
      };
      l.appendChild(d);
    });
    l.scrollTop = l.scrollHeight;
  }

  updateKifuModalLive();

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
  cvs.height = (rect.height || 115) * dpr;
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

/* =========================================================
   御前試合（武芸観戦モード）全統制システム
   ========================================================= */
function openExhibitionModal() {
  if (!isGameOver && !isReviewingPast()) return;
  playUiClickSound(); stopAutoReplay();
  renderExhibitionLists();
  document.getElementById('exhibition-modal').style.display = 'flex';
}

function closeExhibitionModal() {
  playUiClickSound();
  document.getElementById('exhibition-modal').style.display = 'none';
}

function switchExhibitionMobileTab(tab) {
  playUiClickSound();
  exhibitionMobileCurrentTab = tab;
  document.getElementById('btn-exh-tab-sente').classList.toggle('active', tab === 'sente');
  document.getElementById('btn-exh-tab-gote').classList.toggle('active', tab === 'gote');
  document.getElementById('exhibition-col-sente').classList.toggle('mobile-active-col', tab === 'sente');
  document.getElementById('exhibition-col-gote').classList.toggle('mobile-active-col', tab === 'gote');
}

function setExhibitionModalSpeed(speed) {
  playUiClickSound();
  exhibitionSpeed = speed;
  document.getElementById('btn-speed-normal').classList.toggle('active', speed === 'normal');
  document.getElementById('btn-speed-fast').classList.toggle('active', speed === 'fast');
}

function renderExhibitionLists() {
  const senteListEl = document.getElementById('exhibition-sente-pick-list');
  const goteListEl = document.getElementById('exhibition-gote-pick-list');
  if (!senteListEl || !goteListEl) return;

  senteListEl.innerHTML = '';
  goteListEl.innerHTML = '';

  const tabSenteBtn = document.getElementById('btn-exh-tab-sente');
  const tabGoteBtn = document.getElementById('btn-exh-tab-gote');
  const sCurrentData = getTargetAIData(exhibitionSenteTarget);
  const gCurrentData = getTargetAIData(exhibitionGoteTarget);
  if (tabSenteBtn) tabSenteBtn.innerHTML = `☗ 先手陣：<b>${sCurrentData.name}</b>`;
  if (tabGoteBtn) tabGoteBtn.innerHTML = `☖ 後手陣：<b>${gCurrentData.name}</b>`;

  ALL_EXHIBITION_AI_KEYS.forEach(key => {
    const data = getTargetAIData(key);

    const isSenteActive = (exhibitionSenteTarget === key);
    const isSenteDisabled = (exhibitionGoteTarget === key);
    const sItem = createExhibitionPickItem(data, key, isSenteActive, isSenteDisabled, 'sente');
    senteListEl.appendChild(sItem);

    const isGoteActive = (exhibitionGoteTarget === key);
    const isGoteDisabled = (exhibitionSenteTarget === key);
    const gItem = createExhibitionPickItem(data, key, isGoteActive, isGoteDisabled, 'gote');
    goteListEl.appendChild(gItem);
  });
}

function createExhibitionPickItem(data, key, isActive, isDisabled, side) {
  const item = document.createElement('div');
  item.className = `pick-avatar-item btn-3d ${isActive ? 'active' : ''} ${isDisabled ? 'is-selected-other' : ''}`;

  let badgeDanHtml = '';
  if (data.rank) {
    if (data.rank.includes('段')) badgeDanHtml = `<span class="badge-ai-dan">${data.rank}</span>`;
    else badgeDanHtml = `<span class="badge-ai-level">${data.rank}</span>`;
  }
  let engineTagHtml = data.engineTag ? `<span class="badge-engine-tag">${data.engineTag}</span>` : '';

  item.innerHTML = `
    <div class="pick-thumb-box">${getWarlordPortraitHtml(data, false)}</div>
    <div class="pick-info-col">
      <div class="pick-name-row">
        <span class="pick-name-txt">${getWarlordDisplayNameHtml(data)}</span>
        <div class="pick-badges-group">
          ${badgeDanHtml}
          ${engineTagHtml}
        </div>
      </div>
      <div class="pick-stats-row">
        <span class="badge-ai-troops">兵力 ${(data.baseTroops || data.maxTroops || 10000).toLocaleString()}</span>
        <span class="badge-ai-depth">${data.depthSpec || '探索'}</span>
      </div>
      <div class="pick-desc-txt">${data.featureShort || ''}</div>
    </div>
    ${isActive ? '<span class="badge-active-stamp">出陣中</span>' : (isDisabled ? '<span class="badge-other-stamp">対陣側選定済</span>' : '')}
  `;

  if (!isDisabled) {
    item.onclick = () => {
      playUiClickSound();
      if (side === 'sente') exhibitionSenteTarget = key;
      else exhibitionGoteTarget = key;
      renderExhibitionLists();
    };
  }
  return item;
}

function startExhibitionFromModal() {
  if (exhibitionSenteTarget === exhibitionGoteTarget) {
    triggerCutin('同武将による対局は選べませぬ！');
    return;
  }
  playUiClickSound();
  closeExhibitionModal();
  startExhibitionMatch();
}

function startExhibitionMatch() {
  initBoardState();
  isExhibitionActive = true;
  isGameOver = false;
  turn = 'PLAYER';
  battleStartTurn = 'PLAYER';

  const sData = getTargetAIData(exhibitionSenteTarget);
  const gData = getTargetAIData(exhibitionGoteTarget);
  const sTroops = sData.baseTroops || sData.maxTroops || 10000;
  const gTroops = gData.maxTroops || gData.baseTroops || 10000;

  document.getElementById('player-name-disp').innerHTML = `${getKomaMarkHtml(true)}${getWarlordDisplayNameHtml(sData)}`;
  document.getElementById('player-clan-disp').textContent = sData.clan;
  document.getElementById('player-troops-disp').textContent = `${sTroops.toLocaleString()} / ${sTroops.toLocaleString()} 兵`;

  document.getElementById('ai-name-disp').innerHTML = `${getKomaMarkHtml(false)}${getWarlordDisplayNameHtml(gData)}`;
  document.getElementById('ai-clan-disp').textContent = gData.clan;
  document.getElementById('ai-troops-disp').textContent = `${gTroops.toLocaleString()} / ${gTroops.toLocaleString()} 兵`;

  const enemyChangeBtn = document.getElementById('btn-enemy-change');
  const playerChangeBtn = document.getElementById('btn-player-change');
  if (enemyChangeBtn) enemyChangeBtn.style.display = 'none';
  if (playerChangeBtn) playerChangeBtn.style.display = 'none';

  const quitBtn = document.getElementById('btn-exhibition-quit');
  if (quitBtn) quitBtn.style.display = 'inline-block';

  updateTurnLabels();
  renderMainPortraits();
  updateTurnFocus(turn);
  renderBoard();
  updateTroopsAndSituation();
  updateWarlordQuotes();
  updateButtonStates();

  triggerCutin(`御前試合！ 【${sData.name}】対【${gData.name}】`, true);
  scheduleNextExhibitionTurn();
}

function scheduleNextExhibitionTurn() {
  if (isGameOver || !isExhibitionActive) return;
  stopExhibitionTimer();
  const delay = EXHIBITION_DELAYS[exhibitionSpeed] || 1200;
  exhibitionTimer = setTimeout(executeExhibitionStep, delay);
}

function executeExhibitionStep() {
  if (isGameOver || !isExhibitionActive) return;

  const isSenteTurn = (turn === 'PLAYER');
  const currentTargetKey = isSenteTurn ? exhibitionSenteTarget : exhibitionGoteTarget;
  const warlordData = getTargetAIData(currentTargetKey);

  startTurnTimer(turn, warlordData.name);
  isAiThinking = true;

  const timeLimit = EXHIBITION_TIME_LIMITS[exhibitionSpeed] || 8500;

  if (INSTRUCTORS_DATA[currentTargetKey]) {
    const inst = INSTRUCTORS_DATA[currentTargetKey];
    if (externalAiWorker) {
      externalAiWorker.postMessage({
        board, hands, engineType: inst.engineType,
        owner: turn,
        history: getMoveObjectsList(),
        hashHistory: getHashHistoryList(),
        timeLimit, speedMode: exhibitionSpeed
      });
    } else if (typeof window.thinkInstructorMoveDirect === 'function') {
      const res = window.thinkInstructorMoveDirect({
        board, hands, engineType: inst.engineType,
        owner: turn,
        history: getMoveObjectsList(),
        hashHistory: getHashHistoryList(),
        timeLimit, speedMode: exhibitionSpeed
      });
      handleExternalWorkerMessage({ data: res });
    }
  } else {
    let effectiveLevel = 5;
    if (currentTargetKey.startsWith('lvl_')) {
      effectiveLevel = parseInt(currentTargetKey.replace('lvl_', ''), 10);
    } else if (PLAYER_WARLORDS[currentTargetKey]) {
      effectiveLevel = 10;
    }

    aiWorker.postMessage({
      board, hands, level: effectiveLevel,
      isHintRequest: false, isAwakened: false,
      history: getMoveObjectsList(),
      hashHistory: getHashHistoryList(),
      isExhibition: true, targetOwner: turn, timeLimit,
      speedMode: exhibitionSpeed
    });
  }
}

function handleExternalWorkerMessage(e) {
  const data = e.data;
  if (!isExhibitionActive || isGameOver) return;
  isAiThinking = false;

  if (data.bestMove) {
    applyMove(data.bestMove, { depth: data.depth, targetDepth: data.targetDepth, timeSpentMs: data.timeSpentMs });
  } else {
    handleCheckmate((turn === 'PLAYER') ? 'AI' : 'PLAYER');
  }
}

function stopExhibition() {
  playUiClickSound();
  stopExhibitionTimer();
  stopTurnTimer();
  isAiThinking = false;

  initAiWorker();
  initExternalAiWorker();

  isExhibitionActive = false;
  isGameOver = true;
  turn = null;

  const quitBtn = document.getElementById('btn-exhibition-quit');
  if (quitBtn) quitBtn.style.display = 'none';

  setPlayerWarlord(currentMyWarlordId);
  selectConquestProvince(currentAiLevel);
  initBoardState();

  triggerCutin('御前試合を終了し、平時へ復帰');
}

function stopExhibitionTimer() {
  if (exhibitionTimer) {
    clearTimeout(exhibitionTimer);
    exhibitionTimer = null;
  }
}

/* =========================================================
   【指南書モーダル：敵将の格に応じた動的称号 ＆ リアルタイム兵法】
   ========================================================= */
function renderDynamicTactics() {
  const container = document.getElementById('dynamic-tactics-content');
  if (!container) return;

  const w = WARLORDS_DATA[currentAiLevel] || WARLORDS_DATA[1];
  const p = PLAYER_WARLORDS[currentMyWarlordId] || PLAYER_WARLORDS['sanada'];

  // 敵将の格（レベル）に応じた動的称号バッジと見出し
  let tabTitleTxt = '🔰 初陣指南';
  let sectionBadgeTxt = '🔰 入門軍略';
  if (currentAiLevel >= 8) {
    tabTitleTxt = '👑 覇者決戦';
    sectionBadgeTxt = '👑 天下分水嶺の秘策';
  } else if (currentAiLevel >= 4) {
    tabTitleTxt = '⚔ 敵陣攻略';
    sectionBadgeTxt = '⚔ 敵陣急所撃破';
  }

  // 指南書の第1タブのボタン表示をリアルタイム更新
  const tab0Btn = document.getElementById('guide-tab-btn-0');
  if (tab0Btn) tab0Btn.textContent = tabTitleTxt;

  container.innerHTML = `
    <div class="guide-card-box beginner-highlight-box" id="guide-card-dynamic-1">
      <div class="guide-card-header-row">
        <h4>${sectionBadgeTxt} 【Lv.${currentAiLevel} ${w.province}｜${w.name}】を討ち破る兵法</h4>
        <button class="card-speech-btn btn-3d" onclick="toggleCardSpeech('guide-card-dynamic-1')">🔊 朗読</button>
      </div>
      専属軍師・<b>${p.strategistName}</b>による、対「${w.name}」専用の極意に候！<br><br>
      <b class="kw-gold">一、敵将の気風と弱点を見抜け！</b><br>
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
  stopGuideSpeech(); stopAutoReplay();
  renderDynamicTactics();
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

function openRivalryInGuide() {
  playUiClickSound();
  openGuideModal();
  switchGuideTab(4);
  const rivalKey = `${currentMyWarlordId}_${currentAiLevel}`;
  const cardId = `rivalry-card-${rivalKey}`;
  const cardEl = document.getElementById(cardId);
  if (cardEl) {
    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    cardEl.classList.add('highlight-rivalry-card');
    setTimeout(() => cardEl.classList.remove('highlight-rivalry-card'), 2500);
  }
}

/* =========================================================
   起動初期化シーケンス
   ========================================================= */
document.addEventListener('click', () => initAudio(), { once: true });
document.addEventListener('touchstart', () => initAudio(), { once: true });

loadProgress();
loadSavedBoardTheme();
setPlayerWarlord(currentMyWarlordId);
initBoardState();

