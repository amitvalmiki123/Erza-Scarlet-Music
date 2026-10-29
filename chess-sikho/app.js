// app.js — UI, lessons, play vs bot, puzzles.
(function () {
  'use strict';

  const { Chess, START_FEN, sqToName, nameToSq, materialBalance } = window.ChessKit;
  const LESSONS = window.LESSONS;
  const PUZZLES = window.PUZZLES;
  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const PIECE_NAMES = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };

  // ---------- progress ----------
  const KEY = 'chessSikho.v1';
  const DEFAULTS = { lessons: {}, puzzles: {}, games: 0, wins: 0, settings: {} };
  const Store = (typeof globalThis !== 'undefined' ? globalThis : window).AppStorage || {
    getJSON: (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || f; } catch (e) { return f; } },
    setJSON: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  let progress = Object.assign({}, DEFAULTS, Store.getJSON(KEY, {}));
  function saveProgress() { Store.setJSON(KEY, progress); }

  // ---------- tiny helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function fmt(s) {
    return esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
  }
  const callout = (kind, ico, text) =>
    `<div class="callout ${kind}"><span class="ico">${ico}</span><div>${fmt(text)}</div></div>`;

  let toastTimer = null;
  function toast(msg, ms = 2400) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), ms);
  }

  // ---------- views / router ----------
  const views = {
    home: $('#view-home'),
    learn: $('#view-learn'),
    play: $('#view-play'),
    puzzles: $('#view-puzzles'),
  };
  let crashMode = false;

  function parseHash() {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const [view, ...rest] = raw.split('/');
    return { view: views[view] ? view : 'home', arg: rest.join('/') };
  }

  function route() {
    const { view, arg } = parseHash();
    Object.entries(views).forEach(([name, el]) => el.classList.toggle('hidden', name !== view));
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === view));
    window.scrollTo({ top: 0, behavior: 'auto' });
    if (view === 'home') renderHome();
    else if (view === 'learn') (arg ? renderLesson(arg) : renderLearnList());
    else if (view === 'play') renderPlay();
    else if (view === 'puzzles') (arg !== '' ? renderPuzzle(Number(arg)) : renderPuzzleList());
  }

  $$('.tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      location.hash = '#/' + tab.dataset.tab;
    });
  });
  window.addEventListener('hashchange', route);
  $('#reset-progress').addEventListener('click', (e) => {
    e.preventDefault();
    progress = Object.assign({}, DEFAULTS, { lessons: {}, puzzles: {} });
    saveProgress();
    toast('Progress reset ho gaya');
    route();
  });

  // ---------- block renderer (lessons) ----------
  function renderBlocks(blocks) {
    const mounts = [];
    let html = '';
    for (const b of blocks) {
      if (b.h) html += `<h3>${fmt(b.h)}</h3>`;
      else if (b.p) html += `<p>${fmt(b.p)}</p>`;
      else if (b.list) html += `<ul>${b.list.map((i) => `<li>${fmt(i)}</li>`).join('')}</ul>`;
      else if (b.steps) html += `<ol>${b.steps.map((i) => `<li>${fmt(i)}</li>`).join('')}</ol>`;
      else if (b.tip) html += callout('tip', '💡', b.tip);
      else if (b.warn) html += callout('warn', '⚠️', b.warn);
      else if (b.note) html += callout('note', 'ℹ️', b.note);
      else if (b.table) {
        html += `<table class="data"><thead><tr>${b.table.head.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>`;
        html += b.table.rows.map((r) => `<tr>${r.map((c) => `<td>${fmt(c)}</td>`).join('')}</tr>`).join('');
        html += '</tbody></table>';
      } else if (b.diagram) {
        const i = mounts.length;
        mounts.push({ kind: 'diagram', spec: b.diagram });
        html += `<figure class="diagram">
          <div class="board-shell" data-mount="${i}"></div>
          ${b.diagram.caption ? `<figcaption>${fmt(b.diagram.caption)}</figcaption>` : ''}
        </figure>`;
      } else if (b.practice) {
        const i = mounts.length;
        mounts.push({ kind: 'practice', spec: b.practice });
        html += `<div data-mount="${i}"></div>`;
      }
    }
    return { html, mounts };
  }

  function mountBlocks(root, mounts) {
    $$('[data-mount]', root).forEach((el) => {
      const m = mounts[Number(el.dataset.mount)];
      if (!m) return;
      if (m.kind === 'diagram') mountDiagram(el, m.spec);
      else mountPractice(el, m.spec);
    });
  }

  function mountDiagram(el, spec) {
    const game = new Chess(spec.fen);
    const board = new window.ChessBoard(el, {
      game,
      interactive: false,
      showLegal: false,
      orientation: spec.orientation || (game.turn === 'b' ? 'b' : 'w'),
    });
    board.hintSquares = spec.highlights || [];
    board.arrows = spec.arrows || [];
    board.render();
    return board;
  }

  // generic practice widget
  function mountPractice(el, spec) {
    el.innerHTML = `
      <div class="practice">
        <div class="practice-head"><span class="badge">Practice</span><span>${esc(spec.title || 'Ab tum try karo')}</span></div>
        <p class="hint-line">${fmt(spec.hint || 'Chaal chuno — galat ho to wapas aa jayegi.')}</p>
        <div class="board-shell" data-practice-board></div>
        <div class="practice-actions">
          <button class="btn small ghost" data-reset>↺ Reset</button>
          ${spec.solution ? '<button class="btn small ghost" data-sol>💡 Solution</button>' : ''}
        </div>
        <div class="practice-feedback" data-feedback></div>
      </div>`;

    const boardEl = $('[data-practice-board]', el);
    const fb = $('[data-feedback]', el);
    let game = new Chess(spec.fen);
    let solved = false;
    let freeCount = 0;
    let board;

    function setFb(text, ok) {
      fb.textContent = text;
      fb.className = 'practice-feedback ' + (ok ? 'ok' : text ? 'bad' : '');
    }

    function build() {
      game = new Chess(spec.fen);
      solved = false;
      freeCount = 0;
      if (board) board.setGame(game);
      else {
        board = new window.ChessBoard(boardEl, {
          game,
          interactive: spec.goal !== 'nomate',
          orientation: spec.orientation || (game.turn === 'b' ? 'b' : 'w'),
          onMove: handleMove,
        });
      }
      board.selected = null;
      board.lastMove = null;
      board.arrows = [];
      board.hintSquares = [];
      board.interactive = spec.goal !== 'nomate';
      board.render();
      setFb('', true);
    }

    function evaluateGoal(move) {
      const status = game.status();
      switch (spec.goal) {
        case 'mate1':
          return status === 'checkmate'
            ? { ok: true, msg: 'Checkmate! 🎉' }
            : { ok: false, msg: 'Ye checkmate nahi hai — king ke paas bhaagne ki jagah dekho.' };
        case 'mate2':
          return status === 'checkmate' ? { ok: true, msg: 'Checkmate! 🎉' } : { ok: false, msg: 'Direct mate nahi hai — pehle ek setup move chahiye.' };
        case 'promote':
          return move.promotion ? { ok: true, msg: `Promotion — ${PIECE_NAMES[move.promotion]} ban gaya! 🎉` } : { ok: false, msg: 'Pawn ko aakhri rank tak le jao.' };
        case 'mateOrPromote':
          return status === 'checkmate'
            ? { ok: true, msg: `Checkmate bhi — ${PIECE_NAMES[move.promotion || 'q']}! 🎉` }
            : move.promotion
              ? { ok: true, msg: `Promotion — ${PIECE_NAMES[move.promotion]} ban gaya! 🎉` }
              : { ok: false, msg: 'Pawn ko aakhri rank tak le jao.' };
        case 'castle':
          return move.flag === 'castleK' || move.flag === 'castleQ'
            ? { ok: true, msg: 'Castling ho gayi — king safe, rook game me! 🎉' }
            : { ok: false, msg: 'Castling karo: king ko 2 square rook ki taraf le jao.' };
        case 'reach':
          return move.to === nameToSq(spec.target)
            ? { ok: true, msg: 'Shabaash! 🎉' }
            : { ok: false, msg: `Target ${spec.target} hai — wahan pahuncho.` };
        case 'free':
          freeCount++;
          return freeCount >= 3
            ? { ok: true, msg: 'Badhiya! Tumne 3 chaal chala li — ab asli game khelo. 🎉' }
            : { ok: false, keep: true, msg: `Chalte raho… ${freeCount}/3` };
        default:
          return { ok: true, msg: 'Sahi!' };
      }
    }

    function handleMove(from, to, promo) {
      if (solved) return;
      const move = game.findMove(from, to, promo);
      if (!move) return;
      const san = game.san(move);
      game.makeMove(move);
      board.lastMove = { from, to };
      board.render();
      const verdict = evaluateGoal(move);
      if (verdict.ok) {
        solved = true;
        board.interactive = false;
        board.locked = false;
        setFb(verdict.msg, true);
      } else if (verdict.keep) {
        setFb(verdict.msg, false);
        setTimeout(() => { if (!solved) { game.undoMove(); board.lastMove = null; board.render(); } }, 900);
      } else {
        setFb(verdict.msg, false);
        setTimeout(() => {
          game.undoMove();
          board.lastMove = null;
          board.render();
          board.flash(from, to);
        }, 520);
      }
    }

    function showSolution() {
      const g = new Chess(game.fen());
      let best = null;
      for (const m of g.legalMoves()) {
        const san = g.san(m);
        g.makeMove(m);
        const st = g.status();
        g.undoMove();
        if (st === 'checkmate') { best = { m, san }; break; }
      }
      if (!best) {
        setFb('Is position me direct mate nahi hai.', false);
        return;
      }
      board.arrows = [[best.m.from, best.m.to, '#47d7a0']];
      board.render();
      setFb(`Solution: ${best.san} — ab tum khel ke dekho.`, false);
    }

    $('[data-reset]', el).addEventListener('click', build);
    const solBtn = $('[data-sol]', el);
    if (solBtn) solBtn.addEventListener('click', showSolution);
    build();
    return board;
  }

  // ---------- HOME ----------
  function renderHome() {
    const done = Object.keys(progress.lessons).filter((k) => progress.lessons[k]).length;
    const solved = Object.keys(progress.puzzles).filter((k) => progress.puzzles[k]).length;
    const pct = Math.round((done / LESSONS.length) * 100);

    views.home.innerHTML = `
      <section class="hero">
        <span class="eyebrow">♟️ Zero se shuruaat · Hinglish</span>
        <h1>Chess <em>15 minute</em> me<br>samajh lo — phir khelo.</h1>
        <p class="lead">Pehle sirf rules (5 min), phir opening ke 5 golden rules (5 min), phir mate ka pehla pattern (5 min).
        Uske baad neeche bane bot se khelo — level 1 se shuru karo, wo tumhari galtiyan maaf karta hai.</p>
        <div class="hero-actions">
          <button class="btn primary" data-go="crash">⚡ 15-minute crash course</button>
          <button class="btn" data-go="play">♟️ Bot se khelo</button>
          <button class="btn ghost" data-go="puzzles">🧩 Puzzles solve karo</button>
        </div>
        <div class="stat-row">
          <div class="stat"><b>${LESSONS.length} lessons</b>2–5 min ke chhote lessons</div>
          <div class="stat"><b>${PUZZLES.length} puzzles</b>Mate in 1 se shuru</div>
          <div class="stat"><b>4 levels</b>Naya → Club player</div>
          <div class="stat"><b>${done}/${LESSONS.length}</b>lessons complete</div>
        </div>
        <div class="hero-art">♞</div>
      </section>

      <div class="section-title">
        <h2>🧠 Coach — har move pe guide</h2>
        <span>Kholo → Khelo tab → right sidebar</span>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Kya batata hai</h3>
          <ul style="color:var(--muted);font-size:.88rem;padding-left:20px;margin:10px 0 0;display:grid;gap:6px">
            <li><b style="color:var(--text)">Sabse achhi chaal</b> + jeetne ki probability</li>
            <li><b style="color:var(--text)">Kyu</b> — develop, center, castle, fork, pin, hanging piece…</li>
            <li><b style="color:var(--text)">Opponent ki expected chaalein</b> — probability % ke saath, aur har ek ka jawab</li>
            <li><b style="color:var(--text)">Capture ka hisaab</b> — trade lena chahiye ya nuksan hai</li>
            <li><b style="color:var(--text)">Opening book</b> — plan aur trap ke saath</li>
          </ul>
          <div style="margin-top:14px"><button class="btn primary small" data-go="play">♟️ Coach ke saath khelo →</button></div>
        </div>
        <div class="card">
          <h3>🔊 Voice + 📱 APK</h3>
          <p>Coach ki <b>🔊 Suno</b> button se guide bol ke sunayi deti hai (Hinglish). Phone pe chahiye?</p>
          <div class="callout note" style="margin:10px 0 12px"><span class="ico">📱</span><div>Native Android APK GitHub release pe hai — <b>chess-sikho-apk</b> tag. Offline chalta hai, koi permission nahi maangta.</div></div>
          <p style="font-size:.82rem;color:var(--muted);margin:0">Panel me ✅ se guide on/off, <b>−/+</b> se sochne ki depth (1 = fast, 4 = deep), <b>▶ Ye chaal chalo</b> se coach ki chaal khud chal jaati hai.</p>
          <div style="margin-top:14px"><a class="btn small" href="https://github.com/amitvalmiki123/Erza-Scarlet-Music/releases/tag/chess-sikho-apk" target="_blank" rel="noopener">⬇ APK download</a></div>
        </div>
      </div>

      <div class="section-title">
        <h2>Jaldi seekhne ka rasta</h2>
        <span>Isi order me chalo — bas.</span>
      </div>
      <div class="grid cols-3">
        <div class="card step-card">
          <span class="step-num">STEP 1 · 5 MIN</span>
          <span class="emoji">🧠</span>
          <h3>Rules clear karo</h3>
          <p>Pieces kaise chalte hain, check, mate, castling. Bas itna — theory baad me.</p>
          <div style="margin-top:12px"><button class="btn small" data-go="learn">Lesson 1 kholo →</button></div>
        </div>
        <div class="card step-card">
          <span class="step-num">STEP 2 · 5 MIN</span>
          <span class="emoji">🔑</span>
          <h3>Opening ke 5 rules</h3>
          <p>Center, develop, castle. Agar ye 5 yaad rahe, tum pehli 10 chaal kabhi nahi bigaadoge.</p>
          <div style="margin-top:12px"><button class="btn small" data-go="learn/openings">Openings padho →</button></div>
        </div>
        <div class="card step-card">
          <span class="step-num">STEP 3 · 5 MIN</span>
          <span class="emoji">👑</span>
          <h3>Mate karna seekho</h3>
          <p>Back rank mate aur queen + king mate. Beginner games 90% isi se jeete jaate hain.</p>
          <div style="margin-top:12px"><button class="btn small" data-go="learn/mates">Mate lesson →</button></div>
        </div>
      </div>

      <div class="section-title">
        <h2>Roj ka practice</h2>
        <span>20 minute × 7 din = pehli jeet</span>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h3>♟️ Bot ke against khelo</h3>
          <p>Time limit nahi, rush nahi. Galat chaal pe undo kar sakte ho — yehi sabse fast seekhne ka tarika hai.</p>
          <div class="stat-row">
            <div class="stat"><b>${progress.games}</b>games khele</div>
            <div class="stat"><b>${progress.wins}</b>jeete</div>
            <div class="stat"><b>${progress.games ? Math.round((progress.wins / progress.games) * 100) : 0}%</b>win rate</div>
          </div>
          <div style="margin-top:14px"><button class="btn primary small" data-go="play">Board kholo →</button></div>
        </div>
        <div class="card">
          <h3>🧩 Puzzle se tactic seekho</h3>
          <p>Har puzzle ek pattern sikhata hai — back rank, ladder, promotion. 5–10 minute me dimaag on ho jaata hai.</p>
          <div class="stat-row">
            <div class="stat"><b>${solved}/${PUZZLES.length}</b>solved</div>
            <div class="stat"><b>${pct}%</b>course</div>
          </div>
          <div style="margin-top:14px"><button class="btn small" data-go="puzzles">Puzzle kholo →</button></div>
        </div>
      </div>

      <div class="section-title">
        <h2>Cheat sheet — ek nazar me</h2>
        <span>Save karne layak</span>
      </div>
      <div class="grid cols-2">
        <div class="card">
          <h3>Piece values</h3>
          <table class="data">
            <thead><tr><th>Piece</th><th>Value</th></tr></thead>
            <tbody>
              <tr><td>Pawn</td><td>1</td></tr>
              <tr><td>Knight</td><td>3</td></tr>
              <tr><td>Bishop</td><td>3</td></tr>
              <tr><td>Rook</td><td>5</td></tr>
              <tr><td>Queen</td><td>9</td></tr>
              <tr><td>King</td><td>∞</td></tr>
            </tbody>
          </table>
          <p style="margin-top:10px">Trade se pehle hisaab: 3 ke saamne 5 = tum +2 aage.</p>
        </div>
        <div class="card">
          <h3>Har move se pehle 3 sawaal</h3>
          <ol style="color:var(--muted);font-size:0.9rem;padding-left:20px;margin:10px 0 0">
            <li>Kya mera koi piece free me ja raha hai?</li>
            <li>Opponent kya threaten kar raha hai?</li>
            <li>Koi check ya capture mujhe faayda de raha hai?</li>
          </ol>
          <div class="callout tip" style="margin-bottom:0"><span class="ico">💡</span><div>Opening ka short formula: <b>Center → Develop → Castle → Connect rooks</b>.</div></div>
        </div>
      </div>

      <div class="card" style="margin-top:18px">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:8px">
          <h3 style="margin:0">Course progress</h3>
          <span style="color:var(--muted);font-size:.85rem">${done} / ${LESSONS.length} lessons · ${solved} / ${PUZZLES.length} puzzles</span>
        </div>
        <div class="progress-bar"><div style="width:${pct}%"></div></div>
      </div>
    `;

    $$('[data-go]', views.home).forEach((btn) => {
      btn.addEventListener('click', () => {
        const go = btn.dataset.go;
        if (go === 'crash') { crashMode = true; location.hash = '#/learn'; }
        else location.hash = '#/' + go;
      });
    });
  }

  // ---------- LEARN: list ----------
  function renderLearnList() {
    const done = (id) => !!progress.lessons[id];
    const list = crashMode ? LESSONS.filter((l) => l.essential) : LESSONS;
    const chapters = [];
    for (const l of list) {
      let ch = chapters.find((c) => c.name === l.chapter);
      if (!ch) chapters.push((ch = { name: l.chapter, items: [] }));
      ch.items.push(l);
    }
    const doneCount = list.filter((l) => done(l.id)).length;

    views.learn.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap">
        <div>
          <h1 style="margin:0 0 4px;font-size:1.6rem;letter-spacing:-.02em">${crashMode ? '⚡ 15-minute crash course' : '📚 Poora course'}</h1>
          <p style="color:var(--muted);margin:0;font-size:.9rem">
            ${crashMode ? 'Sirf 6 zaroori lessons — rules, pieces, special moves, opening ke principles. Bas itna jaanna kaafi hai.' : '15 chhote lessons. Har lesson 2–5 minute ka — beech me diagrams aur practice boards hain.'}
          </p>
        </div>
        <div class="segmented" style="margin-top:8px">
          <button class="seg ${crashMode ? 'active' : ''}" data-mode="crash">⚡ Crash (15 min)</button>
          <button class="seg ${crashMode ? '' : 'active'}" data-mode="full">📚 Sab lessons</button>
        </div>
      </div>

      <div class="card" style="margin-top:16px;display:flex;gap:14px;align-items:center;flex-wrap:wrap">
        <div style="flex:1;min-width:180px">
          <div class="progress-bar"><div style="width:${Math.round((doneCount / list.length) * 100)}%"></div></div>
        </div>
        <span style="color:var(--muted);font-size:.85rem">${doneCount}/${list.length} complete</span>
        ${doneCount > 0 ? '<button class="btn small primary" data-continue>▶ Jahan chhoda tha wahan se</button>' : ''}
      </div>

      ${chapters.map((ch) => `
        <div class="chapter-head">${esc(ch.name)}</div>
        <div class="lesson-grid">
          ${ch.items.map((l) => `
            <button class="lesson-card ${done(l.id) ? 'done' : ''}" data-lesson="${l.id}">
              <span class="lc-emoji">${l.emoji}</span>
              <span>
                <span class="lc-title">${esc(l.title)}</span>
                <span class="lc-meta">${l.minutes} min${l.essential ? ' · zaroori' : ''}</span>
              </span>
              <span class="check">${done(l.id) ? '✓' : ''}</span>
            </button>`).join('')}
        </div>`).join('')}
    `;

    $$('[data-lesson]', views.learn).forEach((b) => b.addEventListener('click', () => { location.hash = '#/learn/' + b.dataset.lesson; }));
    $$('[data-mode]', views.learn).forEach((b) => b.addEventListener('click', () => {
      crashMode = b.dataset.mode === 'crash';
      renderLearnList();
    }));
    const cont = $('[data-continue]', views.learn);
    if (cont) cont.addEventListener('click', () => {
      const next = list.find((l) => !done(l.id)) || list[0];
      location.hash = '#/learn/' + next.id;
    });
  }

  // ---------- LEARN: single lesson ----------
  function renderLesson(id) {
    const lesson = LESSONS.find((l) => l.id === id);
    if (!lesson) { location.hash = '#/learn'; return; }
    if (crashMode && !lesson.essential) crashMode = false;
    const order = crashMode ? LESSONS.filter((l) => l.essential) : LESSONS;
    const pos = order.indexOf(lesson);
    const prev = order[pos - 1];
    const next = order[pos + 1];
    const { html, mounts } = renderBlocks(lesson.blocks);

    views.learn.innerHTML = `
      <div class="lesson-view">
        <div class="lesson-top">
          <button class="btn small ghost" data-back>← ${crashMode ? 'Crash course' : 'Saare lessons'}</button>
          <span class="pill">${esc(lesson.chapter)}</span>
          <span class="pill gold">${lesson.minutes} min</span>
          ${progress.lessons[lesson.id] ? '<span class="pill" style="color:var(--green)">✓ complete</span>' : ''}
        </div>
        <h1>${lesson.emoji} ${esc(lesson.title)}</h1>
        <p class="lesson-meta">Lesson ${pos + 1} / ${order.length}</p>
        <div class="prose">${html}</div>
        <div class="lesson-nav">
          ${prev ? `<button class="btn" data-prev="${prev.id}">← ${esc(prev.title)}</button>` : '<span></span>'}
          <button class="btn primary" data-next="${next ? next.id : 'done'}">
            ${next ? '✓ Samajh gaya — aage badho' : '✓ Course complete karo'}
          </button>
        </div>
      </div>`;

    mountBlocks(views.learn, mounts);

    $('[data-back]', views.learn).addEventListener('click', () => { location.hash = '#/learn'; });
    if (prev) $('[data-prev]', views.learn).addEventListener('click', () => { location.hash = '#/learn/' + prev.id; });
    $('[data-next]', views.learn).addEventListener('click', () => {
      progress.lessons[lesson.id] = true;
      saveProgress();
      if (next) location.hash = '#/learn/' + next.id;
      else { toast('Course complete! 🎉 Ab bot ke against khelo.'); location.hash = '#/play'; }
    });
  }

  // ---------- PLAY ----------
  let play = null;

  function newPlay(level, playerColor) {
    if (play && play.coachApi) { try { window.CoachUI.unmount(); } catch (e) { /* ignore */ } }
    if (window.ChessCoachCache) window.ChessCoachCache.clear();
    play = {
      game: new Chess(),
      level: level || (play ? play.level : 2),
      playerColor: playerColor || (play ? play.playerColor : 'w'),
      board: null,
      thinking: false,
      result: null,
      flipped: false,
      moves: [],
      lastMove: null,
      counted: false,
    };
  }

  const STATUS_TEXT = {
    checkmate: 'Checkmate',
    stalemate: 'Stalemate',
    'draw-fifty': '50-move rule se draw',
    'draw-material': 'Insufficient material — draw',
    'draw-repetition': '3 baar same position — draw',
  };

  function statusOf(game) {
    return game.status();
  }

  function playerRowHTML(color, isBot) {
    const cap = capturedBy(play.game, color);
    const adv = advantage(play.game);
    const glyph = color === 'w' ? '♔' : '♚';
    const name = isBot ? `Bot · level ${play.level}` : 'Tum';
    return `<div class="player-row ${play.game.turn === color && !play.result ? 'turn' : ''}">
      <span class="avatar">${glyph}</span>
      <span>${name}</span>
      <span class="captured">${cap}</span>
      ${adv.color === color && adv.value > 0 ? `<span class="adv">+${adv.value}</span>` : ''}
    </div>`;
  }

  function capturedBy(game, color) {
    const initial = { p: 8, n: 2, b: 2, r: 2, q: 1 };
    const counts = { p: 0, n: 0, b: 0, r: 0, q: 0 };
    for (const pc of game.board) {
      if (!pc) continue;
      const isWhite = pc === pc.toUpperCase();
      if ((color === 'w' && !isWhite) || (color === 'b' && isWhite)) counts[pc.toLowerCase()]++;
    }
    let out = '';
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      const missing = Math.max(0, initial[t] - counts[t]);
      out += GLYPHS[t].repeat(missing);
    }
    return out;
  }

  function advantage(game) {
    const score = materialBalance(game);
    if (Math.abs(score) < 0.5) return { color: null, value: 0 };
    return score > 0 ? { color: 'w', value: Math.round(score) } : { color: 'b', value: Math.round(-score) };
  }

  // ---------- Coach (guide mode) ----------
  function mountCoach() {
    const panel = $('#coach-panel', views.play);
    if (!panel || !window.CoachUI) return;
    const ctx = {
      getGame: () => (play && !play.result ? play.game : null),
      getSans: () => (play ? play.moves.map((m) => m.san) : []),
      getLastMove: () => (play ? play.lastMove : null),
      onArrow: (move, sticky) => {
        if (!play || !play.board) return;
        if (!move) { play.board.arrows = []; play.board.hintSquares = []; play.board.render(); return; }
        play.board.arrows = [[move.from, move.to, '#47d7a0']];
        play.board.hintSquares = [move.from, move.to];
        play.board.render();
        if (!sticky) {
          setTimeout(() => {
            if (!play || !play.board) return;
            play.board.arrows = [];
            play.board.hintSquares = [];
            play.board.render();
          }, 2600);
        }
      },
      onPlayMove: (move) => {
        if (!play || play.result || play.thinking) return;
        if (play.game.turn !== play.playerColor) { toast('Abhi tumhari chaal nahi hai'); return; }
        const m = play.game.findMove(move.from, move.to, move.promotion || 'q');
        if (!m) { toast('Ye chaal legal nahi hai'); return; }
        humanMove(move.from, move.to, move.promotion || undefined);
      },
      onPreview: (alt) => {
        if (alt && alt.san) toast(`Option: ${alt.san} · ${Math.round(alt.winProb * 100)}% jeet`);
      },
      shouldSpeak: true,
      onRender: renderDock,
    };
    play.coachCtx = ctx;
    play.coachApi = window.CoachUI.mount(panel, ctx);
  }

  // Mobile ke liye chhota dock: best move + 🔊 + details (bina scroll kiye).
  function renderDock(data, ctx) {
    const dock = $('#coach-dock', views.play);
    if (!dock) return;
    if (!data || !data.best || (play && play.result)) {
      dock.classList.add('hidden');
      dock.innerHTML = '';
      return;
    }
    const b = data.best;
    const why = b.why && b.why.length ? b.why[0].text.replace(/\*\*/g, '') : '';
    dock.classList.remove('hidden');
    dock.innerHTML = `
      <div class="dock-main">
        <span class="dock-san">${esc(b.san)}</span>
        <span class="dock-prob">${Math.round(b.winProb * 100)}%</span>
        <span class="dock-why">${esc(why.slice(0, 74))}${why.length > 74 ? '…' : ''}</span>
      </div>
      <div class="dock-btns">
        <button class="ico-btn" data-dock="speak" title="Sunो">🔊</button>
        <button class="btn tiny primary" data-dock="play">▶ Chalo</button>
        <button class="btn tiny ghost" data-dock="details">⤢ Details</button>
      </div>`;
  }

  function coachRefresh(force) {
    if (!play || !play.coachApi) return;
    if (play.result || play.thinking) return;
    if (play.game.turn !== play.playerColor) return;
    play.coachApi.refresh(!!force);
  }

  function renderPlay() {
    if (!play) newPlay(2, 'w');
    const el = views.play;
    el.innerHTML = `
      <div class="play-layout">
        <div>
          <div class="status-bar" id="play-status"><span class="dot"></span><span id="status-text">…</span><span class="spacer"></span><span class="tag" id="status-tag"></span></div>
          <div id="top-row"></div>
          <div class="board-shell"><div id="play-board"></div></div>
          <div id="bottom-row"></div>
          <div class="coach-dock hidden" id="coach-dock"></div>
        </div>
        <aside>
          <div class="panel coach-panel" id="coach-panel" aria-live="polite"></div>
          <div class="panel">
            <div class="field">
              <p class="field-label">Bot ka level</p>
              <div class="segmented" id="level-seg">
                ${[1, 2, 3, 4].map((l) => `<button class="seg ${play.level === l ? 'active' : ''}" data-level="${l}" title="${window.ChessAI.LEVELS[l].hint}">${window.ChessAI.LEVELS[l].emoji} ${window.ChessAI.LEVELS[l].name}</button>`).join('')}
              </div>
            </div>
            <div class="field">
              <p class="field-label">Tumhari color</p>
              <div class="segmented" id="color-seg">
                <button class="seg ${play.playerColor === 'w' ? 'active' : ''}" data-color="w">♔ White</button>
                <button class="seg ${play.playerColor === 'b' ? 'active' : ''}" data-color="b">♚ Black</button>
              </div>
            </div>
            <div class="field">
              <button class="btn primary" id="new-game" style="width:100%;justify-content:center">↻ Naya game</button>
              <p style="color:var(--muted);font-size:.78rem;margin:8px 0 0">Level badalne pe naya game shuru hoga.</p>
            </div>
          </div>
          <div class="panel">
            <h3>Chaal</h3>
            <div class="moves" id="moves"></div>
            <div class="control-row" style="margin-top:12px">
              <button class="btn small" id="undo">↩ Undo</button>
              <button class="btn small" id="hint">💡 Hint</button>
              <button class="btn small" id="flip">⇅ Flip</button>
            </div>
            <div id="result"></div>
          </div>
          <div class="panel" style="background:transparent;border-style:dashed">
            <p style="color:var(--muted);font-size:.82rem;margin:0">
              <b style="color:var(--text)">Tareeka:</b> piece pe click karo → green dots wale square pe click karo.
              Drag bhi kar sakte ho. Galat chaal ho jaye to <b style="color:var(--text)">Undo</b> dabao — seekhna isi me hai.
            </p>
          </div>
        </aside>
      </div>`;

    play.board = new window.ChessBoard($('#play-board', el), {
      game: play.game,
      orientation: play.playerColor,
      onMove: humanMove,
    });
    play.board.lastMove = play.lastMove;
    play.board.flipped = play.playerColor === 'b';
    play.board.render();

    mountCoach();

    $('#level-seg', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-level]');
      if (!b) return;
      const level = Number(b.dataset.level);
      if (level === play.level) return;
      newPlay(level, play.playerColor);
      renderPlay();
      toast(`${window.ChessAI.LEVELS[level].emoji} Level: ${window.ChessAI.LEVELS[level].name}`);
    });
    $('#color-seg', el).addEventListener('click', (e) => {
      const b = e.target.closest('[data-color]');
      if (!b || b.dataset.color === play.playerColor) return;
      newPlay(play.level, b.dataset.color);
      renderPlay();
    });
    $('#new-game', el).addEventListener('click', () => {
      newPlay(play.level, play.playerColor);
      renderPlay();
    });
    el.addEventListener('click', (e) => {
      const d = e.target.closest('[data-dock]');
      if (!d || !play || !play.coachCtx) return;
      const data = play.coachCtx.data;
      const act = d.dataset.dock;
      if (act === 'speak') {
        if (!data) return;
        if (window.Voice) { window.Voice.speakLong(data.spoken); toast('🔊 Guide bol raha hoon…'); }
      } else if (act === 'play') {
        if (data && data.best) play.coachCtx.onPlayMove(data.best.move);
      } else if (act === 'details') {
        const panel = $('#coach-panel', el);
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
    $('#undo', el).addEventListener('click', undoMove);
    $('#hint', el).addEventListener('click', showHint);
    $('#flip', el).addEventListener('click', () => {
      play.board.flipped = !play.board.flipped;
      play.board.render();
    });

    updatePlayUI();
    if (play.game.turn !== play.playerColor && !play.result) scheduleBot(420);
  }

  function updatePlayUI() {
    if (!play || !play.board) return;
    const el = views.play;
    const game = play.game;
    const st = play.result || statusOf(game);
    play.board.locked = play.thinking || !!play.result || game.turn !== play.playerColor;
    play.board.lastMove = play.lastMove;
    play.board.render();

    const statusEl = $('#play-status', el);
    const textEl = $('#status-text', el);
    const tagEl = $('#status-tag', el);
    if (!statusEl) return;

    statusEl.className = 'status-bar ' + (game.turn === 'w' ? 'w ' : 'b ') + (play.thinking ? 'thinking' : '');
    if (play.result) {
      if (play.result === 'checkmate') {
        const winner = game.turn === 'w' ? 'b' : 'w';
        textEl.textContent = winner === play.playerColor ? '🎉 Checkmate — tum jeet gaye!' : '😅 Checkmate — bot jeet gaya';
        tagEl.textContent = winner === play.playerColor ? 'Shabaash!' : 'Undo karke try karo';
      } else {
        textEl.textContent = '🤝 Draw — ' + (STATUS_TEXT[play.result] || play.result);
        tagEl.textContent = 'Barabar';
      }
    } else if (play.thinking) {
      textEl.innerHTML = '🤖 Bot soch raha hai<span class="thinking-dots"></span>';
      tagEl.textContent = 'Level ' + play.level;
    } else if (game.turn === play.playerColor) {
      textEl.textContent = game.inCheck() ? '⚠️ Check! Tumhe check se bachna hai' : '✅ Tumhari chaal';
      tagEl.textContent = play.playerColor === 'w' ? 'White' : 'Black';
    } else {
      textEl.textContent = '⏳ Bot ki chaal';
      tagEl.textContent = 'Level ' + play.level;
    }

    // players
    const topColor = play.playerColor === 'w' ? 'b' : 'w';
    const topRow = $('#top-row', el);
    const bottomRow = $('#bottom-row', el);
    if (topRow) topRow.innerHTML = playerRowHTML(topColor, true);
    if (bottomRow) bottomRow.innerHTML = playerRowHTML(play.playerColor, false);

    // moves
    const movesEl = $('#moves', el);
    if (movesEl) {
      let html = '';
      for (let i = 0; i < play.moves.length; i += 2) {
        const w = play.moves[i];
        const b = play.moves[i + 1];
        html += `<div class="move-row">
          <span class="num">${i / 2 + 1}.</span>
          <span class="${i === play.moves.length - 1 ? 'cur' : ''}">${esc(w ? w.san : '')}</span>
          <span class="${i + 1 === play.moves.length - 1 ? 'cur' : ''}">${esc(b ? b.san : '')}</span>
        </div>`;
      }
      movesEl.innerHTML = html;
      movesEl.scrollTop = movesEl.scrollHeight;
    }

    coachRefresh(false);

    // result card
    const resEl = $('#result', el);
    if (resEl) {
      if (play.result === 'checkmate') {
        const winner = game.turn === 'w' ? 'b' : 'w';
        resEl.innerHTML = `<div class="result-card">
          <b>${winner === play.playerColor ? 'Jeet gaye! 🏆' : 'Bot jeeta — lekin seekhne ko mila'}</b>
          ${winner === play.playerColor
            ? 'Ab level badha do, ya naya game khelo. Agli baar kam galtiyan — wahi asli progress hai.'
            : 'Game ka review karo: kahan piece free me gaya? Undo dabao aur usi position se dobara khelo.'}
        </div>`;
      } else if (play.result) {
        resEl.innerHTML = `<div class="result-card"><b>Draw 🤝</b>${esc(STATUS_TEXT[play.result] || 'Game draw ho gaya.')}</div>`;
      } else if (game.inCheck() && game.turn === play.playerColor) {
        resEl.innerHTML = `<div class="callout warn" style="margin:10px 0 0"><span class="ico">⚠️</span><div>Tumhara king check me hai. Teen options: king hatao, beech me piece block karo, ya attacker ko maaro.</div></div>`;
      } else {
        resEl.innerHTML = '';
      }
    }
  }

  function applyMove(move) {
    const san = play.game.san(move);
    play.game.makeMove(move);
    play.moves.push({ san, from: move.from, to: move.to, captured: move.captured || null });
    play.lastMove = { from: move.from, to: move.to, captured: move.captured || null };
    const st = statusOf(play.game);
    if (['checkmate', 'stalemate', 'draw-fifty', 'draw-material', 'draw-repetition'].includes(st)) {
      play.result = st;
      if (!play.counted) {
        play.counted = true;
        progress.games++;
        if (st === 'checkmate' && play.game.turn !== play.playerColor) progress.wins++;
        saveProgress();
      }
    }
    updatePlayUI();
  }

  function humanMove(from, to, promo) {
    if (!play || play.thinking || play.result) return;
    if (play.game.turn !== play.playerColor) return;
    const move = play.game.findMove(from, to, promo);
    if (!move) return;
    applyMove(move);
    if (!play.result) scheduleBot(300 + Math.random() * 260);
  }

  function scheduleBot(delay) {
    if (!play || play.thinking || play.result) return;
    if (play.game.turn === play.playerColor) return;
    play.thinking = true;
    updatePlayUI();
    setTimeout(() => {
      if (!play || !play.thinking) return;
      const res = window.ChessAI.chooseMove(play.game, play.level);
      play.thinking = false;
      if (res.move) applyMove(res.move);
      else updatePlayUI();
      if (play.game.turn !== play.playerColor && !play.result) scheduleBot(200);
    }, Math.max(220, delay || 260));
  }

  function undoMove() {
    if (!play || play.thinking) return;
    let guard = 0;
    do {
      if (!play.game.history.length) break;
      play.game.undoMove();
      play.moves.pop();
      guard++;
    } while (play.game.turn !== play.playerColor && guard < 4);
    play.result = null;
    const last = play.moves[play.moves.length - 1];
    play.lastMove = last ? { from: last.from, to: last.to } : null;
    updatePlayUI();
  }

  function showHint() {
    if (!play || play.thinking || play.result) return;
    if (play.game.turn !== play.playerColor) return;
    const cached = play.coachCtx && play.coachCtx.data && play.coachCtx.data.best;
    if (cached && !play.coachCtx.busy) {
      play.board.arrows = [[cached.move.from, cached.move.to, '#47d7a0']];
      play.board.hintSquares = [cached.move.from];
      play.board.render();
      const reason = cached.why && cached.why.length ? cached.why[0].text.replace(/\*\*/g, '') : '';
      toast(`💡 ${cached.san} — ${reason}`.slice(0, 140), 4200);
      return;
    }
    const res = window.ChessAI.chooseMove(play.game, Math.max(3, play.level), { maxNodes: 120000 });
    if (!res.move) return;
    const san = play.game.san(res.move);
    play.board.arrows = [[res.move.from, res.move.to, '#47d7a0']];
    play.board.hintSquares = [res.move.from];
    play.board.render();
    toast(`💡 Try karo: ${san}`);
    setTimeout(() => {
      if (!play || !play.board) return;
      play.board.arrows = [];
      play.board.hintSquares = [];
      play.board.render();
    }, 4000);
  }

  // ---------- PUZZLES ----------
  let activePuzzle = null;

  function renderPuzzleList() {
    const solvedCount = Object.keys(progress.puzzles).filter((k) => progress.puzzles[k]).length;
    views.puzzles.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:12px;flex-wrap:wrap">
        <div>
          <h1 style="margin:0 0 4px;font-size:1.6rem;letter-spacing:-.02em">🧩 Puzzles</h1>
          <p style="color:var(--muted);margin:0;font-size:.9rem">Sab mate in 1 hain — ek chaal me game khatam karo. 8 me se ek puzzle aisa hai jahan mate nahi hai, usme "nahi hai" bolna hoga.</p>
        </div>
        <span class="pill gold">${solvedCount}/${PUZZLES.length} solved</span>
      </div>
      <div class="puzzle-grid" style="margin-top:18px">
        ${PUZZLES.map((p, i) => `
          <button class="puzzle-card ${progress.puzzles[i] ? 'solved' : ''}" data-puzzle="${i}">
            <div class="theme">${esc(p.theme)}</div>
            <div class="ptitle">${esc(p.title)}</div>
            <div class="pmeta">${progress.puzzles[i] ? '✓ Solved' : 'Solve karo →'}</div>
          </button>`).join('')}
      </div>
      <div class="callout tip" style="margin-top:22px"><span class="ico">💡</span><div>Puzzle pe atak gaye? <b>Hint</b> dabao, phir bhi na ho to <b>Solution</b>. Solution dekhne se sharm mat karo — pattern yaad rakhna zaroori hai.</div></div>
    `;
    $$('[data-puzzle]', views.puzzles).forEach((b) => b.addEventListener('click', () => { location.hash = '#/puzzles/' + b.dataset.puzzle; }));
  }

  function renderPuzzle(index) {
    const p = PUZZLES[index];
    if (!p) { location.hash = '#/puzzles'; return; }
    const isTrap = p.goal === 'nomate';

    views.puzzles.innerHTML = `
      <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">
        <button class="btn small ghost" data-back>← Saare puzzles</button>
        <span class="pill gold">${esc(p.theme)}</span>
        <span class="pill">Puzzle ${index + 1} / ${PUZZLES.length}</span>
        ${progress.puzzles[index] ? '<span class="pill" style="color:var(--green)">✓ solved</span>' : ''}
      </div>
      <div class="puzzle-active">
        <div class="board-shell"><div id="puzzle-board"></div></div>
        <aside>
          <div class="panel">
            <h3>${esc(p.title)}</h3>
            <p style="color:var(--muted);font-size:.86rem;margin:0 0 12px">${isTrap ? 'Dhyaan se dekho — kya yahan sach me mate in 1 hai?' : 'White ki chaal hai. Ek chaal me checkmate do.'}</p>
            <div class="control-row">
              <button class="btn small" data-hint>💡 Hint</button>
              ${isTrap
                ? '<button class="btn small primary" data-nomate>🙅 Nahi, mate nahi hai</button><button class="btn small" data-yesmate>✅ Haan, mate hai</button>'
                : '<button class="btn small" data-sol>👁 Solution</button>'}
            </div>
            <div class="practice-feedback" id="puzzle-feedback"></div>
          </div>
          <div class="panel" style="background:transparent;border-style:dashed">
            <p style="color:var(--muted);font-size:.82rem;margin:0">
              <b style="color:var(--text)">Puzzle ka tareeka:</b> pehle khud socho — check, capture, threat. Phir chaal chalao.
              Galat chaal wapas aa jaayegi, tension mat lo.
            </p>
          </div>
          <div class="control-row" style="margin-top:12px">
            ${index > 0 ? `<button class="btn small" data-prev-puzzle="1">← Pichhla</button>` : ''}
            ${index < PUZZLES.length - 1 ? `<button class="btn small primary" data-next-puzzle="1">Agla puzzle →</button>` : ''}
          </div>
        </aside>
      </div>`;

    const fb = $('#puzzle-feedback', views.puzzles);
    let game = new Chess(p.fen);
    let solved = progress.puzzles[index] === true;
    let board;

    function feedback(text, kind) {
      fb.textContent = text;
      fb.className = 'practice-feedback ' + (kind || '');
    }

    function setSolved(msg) {
      solved = true;
      progress.puzzles[index] = true;
      saveProgress();
      feedback(msg || 'Correct! 🎉', 'ok');
      if (board) { board.interactive = false; board.render(); }
      toast('Puzzle solved! 🎉');
    }

    board = new window.ChessBoard($('#puzzle-board', views.puzzles), {
      game,
      interactive: !isTrap,
      orientation: game.turn === 'b' ? 'b' : 'w',
      onMove: (from, to, promo) => {
        if (solved || isTrap) return;
        const move = game.findMove(from, to, promo);
        if (!move) return;
        const san = game.san(move);
        game.makeMove(move);
        board.lastMove = { from, to };
        board.render();
        if (game.status() === 'checkmate') {
          setSolved(`Checkmate — ${san}! 🎉`);
        } else {
          feedback(move.promotion
            ? 'Promotion ho gayi, par mate nahi. Queen choose karke dekho.'
            : 'Ye mate nahi hai. Dobara socho — king ke paas bhaagne ki jagah dekho.', 'bad');
          setTimeout(() => {
            game.undoMove();
            board.lastMove = null;
            board.render();
            board.flash(from, to);
          }, 550);
        }
      },
    });

    $('[data-back]', views.puzzles).addEventListener('click', () => { location.hash = '#/puzzles'; });
    const prev = $('[data-prev-puzzle]', views.puzzles);
    if (prev) prev.addEventListener('click', () => { location.hash = '#/puzzles/' + (index - 1); });
    const next = $('[data-next-puzzle]', views.puzzles);
    if (next) next.addEventListener('click', () => { location.hash = '#/puzzles/' + (index + 1); });

    $('[data-hint]', views.puzzles).addEventListener('click', () => feedback(p.hint, ''));
    const solBtn = $('[data-sol]', views.puzzles);
    if (solBtn) solBtn.addEventListener('click', () => {
      const g = new Chess(p.fen);
      for (const m of g.legalMoves()) {
        const san = g.san(m);
        g.makeMove(m);
        const st = g.status();
        g.undoMove();
        if (st === 'checkmate') {
          board.arrows = [[m.from, m.to, '#47d7a0']];
          board.render();
          feedback(`Solution: ${san}. Ab khud chalao.`, '');
          return;
        }
      }
      feedback('Is position me mate in 1 nahi hai.', '');
    });

    if (isTrap) {
      $('[data-nomate]', views.puzzles).addEventListener('click', () => setSolved('Sahi jawab! 🎉 Yahan mate in 1 nahi hai — g7 khali hai, isliye king bach jaata hai.'));
      $('[data-yesmate]', views.puzzles).addEventListener('click', () => feedback('Nahi — dekho g7 khali hai. Rd8+ ke baad king Kg7 chal jaayega. Isliye mate nahi hai.', 'bad'));
    }

    if (solved) {
      feedback('Ye puzzle pehle solve kar chuke ho ✓', 'ok');
      board.interactive = false;
      board.render();
    }
    activePuzzle = { index, game, board };
  }

  // ---------- boot ----------
  if (!location.hash) location.hash = '#/home';
  route();
})();
