

/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   外部オープンソースAIエンジン統合モジュール
   【戦国四英傑・客分思考エンジン群（Web移植・完全実力発揮版）】

   ※注記：本モジュールに搭載されている客分四英傑の思考ルーチンは、
   オープンソース将棋・チェスエンジン（MicroMax, Sunfish, Bonanza, Apery/やねうら王）の
   探索アルゴリズムや評価思想をベースに、Webブラウザ（JavaScript環境）向けに
   独自に移植・再構築した専用エンジンです。
   
   1. nanban : 【蒲生氏郷】       - MicroMax系統（古典的αβ探索 ＋ 静止探索 / 目標深さ3[早指し2]）
   2. kenshi : 【柳生石舟斎】     - Sunfish将棋系統（PST 駒配置評価駆動 / 目標深さ4[早指し3]）
   3. inja   : 【黒田如水】       - Bonanza系統（置換表 ＋ キラー探索 / 目標深さ4[早指し3]）
   4. sokei  : 【初代名人・大橋宗桂】 - Apery / やねうら王系統（安全PVS探索 ＋ 完全読破 / 目標深さ5[早指し4]）
   ========================================================= */

(function(global) {
  'use strict';

  const PIECE_CODES = ['OU','HI','KA','KI','GI','KE','KY','FU','RY','UM','NG','NK','NY','TO'];
  const VALUES = {
    OU: 30000, HI: 1050, KA: 880, KI: 580, GI: 480, KE: 380, KY: 280, FU: 100,
    RY: 1450, UM: 1250, NG: 570, NK: 490, NY: 430, TO: 430
  };
  const UNPROMOTE_MAP = {
    RY: 'HI', UM: 'KA', NG: 'GI', NK: 'KE', NY: 'KY', TO: 'FU',
    HI: 'HI', KA: 'KA', KI: 'KI', GI: 'GI', KE: 'KE', KY: 'KY', FU: 'FU', OU: 'OU'
  };
  const PROMOTE_MAP = {
    HI: 'RY', KA: 'UM', GI: 'NG', KE: 'NK', KY: 'NY', FU: 'TO'
  };
  const MATE_SCORE = 100000;

  // Sunfish / LesserKai 由来 Piece-Square Tables (PST：駒配置評価テーブル - 9x9)
  // 先手視点（上方向へ進む）。後手視点は段のみ反転 (8 - r) で参照。
  const PST_FU = [
    0,  0,  0,  0,  0,  0,  0,  0,  0,
    20, 20, 25, 30, 30, 30, 25, 20, 20,
    15, 18, 22, 26, 26, 26, 22, 18, 15,
    10, 12, 16, 20, 22, 20, 16, 12, 10,
     5,  8, 12, 16, 18, 16, 12,  8,  5,
     2,  4,  8, 12, 14, 12,  8,  4,  2,
     0,  0,  0,  5,  5,  5,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,  0,
     0,  0,  0,  0,  0,  0,  0,  0,  0
  ];

  const PST_GI = [
    15, 20, 22, 25, 25, 25, 22, 20, 15,
    12, 18, 22, 26, 28, 26, 22, 18, 12,
    10, 15, 20, 24, 25, 24, 20, 15, 10,
     8, 12, 16, 20, 22, 20, 16, 12,  8,
     5,  8, 12, 15, 16, 15, 12,  8,  5,
     0,  5,  8, 10, 12, 10,  8,  5,  0,
    -2,  0,  4,  6,  6,  6,  4,  0, -2,
    -5, -2,  0,  0,  0,  0,  0, -2, -5,
    -8, -5, -2, -2, -2, -2, -2, -5, -8
  ];

  const PST_KI = [
    10, 15, 18, 20, 20, 20, 18, 15, 10,
    10, 16, 20, 22, 24, 22, 20, 16, 10,
     8, 14, 18, 20, 22, 20, 18, 14,  8,
     6, 10, 14, 16, 18, 16, 14, 10,  6,
     2,  6, 10, 12, 14, 12, 10,  6,  2,
     0,  4,  6,  8, 10,  8,  6,  4,  0,
    -2,  2,  4,  6,  6,  6,  4,  2, -2,
     0,  0,  2,  4,  4,  4,  2,  0,  0,
    -5, -2,  0,  0,  0,  0,  0, -2, -5
  ];

  let board = [];
  let hands = { PLAYER: {}, AI: {} };
  let nodeCount = 0;
  let pastHashes = [];
  let searchStartTime = 0;
  let searchTimeLimit = 8500;
  let isSearchTimeout = false;
  let timeoutMask = 15; // 通常8.5秒は15(16ノード間隔)、早指し2.5秒は7(8ノード間隔)で監視

  const transpositionTable = new Map();
  const TT_EXACT = 0, TT_ALPHA = 1, TT_BETA = 2;
  let killerMoves = Array.from({ length: 40 }, () => [null, null]);

  function checkTimeout() {
    if (isSearchTimeout) return true;
    if ((Date.now() - searchStartTime) >= searchTimeLimit) {
      isSearchTimeout = true;
      return true;
    }
    return false;
  }

  function getValidBoardMoves(r, c, owner) {
    const item = board[r][c];
    if (!item) return [];
    const dir = owner === 'AI' ? 1 : -1;
    const moves = [];
    const canT = (nr, nc) => !board[nr][nc] || board[nr][nc].owner !== owner;

    const ray = dirs => dirs.forEach(([dr, dc]) => {
      let nr = r + dr, nc = c + dc;
      while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        if (!board[nr][nc]) moves.push({ r: nr, c: nc });
        else { if (canT(nr, nc)) moves.push({ r: nr, c: nc }); break; }
        nr += dr; nc += dc;
      }
    });

    const step = offs => offs.forEach(([dr, dc]) => {
      const nr = r + dr, nc = c + dc;
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && canT(nr, nc)) moves.push({ r: nr, c: nc });
    });

    const gold = [[dir, -1], [dir, 0], [dir, 1], [0, -1], [0, 1], [-dir, 0]];

    switch (item.code) {
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

  function findKing(owner) {
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c]?.owner === owner && board[r][c]?.code === 'OU') return { r, c };
      }
    }
    return null;
  }

  function isCheckState(owner) {
    const kp = findKing(owner);
    if (!kp) return true;
    const kr = kp.r, kc = kp.c, enemy = (owner === 'PLAYER') ? 'AI' : 'PLAYER';

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
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

    const enemyLegals = genLegalMoves(enemy, false, false);
    unmakeMove(undo);
    return enemyLegals.length === 0;
  }

  function genLegalMoves(owner, capturesOnly = false, filterUchifuzume = true) {
    const pseudo = [];
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
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
        for (let r = 0; r < 9; r++) {
          if ((code === 'FU' || code === 'KY') && ((owner === 'AI' && r === 8) || (owner === 'PLAYER' && r === 0))) continue;
          if (code === 'KE' && ((owner === 'AI' && r >= 7) || (owner === 'PLAYER' && r <= 1))) continue;
          for (let c = 0; c < 9; c++) {
            if (!board[r][c]) {
              if (code === 'FU') {
                let nifu = false;
                for (let kr = 0; kr < 9; kr++) if (board[kr][c]?.owner === owner && board[kr][c]?.code === 'FU') { nifu = true; break; }
                if (nifu) continue;
              }
              pseudo.push({ type: 'drop', code, to: {r, c}, owner, isCap: false, capVal: 0, attackerVal: VALUES[code] || 0 });
            }
          }
        }
      }
    }

    const legalList = [];
    for (let i = 0; i < pseudo.length; i++) {
      const m = pseudo[i];
      if (filterUchifuzume && m.type === 'drop' && m.code === 'FU') {
        if (isUchifuzume(m)) continue;
      }
      const undo = makeMove(m);
      const safe = !isCheckState(owner);
      unmakeMove(undo);
      if (safe) legalList.push(m);
    }

    legalList.sort((a, b) => {
      let sa = 0, sb = 0;
      if (a.isCap) sa += 20000 + (a.capVal * 16) - (a.attackerVal * 0.1);
      if (b.isCap) sb += 20000 + (b.capVal * 16) - (b.attackerVal * 0.1);
      if (a.promote) sa += 6000;
      if (b.promote) sb += 6000;
      return sb - sa;
    });

    return legalList;
  }

  function getZobristHash(b, h, t) {
    let s = t + ':';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = b[r][c];
        if (p) s += r + '' + c + p.code + p.owner[0] + '|';
      }
    }
    for (const ow of ['PLAYER', 'AI']) {
      for (const k in h[ow]) {
        if (h[ow][k] > 0) s += ow[0] + k + h[ow][k];
      }
    }
    return s;
  }

  /* 1. 蒲生氏郷（MicroMax系統）：的確な素材価値＋前進評価 */
  function evalNanban(perspectiveOwner) {
    let score = 0;
    const opp = (perspectiveOwner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p) continue;
        const sign = (p.owner === perspectiveOwner) ? 1 : -1;
        let val = VALUES[p.code] || 0;
        const relRank = (p.owner === 'AI') ? r : (8 - r);
        if (p.code === 'FU') val += relRank * 15;
        if (p.code === 'GI') val += relRank * 12;
        score += sign * val;
      }
    }
    for (const code in hands[perspectiveOwner]) score += (hands[perspectiveOwner][code] || 0) * (VALUES[code] || 0) * 1.15;
    for (const code in hands[opp])              score -= (hands[opp][code] || 0) * (VALUES[code] || 0) * 1.15;
    return score;
  }

  function quiescenceNanban(alpha, beta, owner, qDepth, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;
    const standPat = evalNanban(rootPerspective) * (owner === rootPerspective ? 1 : -1);
    if (qDepth >= 3) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const caps = genLegalMoves(owner, true, true);
    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let i = 0; i < caps.length; i++) {
      const undo = makeMove(caps[i]);
      const score = -quiescenceNanban(-beta, -alpha, nextOwner, qDepth + 1, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function searchNanban(depth, alpha, beta, owner, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;
    if (depth <= 0) return quiescenceNanban(alpha, beta, owner, 0, rootPerspective);

    const inCheck = isCheckState(owner);
    const moves = genLegalMoves(owner, false, true);
    if (moves.length === 0) return inCheck ? (-MATE_SCORE + (10 - depth)) : 0;

    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let i = 0; i < moves.length; i++) {
      const undo = makeMove(moves[i]);
      const score = -searchNanban(depth - 1, -beta, -alpha, nextOwner, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /* 2. 柳生石舟斎（Sunfish将棋系統）：PST座標正当化評価 */
  function evalKenshi(perspectiveOwner) {
    let score = 0;
    const opp = (perspectiveOwner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p) continue;
        let val = VALUES[p.code] || 0;
        const sign = (p.owner === perspectiveOwner ? 1 : -1);
        
        const mappedRow = (p.owner === 'PLAYER') ? r : (8 - r);
        const idx = mappedRow * 9 + c;

        if (p.code === 'FU') val += (PST_FU[idx] || 0);
        else if (p.code === 'GI') val += (PST_GI[idx] || 0);
        else if (p.code === 'KI') val += (PST_KI[idx] || 0);

        score += sign * val;
      }
    }
    for (const code in hands[perspectiveOwner]) score += (hands[perspectiveOwner][code] || 0) * (VALUES[code] || 0) * 1.15;
    for (const code in hands[opp])              score -= (hands[opp][code] || 0) * (VALUES[code] || 0) * 1.15;
    return score;
  }

  function quiescenceKenshi(alpha, beta, owner, qDepth, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;
    const standPat = evalKenshi(rootPerspective) * (owner === rootPerspective ? 1 : -1);
    if (qDepth >= 3) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const caps = genLegalMoves(owner, true, true);
    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let i = 0; i < caps.length; i++) {
      const undo = makeMove(caps[i]);
      const score = -quiescenceKenshi(-beta, -alpha, nextOwner, qDepth + 1, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function searchKenshi(depth, alpha, beta, owner, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;
    if (depth <= 0) return quiescenceKenshi(alpha, beta, owner, 0, rootPerspective);

    const inCheck = isCheckState(owner);
    const moves = genLegalMoves(owner, false, true);
    if (moves.length === 0) return inCheck ? (-MATE_SCORE + (10 - depth)) : 0;

    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let i = 0; i < moves.length; i++) {
      const undo = makeMove(moves[i]);
      const score = -searchKenshi(depth - 1, -beta, -alpha, nextOwner, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /* 3. 黒田如水（Bonanza系統）：厳密置換表 ＋ キラー探索 ＋ 玉防備 */
  function evalInja(perspectiveOwner) {
    let score = evalKenshi(perspectiveOwner);
    const opp = (perspectiveOwner === 'PLAYER') ? 'AI' : 'PLAYER';
    const myKing = findKing(perspectiveOwner);
    const oppKing = findKing(opp);

    if (myKing) {
      let g = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = myKing.r + dr, nc = myKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
          const occ = board[nr][nc];
          if (occ?.owner === perspectiveOwner && ['KI','GI','NG','NK','NY','TO'].includes(occ.code)) g++;
        }
      }
      score += g * 45;
    }
    if (oppKing) {
      let g = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = oppKing.r + dr, nc = oppKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
          const occ = board[nr][nc];
          if (occ?.owner === opp && ['KI','GI','NG','NK','NY','TO'].includes(occ.code)) g++;
        }
      }
      score -= g * 45;
    }
    return score;
  }

  function quiescenceInja(alpha, beta, owner, qDepth, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;
    const standPat = evalInja(rootPerspective) * (owner === rootPerspective ? 1 : -1);
    if (qDepth >= 3) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const caps = genLegalMoves(owner, true, true);
    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let i = 0; i < caps.length; i++) {
      const undo = makeMove(caps[i]);
      const score = -quiescenceInja(-beta, -alpha, nextOwner, qDepth + 1, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function searchInja(depth, alpha, beta, owner, ply, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;
    const hashKey = getZobristHash(board, hands, owner);
    const ttEntry = transpositionTable.get(hashKey);
    let ttMove = null;
    if (ttEntry) {
      ttMove = ttEntry.bestMove;
      if (ttEntry.depth >= depth) {
        if (ttEntry.flag === TT_EXACT) return ttEntry.score;
        if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return alpha;
        if (ttEntry.flag === TT_BETA  && ttEntry.score >= beta)  return beta;
      }
    }

    if (depth <= 0) return quiescenceInja(alpha, beta, owner, 0, rootPerspective);

    const inCheck = isCheckState(owner);
    const moves = genLegalMoves(owner, false, true);
    if (moves.length === 0) return inCheck ? (-MATE_SCORE + ply) : 0;

    const k1 = killerMoves[ply] ? killerMoves[ply][0] : null;
    const k2 = killerMoves[ply] ? killerMoves[ply][1] : null;

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
      const score = -searchInja(depth - 1, -beta, -alpha, nextOwner, ply + 1, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;

      if (score > bestVal) {
        bestVal = score;
        bestM = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!m.isCap && ply < 40) {
          killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = m;
        }
        break;
      }
    }

    let flag = TT_EXACT;
    if (bestVal <= origAlpha) flag = TT_ALPHA;
    else if (bestVal >= beta) flag = TT_BETA;
    if (transpositionTable.size > 25000) transpositionTable.clear();
    transpositionTable.set(hashKey, { depth, score: bestVal, flag, bestMove: bestM });

    return bestVal;
  }

  /* 4. 【初代名人・大橋宗桂】（Apery / やねうら王系統）：最高精度玉囲い評価 ＋ 安全PVS探索 */
  function evalSokei(perspectiveOwner) {
    let score = 0;
    const opp = (perspectiveOwner === 'PLAYER') ? 'AI' : 'PLAYER';
    let myKing = null, oppKing = null;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (!p) continue;
        let val = VALUES[p.code] || 0;
        const sign = (p.owner === perspectiveOwner ? 1 : -1);
        
        const mappedRow = (p.owner === 'PLAYER') ? r : (8 - r);
        const idx = mappedRow * 9 + c;

        if (p.code === 'FU') val += (PST_FU[idx] || 0);
        else if (p.code === 'GI') val += (PST_GI[idx] || 0) * 1.15;
        else if (p.code === 'KI') val += (PST_KI[idx] || 0) * 1.15;
        else if (p.code === 'RY') val += 160;
        else if (p.code === 'UM') val += 130;

        if (p.code === 'OU') {
          if (p.owner === perspectiveOwner) myKing = { r, c };
          else oppKing = { r, c };
        }
        score += sign * val;
      }
    }

    if (myKing) {
      let guards = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = myKing.r + dr, nc = myKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
          const occ = board[nr][nc];
          if (occ?.owner === perspectiveOwner && ['KI','GI','NG','NK','NY','TO'].includes(occ.code)) guards++;
        }
      }
      score += guards * 65;
    }
    if (oppKing) {
      let guards = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = oppKing.r + dr, nc = oppKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
          const occ = board[nr][nc];
          if (occ?.owner === opp && ['KI','GI','NG','NK','NY','TO'].includes(occ.code)) guards++;
        }
      }
      score -= guards * 65;
    }

    for (const code in hands[perspectiveOwner]) score += (hands[perspectiveOwner][code] || 0) * (VALUES[code] || 0) * 1.25;
    for (const code in hands[opp])              score -= (hands[opp][code] || 0) * (VALUES[code] || 0) * 1.20;
    return score;
  }

  function quiescenceSokei(alpha, beta, owner, qDepth, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;
    const standPat = evalSokei(rootPerspective) * (owner === rootPerspective ? 1 : -1);
    if (qDepth >= 4) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const caps = genLegalMoves(owner, true, true);
    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let i = 0; i < caps.length; i++) {
      const undo = makeMove(caps[i]);
      const score = -quiescenceSokei(-beta, -alpha, nextOwner, qDepth + 1, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function searchSokeiPVS(depth, alpha, beta, owner, ply, rootPerspective) {
    nodeCount++;
    if ((nodeCount & timeoutMask) === 0 && checkTimeout()) return alpha;

    const inCheck = isCheckState(owner);
    if (depth <= 0) return quiescenceSokei(alpha, beta, owner, 0, rootPerspective);

    const hashKey = getZobristHash(board, hands, owner);
    const ttEntry = transpositionTable.get(hashKey);
    let ttMove = null;
    if (ttEntry) {
      ttMove = ttEntry.bestMove;
      if (ttEntry.depth >= depth) {
        if (ttEntry.flag === TT_EXACT) return ttEntry.score;
        if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return alpha;
        if (ttEntry.flag === TT_BETA  && ttEntry.score >= beta)  return beta;
      }
    }

    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    const moves = genLegalMoves(owner, false, true);
    if (moves.length === 0) return inCheck ? (-MATE_SCORE + ply) : 0;

    const k1 = killerMoves[ply] ? killerMoves[ply][0] : null;
    const k2 = killerMoves[ply] ? killerMoves[ply][1] : null;

    moves.sort((a, b) => {
      if (ttMove) {
        const matchA = (a.type === ttMove.type && a.to.r === ttMove.to.r && a.to.c === ttMove.to.c);
        const matchB = (b.type === ttMove.type && b.to.r === ttMove.to.r && b.to.c === ttMove.to.c);
        if (matchA) return -1;
        if (matchB) return 1;
      }
      let sa = (a.isCap ? 20000 + a.capVal * 16 - a.attackerVal * 0.1 : 0) + (a.promote ? 6000 : 0);
      let sb = (b.isCap ? 20000 + b.capVal * 16 - b.attackerVal * 0.1 : 0) + (b.promote ? 6000 : 0);
      if (k1 && a.type === k1.type && a.to.r === k1.to.r && a.to.c === k1.to.c) sa += 8500;
      if (k1 && b.type === k1.type && b.to.r === k1.to.r && b.to.c === k1.to.c) sb += 8500;
      if (k2 && a.type === k2.type && a.to.r === k2.to.r && a.to.c === k2.to.c) sa += 4500;
      if (k2 && b.type === k2.type && b.to.r === k2.to.r && b.to.c === k2.to.c) sb += 4500;
      return sb - sa;
    });

    let bestVal = -Infinity;
    let bestM = null;
    const origAlpha = alpha;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const undo = makeMove(m);
      let score;

      if (i === 0) {
        score = -searchSokeiPVS(depth - 1, -beta, -alpha, nextOwner, ply + 1, rootPerspective);
      } else {
        score = -searchSokeiPVS(depth - 1, -alpha - 1, -alpha, nextOwner, ply + 1, rootPerspective);
        if (score > alpha && score < beta) {
          score = -searchSokeiPVS(depth - 1, -beta, -alpha, nextOwner, ply + 1, rootPerspective);
        }
      }

      unmakeMove(undo);
      if (isSearchTimeout) break;

      if (score > bestVal) {
        bestVal = score;
        bestM = m;
      }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!m.isCap && ply < 40) {
          killerMoves[ply][1] = killerMoves[ply][0];
          killerMoves[ply][0] = m;
        }
        break;
      }
    }

    let flag = TT_EXACT;
    if (bestVal <= origAlpha) flag = TT_ALPHA;
    else if (bestVal >= beta) flag = TT_BETA;
    if (transpositionTable.size > 30000) transpositionTable.clear();
    transpositionTable.set(hashKey, { depth, score: bestVal, flag, bestMove: bestM });

    return bestVal;
  }

  // 反復深化メインディスパッチャー（中断保護 ＆ 実績深度・目標深度の確実な返却）
  function executeSearch(params) {
    const {
      board: bD,
      hands: hD,
      engineType = 'kenshi',
      owner = 'PLAYER',
      history = [],
      hashHistory = [],
      timeLimit = 8500,
      speedMode = 'normal'
    } = params;

    board = bD;
    hands = hD;
    pastHashes = hashHistory || [];
    nodeCount = 0;
    isSearchTimeout = false;
    searchStartTime = Date.now();
    searchTimeLimit = (typeof timeLimit === 'number' && timeLimit > 0) ? timeLimit : 8500;

    const isFast = (speedMode === 'fast' || searchTimeLimit <= 3000);
    timeoutMask = isFast ? 7 : 15; // 早指し戦時はタイムアウト検出頻度を倍増（8ノード間隔）
    let targetDepth = 3;

    if (engineType === 'nanban') {
      targetDepth = isFast ? 2 : 3;
    } else if (engineType === 'kenshi') {
      targetDepth = isFast ? 3 : 4;
    } else if (engineType === 'inja') {
      targetDepth = isFast ? 3 : 4;
    } else if (engineType === 'sokei') {
      targetDepth = isFast ? 4 : 5;
    }

    const legals = genLegalMoves(owner, false, true);
    if (legals.length === 0) {
      return { type: 'done', bestMove: null, evalScore: -MATE_SCORE, depth: 0, targetDepth: targetDepth, nodes: 0, engineType, timeSpentMs: 10 };
    }

    const enemyOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    const calcRepetitionPenalty = (m) => {
      let penalty = 0;
      const undo = makeMove(m);
      const hKey = getZobristHash(board, hands, enemyOwner);
      const count = pastHashes.filter(h => h === hKey).length;
      if (count >= 2) penalty += 5500;
      else if (count === 1) penalty += 2000;
      unmakeMove(undo);
      return penalty;
    };

    let confirmedBestMove = legals[0];
    let confirmedScore = 0;
    let achievedDepth = 1;
    let scoredMoves = legals.map(m => ({ move: m, score: 0 }));

    for (let d = 1; d <= targetDepth; d++) {
      if (checkTimeout()) break;

      let alpha = -Infinity, beta = Infinity;

      if (d > 1 && confirmedBestMove) {
        scoredMoves.sort((a, b) => {
          const isA = (a.move.type === confirmedBestMove.type && a.move.to.r === confirmedBestMove.to.r && a.move.to.c === confirmedBestMove.to.c);
          const isB = (b.move.type === confirmedBestMove.type && b.move.to.r === confirmedBestMove.to.r && b.move.to.c === confirmedBestMove.to.c);
          if (isA) return -1; if (isB) return 1;
          return b.score - a.score;
        });
      }

      let currentIteration = scoredMoves.map(it => ({ move: it.move, score: it.score }));
      let iterationCompleted = true;

      for (let i = 0; i < currentIteration.length; i++) {
        if (checkTimeout()) { iterationCompleted = false; break; }
        const m = currentIteration[i].move;
        const repPen = calcRepetitionPenalty(m);
        const undo = makeMove(m);
        let s = 0;

        if (engineType === 'nanban') {
          s = -searchNanban(d - 1, -beta, -alpha, enemyOwner, owner) - repPen;
        } else if (engineType === 'kenshi') {
          s = -searchKenshi(d - 1, -beta, -alpha, enemyOwner, owner) - repPen;
        } else if (engineType === 'inja') {
          s = -searchInja(d - 1, -beta, -alpha, enemyOwner, 1, owner) - repPen;
        } else {
          s = -searchSokeiPVS(d - 1, -beta, -alpha, enemyOwner, 1, owner) - repPen;
        }

        unmakeMove(undo);
        currentIteration[i].score = s;
        if (isSearchTimeout) { iterationCompleted = false; break; }
        if (s > alpha) alpha = s;
      }

      // 深さ d を読み切った場合に確定結果として保存
      if (iterationCompleted && !isSearchTimeout) {
        achievedDepth = d;
        currentIteration.sort((a, b) => b.score - a.score);
        scoredMoves = currentIteration;
        confirmedBestMove = scoredMoves[0].move;
        confirmedScore = scoredMoves[0].score;
      }
      if (checkTimeout()) break;
    }

    const elapsed = Math.max(50, Date.now() - searchStartTime);

    return {
      type: 'done',
      bestMove: confirmedBestMove || legals[0],
      evalScore: confirmedScore,
      depth: achievedDepth,
      targetDepth: targetDepth,
      nodes: nodeCount,
      engineType,
      timeSpentMs: elapsed
    };
  }

  // メインスレッド向けダイレクト実行関数
  if (typeof window !== 'undefined') {
    window.thinkInstructorMoveDirect = executeSearch;
  }

  // Web Worker メッセージハンドラ
  if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.onmessage = function(e) {
      const result = executeSearch(e.data);
      self.postMessage(result);
    };
  }

})(typeof self !== 'undefined' ? self : this);


