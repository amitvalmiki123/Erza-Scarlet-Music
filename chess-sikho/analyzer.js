// analyzer.js — "Coach": best move + WHY in Hinglish, alternatives,
// opponent ke expected replies with probability, threats, capture hisaab, opening plan.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'), require('./ai.js'));
  else root.ChessCoach = factory(root.ChessKit, root.ChessAI);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Kit, AI) {
  'use strict';

  const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const WORD = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
  const WORD_PL = { p: 'pawns', n: 'knights', b: 'bishops', r: 'rooks', q: 'queen', k: 'king' };
  const CENTER = [27, 28, 35, 36]; // d5, e5, d4, e4
  const other = (c) => (c === 'w' ? 'b' : 'w');
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const sqName = Kit.sqToName;

  function winProb(cp) {
    return clamp(1 / (1 + Math.pow(10, -cp / 400)), 0.02, 0.98);
  }

  function phaseOf(game) {
    const nonPawn = game.board.filter((p) => p && 'nbrqNBRQ'.includes(p)).length;
    const total = game.board.filter(Boolean).length;
    if (game.fullmove <= 7 && total >= 28) return 'opening';
    if (nonPawn <= 6 || total <= 12) return 'endgame';
    return 'middlegame';
  }

  function castleState(game, color) {
    const k = game.kingSquare(color);
    const home = color === 'w' ? [60, 62, 58] : [4, 6, 2];
    if (k === home[1]) return 'short';
    if (k === home[2]) return 'long';
    return 'none';
  }

  function developmentCount(game, color) {
    // knights + bishops jo apni back rank se nikal chuke hain
    let n = 0;
    for (let sq = 0; sq < 64; sq++) {
      const pc = game.board[sq];
      if (!pc) continue;
      const t = pc.toLowerCase();
      if (t !== 'n' && t !== 'b') continue;
      const isWhite = pc === pc.toUpperCase();
      if ((color === 'w') !== isWhite) continue;
      const homeRank = color === 'w' ? 7 : 0;
      if (sq >> 3 !== homeRank) n++;
    }
    return n;
  }

  function centerCount(game, color) {
    let n = 0;
    for (const sq of CENTER) if (game.isAttacked(sq, color)) n++;
    return n;
  }

  function flipTurnGame(game) {
    const parts = game.fen().split(' ');
    parts[1] = other(parts[1]);
    parts[3] = '-';
    return new Kit.Chess(parts.join(' '));
  }

  // Static exchange evaluation: is capture ke baad net material (centipawns)
  function seeRec(game, sq, depth) {
    if (depth > 6) return 0;
    const caps = game.legalMoves().filter((m) => m.to === sq && m.captured);
    if (!caps.length) return 0;
    let best = 0;
    for (const c of caps) {
      const gain = VAL[c.captured.toLowerCase()] || 0;
      game.makeMove(c);
      const cont = seeRec(game, sq, depth + 1);
      game.undoMove();
      best = Math.max(best, gain - Math.max(0, cont));
    }
    return best;
  }

  function seeCapture(game, move) {
    if (!move.captured) return 0;
    const g = new Kit.Chess(game.fen());
    const gain = VAL[move.captured.toLowerCase()] || 0;
    const m = g.findMove(move.from, move.to, move.promotion || 'q');
    if (!m) return 0;
    g.makeMove(m);
    const cont = seeRec(g, move.to, 0);
    return gain - Math.max(0, cont);
  }

  // Is square ka piece hang to nahi kar raha?
  function isHanging(game, sq, color) {
    const pc = game.board[sq];
    if (!pc) return false;
    const attacked = game.isAttacked(sq, other(color));
    const defended = game.isAttacked(sq, color);
    return attacked && !defended;
  }

  // Moved piece ab kaun kaun se pieces attack kar raha hai (legal captures)
  function targetsOf(gameAfterMove, sq) {
    // gameAfterMove me turn opponent ka hai — flip karke apne moves dekho
    const g = flipTurnGame(gameAfterMove);
    if (g.turn !== gameAfterMove.turn) {
      // flipTurnGame ne turn badal diya — ab wahi side chalegi jisne move kiya
    }
    const out = [];
    for (const m of g.movesFrom(sq)) {
      if (m.captured) out.push({ sq: m.to, piece: m.captured.toLowerCase(), value: VAL[m.captured.toLowerCase()] || 0 });
    }
    return out;
  }

  // Sliding piece ne kisi piece ko king/queen ke saamne pin kiya?
  function pinsFrom(gameAfterMove, sq) {
    const g = flipTurnGame(gameAfterMove);
    const pc = g.board[sq];
    if (!pc) return [];
    const t = pc.toLowerCase();
    const dirs =
      t === 'r' ? [[-1, 0], [1, 0], [0, -1], [0, 1]]
        : t === 'b' ? [[-1, -1], [-1, 1], [1, -1], [1, 1]]
          : t === 'q' ? [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]]
            : [];
    const out = [];
    const r0 = sq >> 3, f0 = sq & 7;
    for (const [dr, df] of dirs) {
      let r = r0 + dr, f = f0 + df;
      let first = null, firstSq = -1;
      while (r >= 0 && r < 8 && f >= 0 && f < 8) {
        const s = r * 8 + f;
        const p = g.board[s];
        if (p) {
          if (!first) {
            first = p; firstSq = s;
          } else {
            const pi = p.toLowerCase();
            const fi = first.toLowerCase();
            const enemyFirst = (first === first.toUpperCase()) !== (pc === pc.toUpperCase());
            const enemySecond = (p === p.toUpperCase()) !== (pc === pc.toUpperCase());
            if (enemyFirst && enemySecond && (pi === 'k' || pi === 'q') && fi !== 'k') {
              out.push({ pinnedSq: firstSq, behind: pi });
            }
            break;
          }
        }
        r += dr; f += df;
      }
    }
    return out;
  }

  function describeFacts(game, move, lastTo, lostPiece) {
    const us = game.turn;
    const them = other(us);
    const pc = game.board[move.from];
    const t = pc ? pc.toLowerCase() : 'p';
    const san = game.san(move);
    const facts = {
      san,
      piece: t,
      from: move.from,
      to: move.to,
      isCapture: !!move.captured,
      isRecapture: !!move.captured && lastTo != null && move.to === lastTo,
      lostPiece: lostPiece ? String(lostPiece).toLowerCase() : null,
      lostVal: lostPiece ? (VAL[String(lostPiece).toLowerCase()] || 0) : 0,
      net: 0,
      capturedPiece: move.captured ? move.captured.toLowerCase() : null,
      capturedValue: move.captured ? VAL[move.captured.toLowerCase()] || 0 : 0,
      see: 0,
      isCastle: move.flag === 'castleK' || move.flag === 'castleQ',
      isPromotion: !!move.promotion,
      wasInCheck: game.inCheck(),
      wasHangingBefore: isHanging(game, move.from, us),
      centerBefore: centerCount(game, us),
      devBefore: developmentCount(game, us),
      inOpening: phaseOf(game) === 'opening',
      check: false,
      mate: false,
      forkTargets: [],
      pins: [],
      hangingAfter: false,
      centerAfter: 0,
      devAfter: 0,
      rookFile: false,
      kingPawnMove: false,
      attacksQueen: false,
    };
    if (facts.isCapture) {
      facts.see = seeCapture(game, move);
      // Recapture me wo piece bhi gino jo opponent ne abhi kaata hai —
      // warna "trade" ka hisaab adhoora reh jaata hai.
      facts.net = facts.isRecapture ? facts.see - facts.lostVal : facts.see;
    }

    const clone = new Kit.Chess(game.fen());
    const m2 = clone.findMove(move.from, move.to, move.promotion || 'q');
    if (!m2) return facts;
    clone.makeMove(m2);
    facts.check = clone.inCheck();
    const st = clone.status();
    facts.mate = st === 'checkmate';
    facts.hangingAfter = isHanging(clone, move.to, us);
    facts.centerAfter = centerCount(clone, us);
    facts.devAfter = developmentCount(clone, us);
    facts.forkTargets = targetsOf(clone, move.to).filter((x) => x.value >= 300);
    facts.pins = t === 'r' || t === 'b' || t === 'q' ? pinsFrom(clone, move.to) : [];

    // Rook ko open file mili?
    if (t === 'r') {
      const file = move.to & 7;
      let pawnOnFile = false;
      for (let r = 0; r < 8; r++) {
        const p = game.board[r * 8 + file];
        if (p && p.toLowerCase() === 'p') pawnOnFile = true;
      }
      facts.rookFile = !pawnOnFile;
    }
    // King ke saamne ka pawn hila?
    const cs = castleState(game, us);
    if (t === 'p' && cs !== 'none') {
      const file = move.from & 7;
      const rank = move.from >> 3;
      const homeRank = us === 'w' ? 6 : 1;
      if (rank === homeRank && (file >= 5 || (cs === 'long' && file <= 2))) facts.kingPawnMove = true;
    }
    return facts;
  }

  function bulletsFor(game, facts, phase, opening) {
    const out = [];
    const add = (icon, text, tone) => out.push({ icon, text, tone: tone || 'good' });

    if (facts.mate) {
      add('🏁', 'Ye **checkmate** hai — game khatam! ' + facts.san, 'best');
      return out;
    }
    if (facts.isCastle) {
      add('🏰', 'Castling: king corner me safe, rook game me aa gaya. Ye opening ka sabse zaroori kaam hai.', 'best');
    }
    if (facts.isCapture) {
      const gain = Math.round(facts.see / 100 * 10) / 10;
      if (facts.isRecapture) {
        const net = Math.round(facts.net / 100 * 10) / 10;
        if (facts.net > 50) add('💰', `**${facts.san}** — wapas kaat rahe ho, aur poore exchange me tum ~+${net} aage rahoge.`, 'best');
        else if (facts.net >= -50) add('⚖️', `**${facts.san}** — recapture: jo ${WORD[facts.lostPiece] || 'piece'} tumne khoya tha, uske badle ${WORD[facts.capturedPiece]} mila. Trade barabar hai.`, 'good');
        else add('⚠️', `**${facts.san}** — recapture ke baad bhi poore trade me tum ~${Math.abs(net)} peeche rahoge.`, 'bad');
      } else if (facts.see > 50) {
        add('💰', `**${facts.san}** — ${WORD[facts.capturedPiece]} free me mil raha hai (exchange ke baad ~+${gain}).`, 'best');
      } else if (facts.see >= -30) {
        add('⚖️', `**${facts.san}** — barabar trade: ${WORD[facts.capturedPiece]} ke badle tumhara ${WORD[facts.piece]}. Position khulti hai.`, 'good');
      } else {
        add('⚠️', `**${facts.san}** se nuksan hoga (~${gain}) — recapture ke baad tum kamzor reh jaoge.`, 'bad');
      }
    }
    if (facts.mate) return out;
    if (facts.forkTargets.length >= 2) {
      const names = facts.forkTargets.map((x) => WORD_PL[x.piece]).join(' aur ');
      add('🍴', `**Fork!** Ek hi piece se ${names} dono pe attack — wo ek hi bacha sakta hai.`, 'best');
    }
    if (facts.check && !facts.mate) add('👑', 'Check de rahe ho — opponent ko majboori me jawab dena padega (tempo tumhare paas).', 'good');
    if (facts.pins.length) {
      const p = facts.pins[0];
      add('📌', `**Pin** — ${sqName(p.pinnedSq)} ka piece hil nahi sakta, kyunki uske peeche ${p.behind === 'k' ? 'king' : 'queen'} hai.`, 'good');
    }
    if (facts.wasInCheck) add('🛡️', 'Tum check me the — ye chaal check se bacha leti hai.', 'good');
    if (facts.wasHangingBefore && !facts.hangingAfter) add('🚑', 'Tumhara piece attack me tha — ye chaal usko bacha leti hai.', 'good');

    if (!facts.isCapture && !facts.isCastle && facts.inOpening) {
      if (facts.devAfter > facts.devBefore) add('🚀', `Naya piece develop ho gaya (${facts.san}) — ab tumhare zyada pieces game me hain.`, 'good');
      if (facts.centerAfter > facts.centerBefore) add('🎯', 'Center pe control badha — center wale pieces har taraf dekhte hain.', 'good');
    } else if (!facts.isCapture && !facts.isCastle) {
      if (facts.centerAfter > facts.centerBefore) add('🎯', 'Center pe control badha — isse opponent ke pieces kam active rehte hain.', 'good');
      if (facts.rookFile) add('🗼', 'Rook ko **open file** mil gayi — sabse active jagah.', 'good');
    }
    if (facts.hangingAfter) add('⚠️', `Dhyaan do: ${sqName(facts.to)} ka piece ab attack ho sakta hai aur defend nahi hai — opponent kaat sakta hai.`, 'bad');
    if (facts.kingPawnMove) add('⚠️', 'Castled king ke saamne ka pawn hila diya — king ki dhaal kamzor hui.', 'bad');

    // Plan ke hisaab se generic line
    const plan = phasePlan(game, phase, opening);
    if (out.length < 3 && plan.length) add('🧭', plan[0], 'info');
    if (out.length === 0) add('🧭', 'Ye position sudhaarne wali quiet chaal hai — piece ko behtar square pe la rahe ho.', 'info');
    return out.slice(0, 4);
  }

  function phasePlan(game, phase, opening) {
    const tips = [];
    const us = game.turn;
    const cs = castleState(game, us);
    const dev = developmentCount(game, us);
    if (phase === 'opening') {
      if (cs === 'none' && game.inCheck() === false) tips.push('Opening me priority: **castle** karo, phir hi attack sochna.');
      if (dev < 3) tips.push('Apne knights/bishops jaldi nikaalo — ghar pe baithe pieces kuch nahi karte.');
      tips.push('Center pe pawn rakho (e4/d4 ya e5/d5) — bina center ke attack nahi banta.');
      if (opening && opening.plan) tips.push(opening.plan[0]);
    } else if (phase === 'middlegame') {
      tips.push('Har move se pehle: **check, capture, threat** — teeno dekho.');
      tips.push('Open file pe rook lao, aur apne king ke aas paas ke pawns ko mat hilao.');
      tips.push('Opponent ke kamzor square pe (jaise outpost) knight/bishop rakho.');
    } else {
      tips.push('Endgame me **king ko center** lao — wo ek strong piece ban jaata hai.');
      tips.push('Passed pawn ko push karo, apne king ke support se.');
      tips.push('Rook ko apne pawn ke **peeche** rakho.');
    }
    return tips;
  }

  /**
   * Tumhare kaun se pieces abhi "hanging" hain (attack ho rahe, defend nahi)
   * ya saste piece se attack ho rahe (nuksaan ka trade).
   */
  function hangingPieces(game, color) {
    const out = [];
    const foe = other(color);
    const foeMoves = game.legalMovesFor ? null : null;
    // opponent ke legal moves se attacker ka pata lagao (value ke liye)
    let attackerValues = null;
    try {
      const flipped = flipTurnGame(game);
      attackerValues = {};
      for (const m of flipped.legalMoves()) {
        if (!m.captured) continue;
        const fromPc = game.board[m.from];
        const v = fromPc ? VAL[fromPc.toLowerCase()] || 0 : 0;
        const key = m.to;
        if (attackerValues[key] === undefined || v < attackerValues[key]) attackerValues[key] = v;
      }
    } catch (e) { attackerValues = null; }

    for (let sq = 0; sq < 64; sq++) {
      const pc = game.board[sq];
      if (!pc) continue;
      const isWhite = pc === pc.toUpperCase();
      if ((color === 'w') !== isWhite) continue;
      const t = pc.toLowerCase();
      if (t === 'k') continue;
      const val = VAL[t] || 0;
      const attacked = game.isAttacked(sq, foe);
      if (!attacked) continue;
      const defended = game.isAttacked(sq, color);
      const cheapest = attackerValues && attackerValues[sq] !== undefined ? attackerValues[sq] : null;
      if (!defended) {
        out.push({ sq, piece: t, value: val, kind: 'free', text: `${sqName(sq)} ka ${WORD[t]} bilkul free hai — koi defend nahi kar raha.` });
      } else if (cheapest !== null && cheapest < val - 20) {
        out.push({ sq, piece: t, value: val, kind: 'badtrade', text: `${sqName(sq)} ka ${WORD[t]} saste piece (${WORD_BY_VAL(cheapest)}) se attack ho raha hai — trade me nuksan.` });
      }
    }
    out.sort((a, b) => b.value - a.value);
    return out;
  }

  function WORD_BY_VAL(v) {
    if (v >= 900) return 'queen';
    if (v >= 500) return 'rook';
    if (v >= 330) return 'bishop';
    if (v >= 320) return 'knight';
    return 'pawn';
  }

  // Agar hamari chaal na ho (pass), opponent kya karega?
  function threatsAgainst(game) {
    let flipped;
    try {
      flipped = flipTurnGame(game);
    } catch (e) {
      return [];
    }
    const us = game.turn;
    const out = [];
    let moves = [];
    try {
      moves = flipped.legalMoves();
    } catch (e) {
      return [];
    }
    for (const m of moves) {
      if (m.captured) {
        const v = VAL[m.captured.toLowerCase()] || 0;
        if (v >= 300) {
          const gain = seeCapture(flipped, m);
          if (gain > 50) {
            const san = flipped.san(m);
            out.push({
              severity: Math.min(3, Math.round(v / 300)),
              text: `...${san} — tumhara ${WORD[m.captured.toLowerCase()]} kha sakta hai (approx +${(gain / 100).toFixed(1)}).`,
            });
          }
        }
      } else {
        const san = flipped.san(m);
        if (san.includes('#')) {
          out.push({ severity: 3, text: `...${san} — opponent ke paas mate ka idea hai!` });
        } else if (san.includes('+') && game.inCheck() === false) {
          out.push({ severity: 1, text: `...${san} — check de sakta hai, jawab taiyaar rakho.` });
        }
      }
    }
    // Apne bina defend wale pieces (agar upar se kuch na mila)
    if (!out.length) {
      for (let sq = 0; sq < 64; sq++) {
        const pc = game.board[sq];
        if (!pc) continue;
        const isWhite = pc === pc.toUpperCase();
        if ((us === 'w') !== isWhite) continue;
        if (pc.toLowerCase() === 'k') continue;
        if (isHanging(game, sq, us) && (VAL[pc.toLowerCase()] || 0) >= 300) {
          out.push({ severity: 2, text: `${sqName(sq)} ka ${WORD[pc.toLowerCase()]} akela hai — opponent kaat sakta hai.` });
        }
      }
    }
    out.sort((a, b) => b.severity - a.severity);
    return out.slice(0, 3);
  }

  function captureAdvice(game) {
    const caps = game.legalMoves().filter((m) => m.captured);
    if (!caps.length) return [];
    const res = caps.map((m) => {
      const val = seeCapture(game, m);
      return {
        san: game.san(m),
        see: val,
        verdict: val > 50 ? 'lena chahiye' : val >= -30 ? 'barabar' : 'lena nuksan',
      };
    });
    res.sort((a, b) => b.see - a.see);
    return res.slice(0, 3);
  }

  function matchOpening(sans, turn) {
    const book = (typeof window !== 'undefined' ? window.OPENINGS : global.OPENINGS) || [];
    const list = sans || [];
    let reached = null;   // line poori khel chuke
    let partial = null;   // line abhi ban rahi hai
    for (const entry of book) {
      const mv = entry.moves;
      let matched = 0;
      while (matched < mv.length && matched < list.length && mv[matched] === list[matched]) matched++;
      if (matched === 0) continue;
      if (matched < list.length) continue; // history line se aage nikal gayi
      const prio = entry.priority || 50;
      if (matched >= mv.length) {
        // poori line khel chuki — jo zyada specific ho (lamba matched) wahi
        if (!reached || matched > reached.matched || (matched === reached.matched && prio > (reached.entry.priority || 50))) {
          reached = { entry, matched };
        }
      } else if (entry.for === turn) {
        // abhi line ban rahi hai — sirf us side ko dikhao jiski chaal hai
        if (!partial || matched > partial.matched || (matched === partial.matched && prio > (partial.entry.priority || 50))) {
          partial = { entry, matched };
        }
      }
    }
    if (reached) return { entry: reached.entry, matched: reached.matched, reached: true };
    if (partial) return { entry: partial.entry, matched: partial.matched, reached: false };
    return null;
  }

  function describeReply(gameAfterBest, ranked, prob) {
    const san = ranked.san;
    const move = ranked.move;
    let note;
    if (move.captured) note = `${WORD[move.captured.toLowerCase()]} capture karne ki koshish`;
    else if (san.includes('#')) note = 'mate ki dhamki!';
    else if (san.includes('+')) note = 'check de raha hai';
    else if (move.flag === 'castleK' || move.flag === 'castleQ') note = 'apni king safety (castle)';
    else if (move.promotion) note = 'pawn promote kar raha hai';
    else if (['n', 'b'].includes((gameAfterBest.board[move.from] || 'p').toLowerCase())) note = 'piece develop kar raha hai';
    else note = 'position sudhaar raha hai';

    // hamara jawab
    let answer = null;
    try {
      const clone = new Kit.Chess(gameAfterBest.fen());
      const m = clone.findMove(move.from, move.to, move.promotion || 'q');
      clone.makeMove(m);
      const best = AI.bestMove(clone, 2, { maxNodes: 18000 });
      if (best) {
        const replySan = clone.san(best.move);
        let why = '';
        try {
          const f = describeFacts(clone, best.move, move.to, move.captured || null);
          const bl = bulletsFor(clone, f, phaseOf(clone), null);
          const good = bl.filter((b) => b.tone !== 'bad');
          why = good.length ? stripMd(good[0].text) : '';
        } catch (e) { why = ''; }
        answer = {
          san: replySan,
          why,
          note: move.captured ? 'wapas kaat lo — material barabar karo.'
            : san.includes('+') ? 'check se bacho: king hatao, block karo ya attacker ko maaro.'
              : why || 'iske saath apna plan continue karo.',
        };
      }
    } catch (e) { answer = null; }
    return { san, prob, note, answer, score: ranked.score };
  }

  function homeRankOf(color) { return color === 'w' ? 7 : 0; }

  // Opening me beginner-friendly preference: center, develop, castle.
  // Sirf tab lagta hai jab engine ke top moves ka farq chhota ho (tactics jeette hain).
  function teachingBonus(game, m, phase) {
    if (phase !== 'opening') return 0;
    const us = game.turn;
    const pc = game.board[m.from];
    if (!pc) return 0;
    const t = pc.toLowerCase();
    const toR = m.to >> 3, toF = m.to & 7;
    const fromR = m.from >> 3;
    let bonus = 0;
    if (m.flag === 'castleK' || m.flag === 'castleQ') bonus += 30;
    else if (t === 'p') {
      const centerFile = toF >= 3 && toF <= 4;
      const forward = us === 'w' ? toR < fromR : toR > fromR;
      if (centerFile && forward) bonus += 22;
      else if (toF === 0 || toF === 7) bonus -= 12;
      else bonus += 4;
    } else if (t === 'n' || t === 'b') {
      if (fromR === homeRankOf(us)) bonus += 18;      // ghar se nikla = develop
      else bonus -= 10;                                // already moved piece
      if (CENTER.includes(m.to)) bonus += 6;
    } else if (t === 'q') {
      bonus -= (game.fullmove <= 6 ? 18 : 6);          // queen jaldi mat nikaalo
    } else if (t === 'r') {
      const file = m.to & 7;
      let pawnOnFile = false;
      for (let r = 0; r < 8; r++) {
        const p = game.board[r * 8 + file];
        if (p && p.toLowerCase() === 'p') pawnOnFile = true;
      }
      if (!pawnOnFile) bonus += 8;
    } else if (t === 'k') {
      bonus -= 16;                                     // opening me king mat hilao
    }
    return bonus;
  }

  function applyTeaching(game, ranked, phase) {
    if (phase !== 'opening' || ranked.length < 2) return ranked;
    const top = ranked[0].score;
    const WINDOW = 60;
    const adj = ranked.map((r) => ({
      ...r,
      rawScore: r.score,
      score: r.score + teachingBonus(game, r.move, phase),
    }));
    // sirf jo engine ke top ke kareeb hain unhi me preference lagao
    const pool = adj.filter((r) => top - r.rawScore <= WINDOW);
    const rest = adj.filter((r) => top - r.rawScore > WINDOW);
    pool.sort((a, b) => b.score - a.score);
    return pool.concat(rest);
  }

  function analyze(game, opts = {}) {
    const depth = opts.depth || 3;
    const maxNodes = opts.maxNodes || 60000;
    const phase = phaseOf(game);
    let sans = opts.sanHistory;
    if (!sans) {
      try { sans = game.sanHistory ? game.sanHistory() : []; } catch (e) { sans = []; }
    }
    const openingMatch = matchOpening(sans || [], game.turn);
    const opening = openingMatch ? openingMatch.entry : null;

    let ranked = [];
    try {
      ranked = AI.rankMoves(game, depth, { maxNodes });
      if (opts.teaching !== false) ranked = applyTeaching(game, ranked, phase);
    } catch (e) { ranked = []; }

    const bookNext = openingMatch && !openingMatch.reached
      ? openingMatch.entry.moves.slice(openingMatch.matched)
      : [];

    const result = {
      fen: game.fen(),
      phase,
      opening: opening ? {
        name: opening.name, idea: opening.idea, plan: opening.plan, trap: opening.trap,
        for: opening.for, reached: !!(openingMatch && openingMatch.reached),
        nextMoves: bookNext,
      } : null,
      sans: sans || [],
      best: null,
      alts: [],
      replies: [],
      threats: [],
      captures: [],
      plan: phasePlan(game, phase, opening),
      myWinProb: 0.5,
      status: game.status(),
      depth,
    };

    // Pehli chaal ke liye alag guide (opening book me single-move lines nahi hain)
    // Sirf tab jab sach me game ki pehli chaal ho (history empty), warna
    // bina-history ke test/analysis positions pe galat guide lag jaata hai.
    const FMG = (typeof window !== 'undefined' ? window.FIRST_MOVE_GUIDE : global.FIRST_MOVE_GUIDE) || null;
    const freshGame = (!sans || !sans.length)
      && (!game.history || game.history.length === 0)
      && game.fen().indexOf('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR') === 0;
    if (FMG && freshGame) {
      const g = FMG[game.turn];
      if (g) result.firstMove = g;
    }

    if (!ranked.length) {
      result.over = true;
      return result;
    }

    // Agar engine ke top moves barabar hain aur book/first-move guide ek specific chaal
    // suggest karta hai, to usi ko aage rakho — beginner ko clear direction milta hai.
    // Book / first-move guide ki suggestion ko priority do (window thodi wide —
    // crude eval opening me exact nahi hota, aur beginner ko clear line chahiye).
    const suggestList =
      (result.firstMove && result.firstMove.best) ||
      (bookNext.length ? [bookNext[0]] : []) ||
      [];
    if (suggestList.length) {
      const topScore = ranked[0].score;
      const WINDOW = 110;
      for (const san of suggestList) {
        const pick = ranked.find((r) => r.san === san);
        if (pick && topScore - pick.score <= WINDOW) {
          if (pick !== ranked[0]) ranked = [pick].concat(ranked.filter((r) => r !== pick));
          break;
        }
      }
    }

    const top = ranked[0];
    const facts = describeFacts(game, top.move, opts.lastMoveTo != null ? opts.lastMoveTo : null, opts.lastCaptured || null);
    result.best = {
      san: top.san,
      score: top.score,
      winProb: winProb(top.score),
      why: bulletsFor(game, facts, phase, opening),
      move: { from: top.move.from, to: top.move.to, promotion: top.move.promotion || null },
      mateIn: facts.mate ? 1 : null,
    };
    result.myWinProb = winProb(top.score);
    result.evalCp = top.score;

    // Opening book wali chaal ho to sabse pehle wahi batao
    if (bookNext.length && top.san === bookNext[0] && opening) {
      result.best.why.unshift({
        icon: '📖',
        text: `Ye **${opening.name}** ki standard chaal hai. ${opening.idea}`,
        tone: 'book',
      });
      result.best.fromBook = true;
    }
    if (result.firstMove && result.firstMove.best.includes(top.san)) {
      result.best.why.unshift({ icon: '📖', text: result.firstMove.text, tone: 'book' });
      result.best.fromBook = true;
    }

    result.alts = ranked.slice(1, 4).map((r) => ({
      san: r.san,
      score: r.score,
      winProb: winProb(r.score),
      gap: top.score - r.score,
      move: { from: r.move.from, to: r.move.to, promotion: r.move.promotion || null },
    }));

    // Opponent ke expected replies (probabilities)
    try {
      const after = new Kit.Chess(game.fen());
      const m = after.findMove(top.move.from, top.move.to, top.move.promotion || 'q');
      after.makeMove(m);
      if (after.status() !== 'checkmate' && after.status() !== 'stalemate') {
        const rep = AI.rankMoves(after, Math.max(2, depth - 1), { maxNodes: Math.round(maxNodes * 0.55) });
        const topN = rep.slice(0, 5);
        const T = 150;
        const cs = topN.map((r) => clamp(r.score, -900, 900));
        const mx = Math.max(...cs);
        const exps = cs.map((s) => Math.exp((s - mx) / T));
        const sum = exps.reduce((a, b) => a + b, 0);
        const withProb = topN.map((r, i) => ({ ...r, prob: exps[i] / sum }));
        result.replies = withProb.slice(0, 3).map((r) => describeReply(after, r, r.prob));
        // probabilities ko 100% me normalize karo (sirf dikhaye gaye moves)
        const psum = result.replies.reduce((a, r) => a + r.prob, 0) || 1;
        result.replies.forEach((r) => { r.prob = r.prob / psum; });
      }
    } catch (e) { /* ignore */ }

    result.threats = threatsAgainst(game);
    result.captures = captureAdvice(game);
    try {
      result.hanging = hangingPieces(game, game.turn).slice(0, 3);
    } catch (e) {
      result.hanging = [];
    }

    // Voice script
    const b = result.best;
    const parts = [];
    parts.push(`Sabse achhi chaal hai ${speakable(b.san)}.`);
    const why = b.why.filter((w) => w.tone !== 'bad').slice(0, 2).map((w) => stripMd(w.text));
    if (why.length) parts.push(why.join(' '));
    if (result.threats.length) parts.push('Dhyaan rakho: ' + stripMd(result.threats[0].text));
    if (result.replies.length) {
      const r = result.replies[0];
      parts.push(`${Math.round(r.prob * 100)} percent chance hai ki wo ${speakable(r.san)} khelega` +
        (r.answer ? `, tab tum ${speakable(r.answer.san)} chalo.` : '.'));
    }
    result.spoken = parts.join(' ');
    return result;
  }

  function stripMd(s) {
    return String(s).replace(/\*\*/g, '').replace(/`/g, '').replace(/#/g, ' mate ');
  }

  function speakable(san) {
    // TTS ke liye SAN ko bolne layak banao
    return String(san)
      .replace(/^O-O-O/, 'long castle')
      .replace(/^O-O/, 'short castle')
      .replace(/N/g, 'knight ')
      .replace(/B/g, 'bishop ')
      .replace(/R/g, 'rook ')
      .replace(/Q/g, 'queen ')
      .replace(/K/g, 'king ')
      .replace(/x/g, ' takes ')
      .replace(/\+/g, ' check ')
      .replace(/#/g, ' checkmate ')
      .replace(/=/g, ' promote to ')
      .replace(/([a-h])([1-8])/g, '$1 $2');
  }

  return {
    analyze,
    hangingPieces,
    applyTeaching,
    teachingBonus,
    winProb,
    phaseOf,
    threatsAgainst,
    captureAdvice,
    seeCapture,
    castleState,
    developmentCount,
    centerCount,
    matchOpening,
    speakable,
    stripMd,
  };
});
