// ai.js — simple alpha-beta bot with piece-square tables. Beginner-friendly levels.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./engine.js'));
  else root.ChessAI = factory(root.ChessKit);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Kit) {
  'use strict';

  // Piece-square tables (white perspective, index 0 = a8). Values in centipawns.
  const PAWN = [
    0, 0, 0, 0, 0, 0, 0, 0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
    5, 5, 10, 25, 25, 10, 5, 5,
    0, 0, 0, 20, 20, 0, 0, 0,
    5, -5, -10, 0, 0, -10, -5, 5,
    5, 10, 10, -20, -20, 10, 10, 5,
    0, 0, 0, 0, 0, 0, 0, 0,
  ];
  const KNIGHT = [
    -50, -40, -30, -30, -30, -30, -40, -50,
    -40, -20, 0, 0, 0, 0, -20, -40,
    -30, 0, 10, 15, 15, 10, 0, -30,
    -30, 5, 15, 20, 20, 15, 5, -30,
    -30, 0, 15, 20, 20, 15, 0, -30,
    -30, 5, 10, 15, 15, 10, 5, -30,
    -40, -20, 0, 5, 5, 0, -20, -40,
    -50, -40, -30, -30, -30, -30, -40, -50,
  ];
  const BISHOP = [
    -20, -10, -10, -10, -10, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 10, 10, 5, 0, -10,
    -10, 5, 5, 10, 10, 5, 5, -10,
    -10, 0, 10, 10, 10, 10, 0, -10,
    -10, 10, 10, 10, 10, 10, 10, -10,
    -10, 5, 0, 0, 0, 0, 5, -10,
    -20, -10, -10, -10, -10, -10, -10, -20,
  ];
  const ROOK = [
    0, 0, 0, 0, 0, 0, 0, 0,
    5, 10, 10, 10, 10, 10, 10, 5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    -5, 0, 0, 0, 0, 0, 0, -5,
    0, 0, 0, 5, 5, 0, 0, 0,
  ];
  const QUEEN = [
    -20, -10, -10, -5, -5, -10, -10, -20,
    -10, 0, 0, 0, 0, 0, 0, -10,
    -10, 0, 5, 5, 5, 5, 0, -10,
    -5, 0, 5, 5, 5, 5, 0, -5,
    0, 0, 5, 5, 5, 5, 0, -5,
    -10, 5, 5, 5, 5, 5, 0, -10,
    -10, 0, 5, 0, 0, 0, 0, -10,
    -20, -10, -10, -5, -5, -10, -10, -20,
  ];
  const KING_MID = [
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -30, -40, -40, -50, -50, -40, -40, -30,
    -20, -30, -30, -40, -40, -30, -30, -20,
    -10, -20, -20, -20, -20, -20, -20, -10,
    20, 20, 0, 0, 0, 0, 20, 20,
    20, 30, 10, 0, 0, 10, 30, 20,
  ];
  const KING_END = [
    -50, -40, -30, -20, -20, -30, -40, -50,
    -30, -20, -10, 0, 0, -10, -20, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 30, 40, 40, 30, -10, -30,
    -30, -10, 20, 30, 30, 20, -10, -30,
    -30, -30, 0, 0, 0, 0, -30, -30,
    -50, -30, -30, -30, -30, -30, -30, -50,
  ];

  const TABLES = { p: PAWN, n: KNIGHT, b: BISHOP, r: ROOK, q: QUEEN, k: KING_MID };
  const VALUES = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const MATE = 100000;

  function evaluate(game) {
    const board = game.board;
    let material = 0;
    const counts = { w: 0, b: 0 };
    for (const pc of board) if (pc) counts[pc === pc.toUpperCase() ? 'w' : 'b'] += VALUES[pc.toLowerCase()] || 0;
    const endgame = counts.w + counts.b < 2600;
    let score = 0;
    for (let sq = 0; sq < 64; sq++) {
      const pc = board[sq];
      if (!pc) continue;
      const white = pc === pc.toUpperCase();
      const t = pc.toLowerCase();
      const table = t === 'k' ? (endgame ? KING_END : KING_MID) : TABLES[t];
      const idx = white ? sq : 63 - sq;
      const v = (VALUES[t] || 0) + table[idx];
      score += white ? v : -v;
    }
    return score;
  }

  function moveScore(m) {
    let s = 0;
    if (m.captured) s += 10 * (VALUES[m.captured.toLowerCase()] || 0) - (VALUES[(m.piece || 'p').toLowerCase()] || 0);
    if (m.promotion) s += VALUES[m.promotion] || 0;
    if (m.flag === 'castleK' || m.flag === 'castleQ') s += 60;
    return s;
  }

  function orderMoves(moves) {
    return moves
      .map((m) => ({ m, s: moveScore(m) }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.m);
  }

  function quiesce(game, alpha, beta, side) {
    const stand = evaluate(game) * side;
    if (stand >= beta) return beta;
    if (alpha < stand) alpha = stand;
    const captures = orderMoves(game.legalMoves().filter((m) => m.captured || m.promotion));
    for (const m of captures) {
      game.makeMove(m);
      const score = -quiesce(game, -beta, -alpha, -side);
      game.undoMove();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  function search(game, depth, alpha, beta, side, ctx) {
    ctx.nodes++;
    if (ctx.nodes > ctx.maxNodes) return evaluate(game) * side;
    const moves = game.legalMoves();
    if (moves.length === 0) {
      if (game.inCheck()) return -MATE + ctx.ply;
      return 0;
    }
    if (depth === 0) return quiesce(game, alpha, beta, side);
    if (game.halfmove >= 100) return 0;

    for (const m of orderMoves(moves)) {
      game.makeMove(m);
      ctx.ply++;
      const score = -search(game, depth - 1, -beta, -alpha, -side, ctx);
      ctx.ply--;
      game.undoMove();
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  }

  /**
   * Level: 1 = naya, 2 = sikhne wala, 3 = theek, 4 = club player.
   * Returns { move, score, thinkMs }.
   */
  function chooseMove(game, level = 2, options = {}) {
    const started = Date.now();
    const levels = {
      1: { depth: 1, blunder: 0.55, jitter: 120 },
      2: { depth: 2, blunder: 0.28, jitter: 70 },
      3: { depth: 3, blunder: 0.08, jitter: 25 },
      4: { depth: 4, blunder: 0, jitter: 0 },
    };
    const cfg = levels[level] || levels[2];
    const rootMoves = game.legalMoves();
    if (!rootMoves.length) return { move: null, score: 0, thinkMs: 0 };

    // Level 1: mostly random, thoda sa capture preference.
    if (cfg.blunder > 0 && Math.random() < cfg.blunder) {
      const pool = rootMoves.filter((m) => m.captured);
      const list = pool.length && Math.random() < 0.7 ? pool : rootMoves;
      return { move: list[Math.floor(Math.random() * list.length)], score: 0, thinkMs: Date.now() - started };
    }

    const side = game.turn === 'w' ? 1 : -1;
    const ctx = { nodes: 0, maxNodes: options.maxNodes || 90000, ply: 0 };
    let best = null;
    let bestScore = -Infinity;
    const ordered = orderMoves(rootMoves);
    for (const m of ordered) {
      game.makeMove(m);
      ctx.ply = 1;
      let score = -search(game, cfg.depth - 1, -Infinity, Infinity, -side, ctx);
      ctx.ply = 0;
      game.undoMove();
      score += (Math.random() - 0.5) * 2 * cfg.jitter;
      if (score > bestScore) {
        bestScore = score;
        best = m;
      }
    }
    return { move: best, score: bestScore, thinkMs: Date.now() - started, nodes: ctx.nodes };
  }

  return { chooseMove, evaluate, LEVELS: {
    1: { name: 'Naya khiladi', emoji: '🐣', hint: 'Galtiyaan karega — jeetna aasan hai' },
    2: { name: 'Sikhne wala', emoji: '🙂', hint: 'Basic tactics khelta hai' },
    3: { name: 'Theek-thaak', emoji: '😎', hint: '3 chaal aage sochta hai' },
    4: { name: 'Club player', emoji: '🔥', hint: 'Mushkil — dhyaan se khelo' },
  } };
});
