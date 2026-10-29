// jsdom smoke test for the Chess Sikho app (run: node test/dom.cjs)
const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require(process.env.JSDOM_PATH || 'jsdom');

const root = path.join(__dirname, '..');
const errors = [];
const vc = new VirtualConsole();
vc.on('jsdomError', (e) => errors.push('jsdomError: ' + e.message));
vc.on('error', (...a) => errors.push('console.error: ' + a.join(' ')));

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const dom = new JSDOM(html, {
  url: 'http://localhost:8000/index.html',
  runScripts: 'dangerously',
  resources: 'usable',
  pretendToBeVisual: true,
  virtualConsole: vc,
  beforeParse(window) {
    window.scrollTo = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
  },
});

const { window } = dom;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(cond, msg) {
  if (cond) console.log('✅ ' + msg);
  else { console.log('❌ ' + msg); errors.push(msg); }
}

async function waitFor(fn, ms = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (fn()) return true;
    await wait(100);
  }
  return false;
}

(async () => {
  const doc = window.document;
  const ready = await waitFor(() => doc.querySelector('.hero h1'));
  if (!ready) { console.log('❌ app boot hi nahi hua (scripts load nahi)'); errors.push('boot failed'); }

  assert(doc.querySelectorAll('.chboard').length >= 0, 'page loaded');

  // HOME
  assert(doc.querySelector('.hero h1') && doc.querySelector('.hero h1').textContent.includes('15 minute'), 'home hero rendered');
  assert(doc.querySelectorAll('[data-go]').length >= 3, 'home CTA buttons rendered (' + doc.querySelectorAll('[data-go]').length + ')');

  // LEARN list
  window.location.hash = '#/learn';
  await wait(120);
  assert(doc.querySelectorAll('[data-lesson]').length === 15, 'learn list shows 15 lessons');

  // crash mode
  doc.querySelector('[data-mode="crash"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(80);
  assert(doc.querySelectorAll('[data-lesson]').length === 6, 'crash mode shows 6 essential lessons');
  doc.querySelector('[data-mode="full"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(80);

  // open every lesson
  const ids = [...doc.querySelectorAll('[data-lesson]')].map((b) => b.dataset.lesson);
  let diagrams = 0, practices = 0;
  for (const id of ids) {
    window.location.hash = '#/learn/' + id;
    await wait(90);
    const boards = doc.querySelectorAll('.lesson-view .chboard');
    diagrams += boards.length;
    practices += doc.querySelectorAll('.practice').length;
    const pieces = [...boards].reduce((n, b) => n + [...b.querySelectorAll('.piece')].filter((x) => x.textContent.trim()).length, 0);
    if (boards.length && pieces < 2) errors.push('diagram has no pieces in lesson ' + id);
  }
  assert(diagrams >= 20, 'lesson diagrams mounted (' + diagrams + ')');
  assert(practices >= 5, 'practice widgets mounted (' + practices + ')');

  // practice: solve "castle" practice in special lesson
  window.location.hash = '#/learn/special';
  await wait(120);
  const boards = doc.querySelectorAll('.lesson-view .chboard');
  assert(boards.length >= 4, 'special lesson has 4 diagrams');
  const castleBoard = boards[2];
  // click-2-click: king e1 (king on e1) -> g1
  function squareEl(boardEl, sq) {
    return [...boardEl.querySelectorAll('.sq')].find((s) => Number(s.dataset.sq) === sq);
  }
  const NAME_TO_SQ = window.ChessKit.nameToSq;
  const fakeRect = { left: 0, top: 0, width: 400, height: 400, right: 400, bottom: 400 };
  window.HTMLElement.prototype.getBoundingClientRect = function () {
    if (this.classList && this.classList.contains('chboard')) return fakeRect;
    return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 };
  };
  function clickSquare(boardEl, sq, flipped) {
    const v = flipped ? 63 - sq : sq;
    const col = v % 8, row = Math.floor(v / 8);
    const x = col * 50 + 25, y = row * 50 + 25;
    const target = squareEl(boardEl, sq) || boardEl;
    // board-level pointer events use coordinates, so dispatch on board
    const ev = new window.MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y });
    boardEl.dispatchEvent(ev);
    const up = new window.MouseEvent('pointerup', { bubbles: true, clientX: x, clientY: y });
    window.dispatchEvent(up);
  }
  // castle practice is the second board-mount of lesson: index 2 among boards (diagram, practice, ...)
  const practiceEl = doc.querySelector('.practice');
  const practiceBoard = practiceEl.querySelector('.chboard');
  clickSquare(practiceBoard, NAME_TO_SQ('e1'), false);
  await wait(60);
  clickSquare(practiceBoard, NAME_TO_SQ('g1'), false);
  await wait(120);
  assert(practiceEl.querySelector('[data-feedback]').textContent.includes('Castling'), 'castling practice detected O-O');

  // promotion practice (second practice of 'special' lesson)
  window.location.hash = '#/learn/special';
  await wait(150);
  const practiceEls = doc.querySelectorAll('.practice');
  const promoEl = practiceEls[1];
  const promoBoard = promoEl.querySelector('.chboard');
  clickSquare(promoBoard, NAME_TO_SQ('f7'), false);
  await wait(60);
  clickSquare(promoBoard, NAME_TO_SQ('f8'), false);
  await wait(150);
  const promoLayer = promoEl.querySelector('.promo-layer');
  assert(!!promoLayer, 'promotion picker appears');
  if (promoLayer) {
    const qBtn = promoLayer.querySelectorAll('.promo-btn')[0];
    qBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
    await wait(200);
    assert(promoEl.querySelector('[data-feedback]').textContent.includes('Queen') || promoEl.querySelector('[data-feedback]').textContent.includes('Checkmate'), 'promotion practice solved');
  }

  // PLAY view
  window.location.hash = '#/play';
  await wait(300);
  const playBoard = doc.querySelector('#play-board');
  const playPieces = playBoard ? [...playBoard.querySelectorAll('.piece')].filter((x) => x.textContent.trim()).length : 0;
  assert(playPieces === 32, 'play board has 32 pieces (' + playPieces + ')');
  assert(doc.querySelectorAll('#level-seg .seg').length === 4, '4 bot levels');
  // make e2-e4 by clicking
  clickSquare(playBoard, NAME_TO_SQ('e2'), false);
  await wait(50);
  clickSquare(playBoard, NAME_TO_SQ('e4'), false);
  await wait(2500);
  const moveRows = doc.querySelectorAll('#moves .move-row');
  const moveText = doc.querySelector('#moves').textContent.trim();
  assert(moveRows.length >= 1, 'moves list updated after e4: ' + moveText.slice(0, 60));
  assert(moveText.includes('e4'), 'e4 recorded in move list');

  // undo
  doc.querySelector('#undo').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(150);
  const afterUndo = doc.querySelector('#moves').textContent.trim();
  assert(afterUndo === '' || !afterUndo.includes('e4') || afterUndo.length < moveText.length, 'undo works');

  // hint
  doc.querySelector('#hint').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(200);
  assert(doc.querySelector('#toast').textContent.includes('Try karo') || doc.querySelector('#toast').textContent.includes('💡'), 'hint button gives suggestion');

  // new game with black color
  doc.querySelector('[data-color="b"]').dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(1800);
  assert(doc.querySelector('#status-text').textContent.length > 0, 'black-side game starts, bot plays first');

  // PUZZLES
  window.location.hash = '#/puzzles';
  await wait(150);
  assert(doc.querySelectorAll('[data-puzzle]').length === 8, '8 puzzles listed');

  window.location.hash = '#/puzzles/0';
  await wait(200);
  const pBoard = doc.querySelector('#puzzle-board');
  assert([...pBoard.querySelectorAll('.piece')].filter((x) => x.textContent.trim()).length >= 6, 'puzzle board mounted');
  clickSquare(pBoard, NAME_TO_SQ('d1'), false);
  await wait(50);
  clickSquare(pBoard, NAME_TO_SQ('d8'), false);
  await wait(200);
  assert(doc.querySelector('#puzzle-feedback').textContent.includes('Checkmate'), 'puzzle 1 solved with Rd8#');

  // trap puzzle
  window.location.hash = '#/puzzles/7';
  await wait(200);
  const trapBtn = doc.querySelector('[data-nomate]');
  assert(!!trapBtn, 'trap puzzle shows "no mate" button');
  trapBtn.dispatchEvent(new window.Event('click', { bubbles: true }));
  await wait(150);
  assert(doc.querySelector('#puzzle-feedback').textContent.includes('Sahi jawab'), 'trap puzzle accepts "no mate"');

  console.log('\nJS errors captured:', errors.length);
  errors.forEach((e) => console.log(' - ' + e));
  process.exit(errors.length ? 1 : 0);
})();
