/* =========================================================
   将棋王 2026 〜 天下統一・戦国決戦 〜
   【ファイル 2 / 3：ai_engine.js - 統合思考探索エンジン完全版】
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

  // PST (Piece-Square Tables: 陣形・配置評価テーブル)
  const PST_FU = [
    0,  0,  0,  0,  0,  0,  0,  0,  0,
    25, 25, 30, 35, 35, 35, 30, 25, 25,
    18, 20, 24, 28, 28, 28, 24, 20, 18,
    10, 14, 18, 22, 24, 22, 18, 14, 10,
     6,  8, 12, 16, 18, 16, 12,  8,  6,
     2,  4,  8, 12, 14, 12,  8,  4,  2,
     0,  0,  0,  6,  6,  6,  0,  0,  0,
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

  let board = [], hands = { PLAYER: {}, AI: {} };
  let nodeCount = 0, kingPosCache = { PLAYER: null, AI: null };
  let pastHashes = [], checkHistory = [], searchStartTime = 0, searchTimeLimit = 8500, isSearchTimeout = false;
  let currentSearchEngineType = 'kenshi';

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

  function updateKingCache() {
    kingPosCache.PLAYER = null; kingPosCache.AI = null;
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c];
        if (p && p.code === 'OU') kingPosCache[p.owner] = { r, c };
      }
    }
  }

  function getValidBoardMoves(r, c, owner) {
    const item = board[r][c]; if (!item) return [];
    const dir = owner === 'AI' ? 1 : -1, moves = [];
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
    if (kingPosCache[owner]) {
      const kp = kingPosCache[owner];
      if (board[kp.r] && board[kp.r][kp.c]?.code === 'OU' && board[kp.r][kp.c]?.owner === owner) return kp;
    }
    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        if (board[r][c]?.owner === owner && board[r][c]?.code === 'OU') {
          kingPosCache[owner] = { r, c };
          return { r, c };
        }
      }
    }
    return null;
  }

  function isCheckState(owner) {
    const kp = findKing(owner); if (!kp) return true;
    const kr = kp.r, kc = kp.c, enemy = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    const enemyDir = (enemy === 'AI') ? 1 : -1;

    const adjDirs = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (let i = 0; i < adjDirs.length; i++) {
      const nr = kr + adjDirs[i][0], nc = kc + adjDirs[i][1];
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        const p = board[nr][nc];
        if (p && p.owner === enemy) {
          if (p.code === 'OU') return true;
          if (p.code === 'FU' && nr === kr - enemyDir && nc === kc) return true;
          if (['KI','TO','NY','NK','NG'].includes(p.code)) {
            const dr = kr - nr, dc = kc - nc;
            if ((dr === enemyDir && Math.abs(dc) <= 1) || (dr === 0 && Math.abs(dc) === 1) || (dr === -enemyDir && dc === 0)) return true;
          }
          if (p.code === 'GI') {
            const dr = kr - nr, dc = kc - nc;
            if ((dr === enemyDir && Math.abs(dc) <= 1) || (dr === -enemyDir && Math.abs(dc) === 1)) return true;
          }
          if (p.code === 'RY' || p.code === 'UM') return true;
        }
      }
    }

    const keDirs = [[-enemyDir * 2, -1], [-enemyDir * 2, 1]];
    for (let i = 0; i < keDirs.length; i++) {
      const nr = kr + keDirs[i][0], nc = kc + keDirs[i][1];
      if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        const p = board[nr][nc];
        if (p && p.owner === enemy && p.code === 'KE') return true;
      }
    }

    const ortho = [[-1,0],[1,0],[0,-1],[0,1]];
    for (let i = 0; i < ortho.length; i++) {
      let nr = kr + ortho[i][0], nc = kc + ortho[i][1];
      while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        const p = board[nr][nc];
        if (p) {
          if (p.owner === enemy && (p.code === 'HI' || p.code === 'RY' || (p.code === 'KY' && ortho[i][0] === -enemyDir && ortho[i][1] === 0))) return true;
          break;
        }
        nr += ortho[i][0]; nc += ortho[i][1];
      }
    }

    const diag = [[-1,-1],[-1,1],[1,-1],[1,1]];
    for (let i = 0; i < diag.length; i++) {
      let nr = kr + diag[i][0], nc = kc + diag[i][1];
      while (nr >= 0 && nr < 9 && nc >= 0 && nc < 9) {
        const p = board[nr][nc];
        if (p) {
          if (p.owner === enemy && (p.code === 'KA' || p.code === 'UM')) return true;
          break;
        }
        nr += diag[i][0]; nc += diag[i][1];
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
        if (target.code !== 'OU') hands[owner][UNPROMOTE_MAP[target.code]] = (hands[owner][UNPROMOTE_MAP[target.code]] || 0) + 1;
      }
      if (move.promote) item.code = PROMOTE_MAP[item.code];
      board[move.to.r][move.to.c] = item;
      board[move.from.r][move.from.c] = null;
      if (item.code === 'OU') kingPosCache[owner] = { r: move.to.r, c: move.to.c };
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
      if (item.code === 'OU') kingPosCache[owner] = { r: move.from.r, c: move.from.c };
    }
  }

  function isUchifuzume(move) {
    if (move.type !== 'drop' || move.code !== 'FU') return false;
    const enemy = move.owner === 'AI' ? 'PLAYER' : 'AI';
    const enemyKing = findKing(enemy); if (!enemyKing) return false;
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
      if (filterUchifuzume && m.type === 'drop' && m.code === 'FU' && isUchifuzume(m)) continue;
      const undo = makeMove(m);
      const safe = !isCheckState(owner);
      unmakeMove(undo);
      if (safe) legalList.push(m);
    }

    legalList.sort((a, b) => {
      let sa = (a.isCap ? 20000 + a.capVal * 16 - a.attackerVal * 0.1 : 0) + (a.promote ? 6000 : 0);
      let sb = (b.isCap ? 20000 + b.capVal * 16 - b.attackerVal * 0.1 : 0) + (b.promote ? 6000 : 0);
      return sb - sa;
    });

    return legalList;
  }

  function getZobristHash(b, h, t) {
    let s = t[0];
    for (let r = 0; r < 9; r++) for (let c = 0; c < 9; c++) {
      const p = b[r][c]; if (p) s += '' + r + c + p.code + p.owner[0];
    }
    for (const k in h.PLAYER) if (h.PLAYER[k] > 0) s += 'P' + k + h.PLAYER[k];
    for (const k in h.AI) if (h.AI[k] > 0) s += 'A' + k + h.AI[k];
    return s;
  }

  /* =========================================================
     武将専用評価関数システム（十一人＋客分四英傑の個性完全復元）
     ========================================================= */
  function evaluatePosition(perspectiveOwner) {
    const opp = (perspectiveOwner === 'PLAYER') ? 'AI' : 'PLAYER';
    let baseScore = 0;
    let myKing = null, oppKing = null;
    let myPromotedCount = 0, oppPromotedCount = 0;
    let myBishopCount = 0, oppBishopCount = 0;

    for (let r = 0; r < 9; r++) {
      for (let c = 0; c < 9; c++) {
        const p = board[r][c]; if (!p) continue;
        let val = VALUES[p.code] || 0;
        const sign = (p.owner === perspectiveOwner ? 1 : -1);
        const idx = (p.owner === 'PLAYER') ? (r * 9 + c) : ((8 - r) * 9 + (8 - c));

        if (p.code === 'FU') val += (PST_FU[idx] || 0);
        else if (p.code === 'GI') val += (PST_GI[idx] || 0);
        else if (p.code === 'KI') val += (PST_KI[idx] || 0);

        if (p.code === 'OU') {
          if (p.owner === perspectiveOwner) myKing = { r, c };
          else oppKing = { r, c };
        }
        if (p.owner === perspectiveOwner) {
          if (['RY','UM','TO','NY','NK','NG'].includes(p.code)) myPromotedCount++;
          if (['KA','UM'].includes(p.code)) myBishopCount++;
        } else {
          if (['RY','UM','TO','NY','NK','NG'].includes(p.code)) oppPromotedCount++;
          if (['KA','UM'].includes(p.code)) oppBishopCount++;
        }

        baseScore += sign * val;
      }
    }

    if (myKing) {
      let g = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = myKing.r + dr, nc = myKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && board[nr][nc]?.owner === perspectiveOwner && ['KI','GI','NG','NK','NY','TO'].includes(board[nr][nc].code)) g++;
      }
      baseScore += g * 40;
    }
    if (oppKing) {
      let g = 0;
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        const nr = oppKing.r + dr, nc = oppKing.c + dc;
        if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && board[nr][nc]?.owner === opp && ['KI','GI','NG','NK','NY','TO'].includes(board[nr][nc].code)) g++;
      }
      baseScore -= g * 40;
    }

    for (const code in hands[perspectiveOwner]) baseScore += (hands[perspectiveOwner][code] || 0) * (VALUES[code] || 0) * 1.25;
    for (const code in hands[opp]) baseScore -= (hands[opp][code] || 0) * (VALUES[code] || 0) * 1.20;

    switch (currentSearchEngineType) {
      case 'warlord_1':
        for (let c = 0; c < 9; c++) {
          for (let r = 0; r < 9; r++) {
            if (board[r][c]?.owner === perspectiveOwner && board[r][c]?.code === 'FU') {
              baseScore += (perspectiveOwner === 'AI' ? r : (8 - r)) * 12;
            }
          }
        }
        break;

      case 'warlord_2':
        for (let r = 0; r < 9; r++) {
          const cp = board[r][4];
          if (cp?.owner === perspectiveOwner) baseScore += 55;
        }
        break;

      case 'warlord_3':
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            if (board[r][c]?.owner === perspectiveOwner && board[r][c]?.code === 'GI') {
              baseScore += (perspectiveOwner === 'AI' ? r : (8 - r)) * 18;
            }
          }
        }
        break;

      case 'warlord_4':
        if (myKing) {
          let guards = 0;
          for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
            const nr = myKing.r + dr, nc = myKing.c + dc;
            if (nr >= 0 && nr < 9 && nc >= 0 && nc < 9 && board[nr][nc]?.owner === perspectiveOwner) guards++;
          }
          baseScore += guards * 20;
        }
        break;

      case 'warlord_5':
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const p = board[r][c];
            if (p && p.owner === opp && p.code !== 'OU') {
              baseScore += 35;
            }
          }
        }
        break;

      case 'warlord_6':
        baseScore += (myBishopCount - oppBishopCount) * 160;
        break;

      case 'warlord_7':
        for (let r = 0; r < 9; r++) {
          for (let c = 0; c < 9; c++) {
            const p = board[r][c];
            if (p && p.owner === perspectiveOwner && ['KI','GI'].includes(p.code)) {
              baseScore += 45;
            }
          }
        }
        break;

      case 'warlord_8':
        baseScore += (myPromotedCount * 140) - (oppPromotedCount * 120);
        break;

      case 'warlord_9':
        let myHandCount = 0, oppHandCount = 0;
        for (const k in hands[perspectiveOwner]) myHandCount += (hands[perspectiveOwner][k] || 0);
        for (const k in hands[opp]) oppHandCount += (hands[opp][k] || 0);
        baseScore += (myHandCount - oppHandCount) * 65;
        break;

      case 'warlord_10':
        if (myKing) baseScore += 90;
        break;

      case 'warlord_11':
        baseScore += (myPromotedCount * 110);
        break;

      case 'nanban':
        baseScore += (myPromotedCount * 70);
        break;

      case 'kenshi':
        baseScore += 0;
        break;

      case 'inja':
        baseScore += (hands[perspectiveOwner]['FU'] || 0) * 40;
        break;

      case 'sokei':
        baseScore *= 1.08;
        break;
    }

    return baseScore;
  }

  function quiescence(alpha, beta, owner, qDepth, rootPerspective) {
    nodeCount++;
    if ((nodeCount & 15) === 0 && checkTimeout()) return alpha;
    const standPat = evaluatePosition(rootPerspective) * (owner === rootPerspective ? 1 : -1);
    if (qDepth >= 3) return standPat;
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;

    const caps = genLegalMoves(owner, true, true);
    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    for (let i = 0; i < caps.length; i++) {
      const undo = makeMove(caps[i]);
      const score = -quiescence(-beta, -alpha, nextOwner, qDepth + 1, rootPerspective);
      unmakeMove(undo);
      if (isSearchTimeout) break;
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function pvsSearch(depth, alpha, beta, owner, ply, rootPerspective, canNull = true) {
    nodeCount++;
    if ((nodeCount & 15) === 0 && checkTimeout()) return alpha;
    const inCheck = isCheckState(owner);
    if (depth <= 0) return quiescence(alpha, beta, owner, 0, rootPerspective);

    const hashKey = getZobristHash(board, hands, owner);
    const ttEntry = transpositionTable.get(hashKey);
    let ttMove = null;
    if (ttEntry) {
      ttMove = ttEntry.bestMove;
      if (ttEntry.depth >= depth) {
        if (ttEntry.flag === TT_EXACT) return ttEntry.score;
        if (ttEntry.flag === TT_ALPHA && ttEntry.score <= alpha) return alpha;
        if (ttEntry.flag === TT_BETA && ttEntry.score >= beta) return beta;
      }
    }

    const nextOwner = (owner === 'PLAYER') ? 'AI' : 'PLAYER';
    if (canNull && !inCheck && depth >= 3) {
      const nullScore = -pvsSearch(depth - 1 - 2, -beta, -beta + 1, nextOwner, ply + 1, rootPerspective, false);
      if (nullScore >= beta) return beta;
    }

    const moves = genLegalMoves(owner, false, true);
    if (moves.length === 0) return inCheck ? (-MATE_SCORE + ply) : 0;

    const k1 = killerMoves[ply] ? killerMoves[ply][0] : null;
    const k2 = killerMoves[ply] ? killerMoves[ply][1] : null;

    moves.sort((a, b) => {
      if (ttMove) {
        const matchA = (a.type === ttMove.type && a.to.r === ttMove.to.r && a.to.c === ttMove.to.c);
        const matchB = (b.type === ttMove.type && b.to.r === ttMove.to.r && b.to.c === ttMove.to.c);
        if (matchA) return -1; if (matchB) return 1;
      }
      let sa = (a.isCap ? 20000 + a.capVal * 16 - a.attackerVal * 0.1 : 0) + (a.promote ? 6000 : 0);
      let sb = (b.isCap ? 20000 + b.capVal * 16 - b.attackerVal * 0.1 : 0) + (b.promote ? 6000 : 0);
      if (k1 && a.type === k1.type && a.to.r === k1.to.r && a.to.c === k1.to.c) sa += 8500;
      if (k1 && b.type === k1.type && b.to.r === k1.to.r && b.to.c === k1.to.c) sb += 8500;
      if (k2 && a.type === k2.type && a.to.r === k2.to.r && a.to.c === k2.to.c) sa += 4500;
      if (k2 && b.type === k2.type && b.to.r === k2.to.r && b.to.c === k2.to.c) sb += 4500;
      return sb - sa;
    });

    let bestVal = -Infinity, bestM = null, origAlpha = alpha;

    for (let i = 0; i < moves.length; i++) {
      const m = moves[i];
      const undo = makeMove(m);
      let score;
      if (i === 0) {
        score = -pvsSearch(depth - 1, -beta, -alpha, nextOwner, ply + 1, rootPerspective, true);
      } else {
        score = -pvsSearch(depth - 1, -alpha - 1, -alpha, nextOwner, ply + 1, rootPerspective, true);
        if (score > alpha && score < beta) {
          score = -pvsSearch(depth - 1, -beta, -alpha, nextOwner, ply + 1, rootPerspective, true);
        }
      }
      unmakeMove(undo);
      if (isSearchTimeout) break;

      if (score > bestVal) { bestVal = score; bestM = m; }
      if (score > alpha) alpha = score;
      if (alpha >= beta) {
        if (!m.isCap && ply < 40) {
          killerMoves[ply][1] = killerMoves[ply][0]; killerMoves[ply][0] = m;
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

  function executeSearch(params) {
    try {
      const {
        board: bD, hands: hD, engineType = 'kenshi',
        level = 1, isHintRequest = false, isAwakened = false,
        history = [], hashHistory = [], checkHist = [], timeLimit = 8500
      } = params;

      // 【核心改善】owner / targetOwner の完全両対応受領
      const targetSide = params.owner || params.targetOwner || (isHintRequest ? 'PLAYER' : 'AI');

      board = bD; hands = hD; pastHashes = hashHistory || []; checkHistory = checkHist || [];
      nodeCount = 0; isSearchTimeout = false; searchStartTime = Date.now();
      searchTimeLimit = (typeof timeLimit === 'number' && timeLimit > 0) ? timeLimit : 8500;
      currentSearchEngineType = engineType;
      updateKingCache();

      let targetDepth = 3;
      if (engineType === 'nanban') targetDepth = 3;
      else if (engineType === 'kenshi') targetDepth = 4;
      else if (engineType === 'inja') targetDepth = 5;
      else if (engineType === 'sokei') targetDepth = 6;
      else if (engineType && engineType.startsWith('warlord_')) {
        const lvlNum = parseInt(engineType.replace('warlord_', ''), 10) || 1;
        targetDepth = lvlNum >= 10 ? 5 : (lvlNum >= 7 ? 4 : (lvlNum >= 5 ? 3 : (lvlNum >= 3 ? 2 : 1)));
      } else {
        if (isHintRequest) targetDepth = isAwakened ? 5 : 4;
        else targetDepth = level >= 10 ? 5 : (level >= 7 ? 4 : (level >= 5 ? 3 : (level >= 3 ? 2 : 1)));
      }

      const legals = genLegalMoves(targetSide, false, true);
      if (legals.length === 0) {
        return { type: isHintRequest ? 'hintDone' : 'done', bestMove: null, evalScore: -MATE_SCORE, depth: 0, targetDepth, nodes: 0, timeSpentMs: 10 };
      }

      const enemyOwner = (targetSide === 'PLAYER') ? 'AI' : 'PLAYER';

      const calcRepetitionPenalty = (m) => {
        let penalty = 0;
        const undo = makeMove(m);
        const hKey = getZobristHash(board, hands, enemyOwner);
        const count = pastHashes.filter(h => h === hKey).length;

        if (count >= 2) {
          const isCheckingNow = isCheckState(enemyOwner);
          if (isCheckingNow) {
            penalty += 80000;
          } else {
            penalty += 6000;
          }
        } else if (count === 1) {
          penalty += 2000;
        }
        unmakeMove(undo);
        return penalty;
      };

      let confirmedBestMove = legals[0];
      let confirmedScore = 0;
      let achievedDepth = 1;
      let scoredMoves = legals.map(m => ({ move: m, score: 0 }));

      for (let d = 1; d <= targetDepth; d++) {
        if (checkTimeout()) break;
        if (typeof self !== 'undefined' && typeof window === 'undefined') {
          self.postMessage({ type: 'progress', depth: d, targetDepth, nodes: nodeCount, evalScore: confirmedScore });
        }

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
        let completed = true;

        for (let i = 0; i < currentIteration.length; i++) {
          if (checkTimeout()) { completed = false; break; }
          const m = currentIteration[i].move;
          const repPen = calcRepetitionPenalty(m);
          const undo = makeMove(m);
          let s = -pvsSearch(d - 1, -beta, -alpha, enemyOwner, 1, targetSide, true) - repPen;
          unmakeMove(undo);
          currentIteration[i].score = s;
          if (isSearchTimeout) { completed = false; break; }
          if (s > alpha) alpha = s;
        }

        if (completed && !isSearchTimeout) {
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
        type: isHintRequest ? 'hintDone' : 'done',
        bestMove: confirmedBestMove || legals[0],
        allScoredMoves: scoredMoves,
        evalScore: confirmedScore,
        depth: achievedDepth,
        targetDepth,
        nodes: nodeCount,
        engineType,
        isAwakened,
        timeSpentMs: elapsed
      };
    } catch (err) {
      // 万一の例外発生時も合法手を返してタイマースタックを防止
      const fallbackLegals = genLegalMoves(params.owner || params.targetOwner || 'AI', false, false);
      return {
        type: params.isHintRequest ? 'hintDone' : 'done',
        bestMove: fallbackLegals[0] || null,
        allScoredMoves: [],
        evalScore: 0,
        depth: 1,
        targetDepth: 1,
        nodes: 1,
        engineType: params.engineType || 'kenshi',
        isAwakened: false,
        timeSpentMs: 100
      };
    }
  }

  if (typeof window !== 'undefined') {
    window.thinkShogiMoveDirect = executeSearch;
  }
  if (typeof self !== 'undefined' && typeof window === 'undefined') {
    self.onmessage = function(e) {
      const res = executeSearch(e.data);
      self.postMessage(res);
    };
  }
})(typeof self !== 'undefined' ? self : this);


