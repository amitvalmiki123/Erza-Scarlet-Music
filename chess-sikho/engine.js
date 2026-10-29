// engine.js — complete chess rules (castling, en passant, promotion, draws).
// Classic script: browser me window.ChessKit, Node me require() se milta hai.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChessKit = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Chess engine — poore rules ke saath (castling, en passant, promotion, draw rules).
  // Board: 64 squares, index 0 = a8 ... 63 = h1. White (uppercase) neeche se khelta hai.

  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const FILES = 'abcdefgh';

  const sqToName = (sq) => FILES[sq & 7] + (8 - (sq >> 3));
  const nameToSq = (name) => {
    const f = FILES.indexOf(name[0]);
    const r = 8 - parseInt(name[1], 10);
    if (f < 0 || !(r >= 0 && r < 8)) throw new Error('Bad square: ' + name);
    return r * 8 + f;
  };

  const isWhitePiece = (pc) => pc === pc.toUpperCase();
  const colorOf = (pc) => (isWhitePiece(pc) ? 'w' : 'b');
  const other = (c) => (c === 'w' ? 'b' : 'w');

  const KNIGHT_DIRS = [[-2, -1], [-2, 1], [-1, -2], [-1, 2], [1, -2], [1, 2], [2, -1], [2, 1]];
  const BISHOP_DIRS = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const ROOK_DIRS = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const KING_DIRS = [...BISHOP_DIRS, ...ROOK_DIRS];

  const PIECE_VALUE = { p: 1, n: 3, b: 3.2, r: 5, q: 9, k: 0 };

  class Chess {
    constructor(fen = START_FEN) {
      this.load(fen);
      this.history = [];
    }

    load(fen) {
      const parts = String(fen).trim().split(/\s+/);
      if (parts.length < 4) throw new Error('Invalid FEN');
      const rows = parts[0].split('/');
      if (rows.length !== 8) throw new Error('Invalid FEN: 8 ranks chahiye');
      const board = new Array(64).fill(null);
      for (let r = 0; r < 8; r++) {
        let f = 0;
        for (const ch of rows[r]) {
          if (ch >= '1' && ch <= '8') f += Number(ch);
          else if ('pnbrqkPNBRQK'.includes(ch)) {
            if (f > 7) throw new Error('Invalid FEN row');
            board[r * 8 + f] = ch;
            f++;
          } else throw new Error('Invalid FEN char: ' + ch);
        }
        if (f !== 8) throw new Error('Invalid FEN: rank ' + (8 - r) + ' me 8 squares nahi hain');
      }
      this.board = board;
      this.turn = parts[1] === 'b' ? 'b' : 'w';
      const rights = parts[2] || '-';
      this.castling = {
        wK: rights.includes('K'),
        wQ: rights.includes('Q'),
        bK: rights.includes('k'),
        bQ: rights.includes('q'),
      };
      this.ep = parts[3] && parts[3] !== '-' ? nameToSq(parts[3]) : -1;
      this.halfmove = Number(parts[4] || 0) || 0;
      this.fullmove = Number(parts[5] || 1) || 1;
      return this;
    }

    fen() {
      let rows = [];
      for (let r = 0; r < 8; r++) {
        let row = '';
        let empty = 0;
        for (let f = 0; f < 8; f++) {
          const pc = this.board[r * 8 + f];
          if (!pc) empty++;
          else {
            if (empty) { row += empty; empty = 0; }
            row += pc;
          }
        }
        if (empty) row += empty;
        rows.push(row);
      }
      let rights = '';
      if (this.castling.wK) rights += 'K';
      if (this.castling.wQ) rights += 'Q';
      if (this.castling.bK) rights += 'k';
      if (this.castling.bQ) rights += 'q';
      return [
        rows.join('/'),
        this.turn,
        rights || '-',
        this.ep >= 0 ? sqToName(this.ep) : '-',
        this.halfmove,
        this.fullmove,
      ].join(' ');
    }

    pieceAt(sq) {
      return this.board[sq] || null;
    }

    kingSquare(color) {
      const target = color === 'w' ? 'K' : 'k';
      for (let sq = 0; sq < 64; sq++) if (this.board[sq] === target) return sq;
      return -1;
    }

    isAttacked(sq, by) {
      const b = this.board;
      const f = sq & 7;
      const r = sq >> 3;

      // Pawn attacks
      const pawnRow = by === 'w' ? r + 1 : r - 1;
      if (pawnRow >= 0 && pawnRow < 8) {
        const pawn = by === 'w' ? 'P' : 'p';
        if (f > 0 && b[pawnRow * 8 + f - 1] === pawn) return true;
        if (f < 7 && b[pawnRow * 8 + f + 1] === pawn) return true;
      }
      // Knight
      const knight = by === 'w' ? 'N' : 'n';
      for (const [dr, df] of KNIGHT_DIRS) {
        const nr = r + dr, nf = f + df;
        if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8 && b[nr * 8 + nf] === knight) return true;
      }
      // King
      const king = by === 'w' ? 'K' : 'k';
      for (const [dr, df] of KING_DIRS) {
        const nr = r + dr, nf = f + df;
        if (nr >= 0 && nr < 8 && nf >= 0 && nf < 8 && b[nr * 8 + nf] === king) return true;
      }
      // Sliding: rook / queen
      const rook = by === 'w' ? 'R' : 'r';
      const bishop = by === 'w' ? 'B' : 'b';
      const queen = by === 'w' ? 'Q' : 'q';
      for (const [dr, df] of ROOK_DIRS) {
        let nr = r + dr, nf = f + df;
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const pc = b[nr * 8 + nf];
          if (pc) {
            if (pc === rook || pc === queen) return true;
            break;
          }
          nr += dr; nf += df;
        }
      }
      for (const [dr, df] of BISHOP_DIRS) {
        let nr = r + dr, nf = f + df;
        while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
          const pc = b[nr * 8 + nf];
          if (pc) {
            if (pc === bishop || pc === queen) return true;
            break;
          }
          nr += dr; nf += df;
        }
      }
      return false;
    }

    inCheck(color = this.turn) {
      const k = this.kingSquare(color);
      if (k < 0) return false;
      return this.isAttacked(k, other(color));
    }

    // Pseudo-legal moves (king safety check nahi).
    pseudoMoves() {
      const moves = [];
      const us = this.turn;
      const them = other(us);
      const b = this.board;
      const push = (m) => moves.push(m);

      for (let sq = 0; sq < 64; sq++) {
        const pc = b[sq];
        if (!pc || colorOf(pc) !== us) continue;
        const t = pc.toLowerCase();
        const r = sq >> 3;
        const f = sq & 7;

        if (t === 'p') {
          const dir = us === 'w' ? -1 : 1;
          const startRow = us === 'w' ? 6 : 1;
          const promoRow = us === 'w' ? 0 : 7;
          const oneR = r + dir;
          if (oneR >= 0 && oneR < 8) {
            const one = oneR * 8 + f;
            if (!b[one]) {
              if (oneR === promoRow) {
                for (const p of ['q', 'r', 'b', 'n']) push({ from: sq, to: one, promotion: p, flag: 'promo' });
              } else {
                push({ from: sq, to: one, flag: 'normal' });
                const twoR = r + dir * 2;
                if (r === startRow && !b[twoR * 8 + f]) {
                  push({ from: sq, to: twoR * 8 + f, flag: 'double' });
                }
              }
            }
            for (const df of [-1, 1]) {
              const nf = f + df;
              if (nf < 0 || nf > 7) continue;
              const to = oneR * 8 + nf;
              const target = b[to];
              if (target && colorOf(target) === them) {
                if (oneR === promoRow) {
                  for (const p of ['q', 'r', 'b', 'n']) push({ from: sq, to, captured: target, promotion: p, flag: 'promo' });
                } else push({ from: sq, to, captured: target, flag: 'normal' });
              } else if (!target && to === this.ep) {
                push({ from: sq, to, captured: us === 'w' ? 'p' : 'P', flag: 'ep' });
              }
            }
          }
          continue;
        }

        if (t === 'n' || t === 'k') {
          const dirs = t === 'n' ? KNIGHT_DIRS : KING_DIRS;
          for (const [dr, df] of dirs) {
            const nr = r + dr, nf = f + df;
            if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
            const to = nr * 8 + nf;
            const target = b[to];
            if (target && colorOf(target) === us) continue;
            push({ from: sq, to, captured: target || null, flag: 'normal' });
          }
          continue;
        }

        const dirs = t === 'r' ? ROOK_DIRS : t === 'b' ? BISHOP_DIRS : KING_DIRS;
        for (const [dr, df] of dirs) {
          let nr = r + dr, nf = f + df;
          while (nr >= 0 && nr < 8 && nf >= 0 && nf < 8) {
            const to = nr * 8 + nf;
            const target = b[to];
            if (target) {
              if (colorOf(target) === them) push({ from: sq, to, captured: target, flag: 'normal' });
              break;
            }
            push({ from: sq, to, captured: null, flag: 'normal' });
            nr += dr; nf += df;
          }
        }
      }

      // Castling
      const themColor = other(us);
      if (us === 'w') {
        if (this.castling.wK && b[60] === 'K' && b[63] === 'R' && !b[61] && !b[62]) {
          if (!this.isAttacked(60, themColor) && !this.isAttacked(61, themColor) && !this.isAttacked(62, themColor)) {
            push({ from: 60, to: 62, captured: null, flag: 'castleK' });
          }
        }
        if (this.castling.wQ && b[60] === 'K' && b[56] === 'R' && !b[57] && !b[58] && !b[59]) {
          if (!this.isAttacked(60, themColor) && !this.isAttacked(59, themColor) && !this.isAttacked(58, themColor)) {
            push({ from: 60, to: 58, captured: null, flag: 'castleQ' });
          }
        }
      } else {
        if (this.castling.bK && b[4] === 'k' && b[7] === 'r' && !b[5] && !b[6]) {
          if (!this.isAttacked(4, themColor) && !this.isAttacked(5, themColor) && !this.isAttacked(6, themColor)) {
            push({ from: 4, to: 6, captured: null, flag: 'castleK' });
          }
        }
        if (this.castling.bQ && b[4] === 'k' && b[0] === 'r' && !b[1] && !b[2] && !b[3]) {
          if (!this.isAttacked(4, themColor) && !this.isAttacked(3, themColor) && !this.isAttacked(2, themColor)) {
            push({ from: 4, to: 2, captured: null, flag: 'castleQ' });
          }
        }
      }
      return moves;
    }

    snapshot() {
      return {
        board: this.board.slice(),
        turn: this.turn,
        castling: { ...this.castling },
        ep: this.ep,
        halfmove: this.halfmove,
        fullmove: this.fullmove,
      };
    }

    restore(s) {
      this.board = s.board.slice();
      this.turn = s.turn;
      this.castling = { ...s.castling };
      this.ep = s.ep;
      this.halfmove = s.halfmove;
      this.fullmove = s.fullmove;
    }

    makeMove(move) {
      const prev = this.snapshot();
      this.history.push(prev);
      const us = this.turn;
      const b = this.board;
      const pc = b[move.from];
      if (!pc) throw new Error('No piece on ' + sqToName(move.from));

      if (!('captured' in move) || move.captured === undefined) {
        move.captured = move.flag === 'ep' ? (us === 'w' ? 'p' : 'P') : b[move.to] || null;
      }

      b[move.from] = null;
      if (move.flag === 'ep') {
        b[move.to + (us === 'w' ? 8 : -8)] = null;
      }
      b[move.to] = move.promotion
        ? (us === 'w' ? move.promotion.toUpperCase() : move.promotion.toLowerCase())
        : pc;

      if (move.flag === 'castleK') {
        if (us === 'w') { b[63] = null; b[61] = 'R'; }
        else { b[7] = null; b[5] = 'r'; }
      } else if (move.flag === 'castleQ') {
        if (us === 'w') { b[56] = null; b[59] = 'R'; }
        else { b[0] = null; b[3] = 'r'; }
      }

      // Castling rights
      const t = pc.toLowerCase();
      if (t === 'k') {
        if (us === 'w') { this.castling.wK = false; this.castling.wQ = false; }
        else { this.castling.bK = false; this.castling.bQ = false; }
      }
      if (t === 'r') {
        if (move.from === 63) this.castling.wK = false;
        if (move.from === 56) this.castling.wQ = false;
        if (move.from === 7) this.castling.bK = false;
        if (move.from === 0) this.castling.bQ = false;
      }
      const captured = move.captured;
      if (captured) {
        if (captured.toLowerCase() === 'r') {
          if (move.to === 63) this.castling.wK = false;
          if (move.to === 56) this.castling.wQ = false;
          if (move.to === 7) this.castling.bK = false;
          if (move.to === 0) this.castling.bQ = false;
        }
      }

      this.ep = move.flag === 'double' ? (move.from + move.to) / 2 : -1;
      this.halfmove = t === 'p' || captured ? 0 : this.halfmove + 1;
      if (us === 'b') this.fullmove++;
      this.turn = other(us);
      move.piece = pc;
      return this;
    }

    undoMove() {
      const prev = this.history.pop();
      if (!prev) return this;
      this.restore(prev);
      return this;
    }

    legalMoves(options = {}) {
      const us = this.turn;
      const result = [];
      for (const m of this.pseudoMoves()) {
        if (options.from !== undefined && options.from !== null && m.from !== options.from) continue;
        this.makeMove(m);
        const bad = this.isAttacked(this.kingSquare(us), other(us));
        this.undoMove();
        if (!bad) result.push(m);
      }
      return result;
    }

    movesFrom(sq) {
      return this.legalMoves({ from: sq });
    }

    findMove(from, to, promotion = 'q') {
      const ms = this.legalMoves({ from });
      return ms.find((m) => m.to === to && (!m.promotion || m.promotion === promotion)) || null;
    }

    positionKey() {
      let rights = '';
      if (this.castling.wK) rights += 'K';
      if (this.castling.wQ) rights += 'Q';
      if (this.castling.bK) rights += 'k';
      if (this.castling.bQ) rights += 'q';
      return this.board.map((p) => p || '.').join('') + '|' + this.turn + '|' + rights + '|' + this.ep;
    }

    isThreefold() {
      if (this.history.length < 8) return false;
      const key = this.positionKey();
      let count = 1;
      for (const h of this.history) {
        let rights = '';
        if (h.castling.wK) rights += 'K';
        if (h.castling.wQ) rights += 'Q';
        if (h.castling.bK) rights += 'k';
        if (h.castling.bQ) rights += 'q';
        const k = h.board.map((p) => p || '.').join('') + '|' + h.turn + '|' + rights + '|' + h.ep;
        if (k === key) count++;
        if (count >= 3) return true;
      }
      return false;
    }

    isInsufficientMaterial() {
      const counts = {};
      for (const pc of this.board) if (pc) counts[pc] = (counts[pc] || 0) + 1;
      const pawns = (counts.P || 0) + (counts.p || 0);
      const rooks = (counts.R || 0) + (counts.r || 0);
      const queens = (counts.Q || 0) + (counts.q || 0);
      if (pawns || rooks || queens) return false;
      const knights = (counts.N || 0) + (counts.n || 0);
      const bishops = (counts.B || 0) + (counts.b || 0);
      if (knights + bishops <= 1) return true;
      if (knights === 0 && bishops > 0) {
        // Saare bishops ek hi color ke squares pe? tab draw.
        const colors = new Set();
        for (let sq = 0; sq < 64; sq++) {
          const pc = this.board[sq];
          if (pc && pc.toLowerCase() === 'b') colors.add(((sq >> 3) + (sq & 7)) % 2);
        }
        if (colors.size === 1) return true;
      }
      return false;
    }

    status() {
      const moves = this.legalMoves();
      const chk = this.inCheck();
      if (moves.length === 0) return chk ? 'checkmate' : 'stalemate';
      if (this.halfmove >= 100) return 'draw-fifty';
      if (this.isInsufficientMaterial()) return 'draw-material';
      if (this.isThreefold()) return 'draw-repetition';
      return chk ? 'check' : 'ok';
    }

    san(move) {
      const pc = this.board[move.from];
      if (!pc) return '??';
      const t = pc.toLowerCase();
      let s;
      if (move.flag === 'castleK') s = 'O-O';
      else if (move.flag === 'castleQ') s = 'O-O-O';
      else if (t === 'p') {
        s = move.captured ? FILES[move.from & 7] + 'x' + sqToName(move.to) : sqToName(move.to);
        if (move.promotion) s += '=' + move.promotion.toUpperCase();
      } else {
        const sameTarget = this.legalMoves().filter((m) => {
          if (m.to !== move.to || m.from === move.from) return false;
          const otherPc = this.board[m.from];
          return otherPc && otherPc.toLowerCase() === t;
        });
        let dis = '';
        if (sameTarget.length) {
          const sameFile = sameTarget.some((m) => (m.from & 7) === (move.from & 7));
          const sameRank = sameTarget.some((m) => (m.from >> 3) === (move.from >> 3));
          if (!sameFile) dis = FILES[move.from & 7];
          else if (!sameRank) dis = String(8 - (move.from >> 3));
          else dis = sqToName(move.from);
        }
        s = t.toUpperCase() + dis + (move.captured ? 'x' : '') + sqToName(move.to);
      }
      this.makeMove(move);
      const chk = this.inCheck();
      const noMoves = this.legalMoves().length === 0;
      this.undoMove();
      if (chk && noMoves) s += '#';
      else if (chk) s += '+';
      return s;
    }

    moveNumberLabel(ply) {
      return Math.floor(ply / 2) + 1 + (ply % 2 === 0 ? '. ' : '... ');
    }
  }

  // Material count (sirf evaluation / display ke liye)
  function materialBalance(game) {
    let score = 0;
    for (const pc of game.board) {
      if (!pc) continue;
      const v = PIECE_VALUE[pc.toLowerCase()] || 0;
      score += colorOf(pc) === 'w' ? v : -v;
    }
    return score;
  }

  function makeMoveFromUci(game, uci) {
    if (!uci || uci.length < 4) return null;
    const from = nameToSq(uci.slice(0, 2));
    const to = nameToSq(uci.slice(2, 4));
    const promo = uci.length > 4 ? uci[4].toLowerCase() : 'q';
    return game.findMove(from, to, promo);
  }

  return { Chess, START_FEN, sqToName, nameToSq, materialBalance, makeMoveFromUci };
});
