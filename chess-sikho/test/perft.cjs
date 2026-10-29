const { Chess, makeMoveFromUci, START_FEN } = require('../engine.js');

function perft(game, depth) {
  if (depth === 0) return 1;
  const moves = game.legalMoves();
  if (depth === 1) return moves.length;
  let nodes = 0;
  for (const m of moves) {
    game.makeMove(m);
    nodes += perft(game, depth - 1);
    game.undoMove();
  }
  return nodes;
}

let failed = 0;
function check(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(`${ok ? '✅' : '❌'} ${name}: ${actual} (expected ${expected})`);
}

// Standard perft positions
const start = new Chess(START_FEN);
check('start depth 1', perft(start, 1), 20);
check('start depth 2', perft(start, 2), 400);
check('start depth 3', perft(start, 3), 8902);
check('start depth 4', perft(start, 4), 197281);

// Kiwipete
const kiwi = new Chess('r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1');
check('kiwipete depth 1', perft(kiwi, 1), 48);
check('kiwipete depth 2', perft(kiwi, 2), 2039);
check('kiwipete depth 3', perft(kiwi, 3), 97862);

// Position 3 (en passant / pins)
const p3 = new Chess('8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1');
check('pos3 depth 1', perft(p3, 1), 14);
check('pos3 depth 2', perft(p3, 2), 191);
check('pos3 depth 3', perft(p3, 3), 2812);
check('pos3 depth 4', perft(p3, 4), 43238);

// Position 4 (promotions)
const p4 = new Chess('r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1');
check('pos4 depth 1', perft(p4, 1), 6);
check('pos4 depth 2', perft(p4, 2), 264);
check('pos4 depth 3', perft(p4, 3), 9467);

// Position 5
const p5 = new Chess('rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8');
check('pos5 depth 1', perft(p5, 1), 44);
check('pos5 depth 2', perft(p5, 2), 1486);
check('pos5 depth 3', perft(p5, 3), 62379);

// FEN round-trip + SAN sanity
const g = new Chess();
const seq = ['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1c4', 'f8c5', 'e1g1'];
const sans = [];
for (const uci of seq) {
  const m = makeMoveFromUci(g, uci);
  if (!m) { console.log('❌ move not found', uci); failed++; break; }
  sans.push(g.san(m));
  g.makeMove(m);
}
check('SAN sequence', sans.join(' '), 'e4 e5 Nf3 Nc6 Bc4 Bc5 O-O');
check('FEN after Italian', g.fen(), 'r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 b kq - 5 4');

// Scholar's mate should be mate in 1
const scholar = new Chess('r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w kq - 4 4');
const mateMoves = scholar.legalMoves().filter((m) => {
  scholar.makeMove(m);
  const st = scholar.status();
  scholar.undoMove();
  return st === 'checkmate';
});
check("Scholar's mate count", mateMoves.length, 1);
check("Scholar's mate SAN", mateMoves.length ? scholar.san(mateMoves[0]) : 'none', 'Qxf7#');

// Stalemate detection
const stale = new Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
check('stalemate', stale.status(), 'stalemate');

console.log(failed === 0 ? '\n🟢 All engine tests passed' : `\n🔴 ${failed} test(s) failed`);
process.exit(failed === 0 ? 0 : 1);
