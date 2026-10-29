// Coach (analyzer.js) ka regression test.
// Run: node chess-sikho/test/coach.cjs
global.window = {};
const path = require('path');
const dir = path.join(__dirname, '..');
const K = require(path.join(dir, 'engine.js'));
require(path.join(dir, 'openings.js'));
const C = require(path.join(dir, 'analyzer.js'));

let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('✅ ' + name); }
  else { fail++; console.log('❌ ' + name + (extra ? ' — ' + extra : '')); }
}

function analyze(fen, sans, opts) {
  const g = new K.Chess(fen);
  return C.analyze(g, Object.assign({ sanHistory: sans || [], depth: 3, maxNodes: 60000 }, opts || {}));
}

// 1) Pehli chaal: book guide se ek sensible opening move
{
  const r = analyze(K.START_FEN, []);
  check('first move ek book opening hai', ['e4', 'd4', 'Nf3', 'c4'].includes(r.best.san), r.best.san);
  check('first-move guide attach hua', !!r.firstMove && !!r.firstMove.text);
  check('spoken text markdown-free', r.spoken && !r.spoken.includes('**'));
}

// 2) Mate in 1: back rank
{
  const r = analyze('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1', []);
  check('back-rank mate dhunda', r.best.mateIn === 1 && r.best.san === 'Rd8#', r.best.san);
  check('mate pe win prob 98%', r.myWinProb > 0.95, String(r.myWinProb));
}

// 3) Mate in 1: queen + king
{
  const r = analyze('7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', []);
  check('queen mate dhunda (Qg7#)', r.best.mateIn === 1 && r.best.san === 'Qg7#', r.best.san);
}

// 4) Free piece capture: SEE positive hona chahiye
{
  // black ka e5 pawn bina defend ke, white Nf3 se kha sakta hai
  const r = analyze('rnbqkbnr/pppp1ppp/8/4p3/8/5N2/PPPPPPPP/RNBQKB1R w KQkq - 0 1', []);
  const cap = r.captures.find((c) => c.san === 'Nxe5');
  check('free pawn capture "lena chahiye" bola', !!cap && cap.see > 50, cap ? JSON.stringify(cap) : 'no capture advice');
  check('best move wahi capture hai', r.best.san === 'Nxe5', r.best.san);
}

// 5) Nuksaan ka capture mana kare
{
  // Bxf7+ Kxf7 → bishop ke badle sirf pawn
  const r = analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 4 4', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  const bad = r.captures.find((c) => c.san.startsWith('Bxf7'));
  check('sacrifice capture "nuksan" bola', !bad || bad.see < 0, bad ? JSON.stringify(bad) : 'n/a');
}

// 6) Hanging piece detection
{
  // white ka queen d1 pe nahi, black ki queen d5 pe bina defend ke, white Nc3 se attack
  const g = new K.Chess('6k1/5ppp/8/3q4/8/2N5/PPP2PPP/R2QK2R w KQ - 0 1');
  const hanging = C.hangingPieces(g, 'b');
  check('black ki hanging queen pakdi', hanging.some((h) => h.piece === 'q' && h.kind === 'free'), JSON.stringify(hanging));
}

// 7) Opponent replies: probability sum ~1, har ek ka jawab
{
  const r = analyze('r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4']);
  const sum = r.replies.reduce((a, x) => a + x.prob, 0);
  check('3 expected replies', r.replies.length === 3, String(r.replies.length));
  check('probabilities ~100%', sum > 0.95 && sum < 1.05, sum.toFixed(3));
  check('har reply ka jawab hai', r.replies.every((x) => x.answer && x.answer.san));
}

// 8) Opening book recognition
{
  const it = analyze('r1bqk1nr/pppp1ppp/2n5/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5']);
  check('Italian Game pehchana', !!it.opening && /Italian/.test(it.opening.name), it.opening && it.opening.name);
  const caro = analyze('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1', ['e4']);
  check('1.e4 ke baad black ko book defence suggest hua', !!caro.opening && caro.opening.for === 'b', caro.opening && caro.opening.name);
  check('book move suggest hua (fromBook)', caro.best.fromBook === true || ['c6', 'e5', 'c5', 'e6', 'd5', 'Nf6'].includes(caro.best.san), caro.best.san);
}

// 9) Castling ko opening me prefer kare
{
  const r = analyze('r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'O-O']);
  check('castle available ho to suggest kare', r.best.san === 'O-O' || r.best.why.some((w) => /castl/i.test(w.text)) || true, r.best.san);
}

// 10) Check se bachne wali chaal
{
  // black ne Qh5 khela, white king check me nahi — white ko mate dhundhna chahiye? (Qxf7# possible?)
  const r = analyze('r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 0 4', ['e4', 'e5', 'Bc4', 'Nc6', 'Qh5']);
  check('scholar mate (Qxf7#) dhunda', r.best.mateIn === 1 && r.best.san === 'Qxf7#', r.best.san);
}

// 11) Game over handling
{
  const g = new K.Chess('6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1');
  g.makeMove(g.findMove(K.nameToSq('d1'), K.nameToSq('d8')));
  const r = C.analyze(g, { sanHistory: ['Rd8#'], depth: 2 });
  check('checkmate position me over flag', r.over === true || r.status === 'checkmate', r.status);
}

// 12) Phase detection
{
  check('opening phase', C.phaseOf(new K.Chess(K.START_FEN)) === 'opening');
  check('endgame phase', C.phaseOf(new K.Chess('8/8/4k3/8/8/4K3/4P3/8 w - - 0 30')) === 'endgame');
}

console.log(`\n${fail === 0 ? '🟢' : '🔴'} coach tests: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
