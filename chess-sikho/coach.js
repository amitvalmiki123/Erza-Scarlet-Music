// coach.js — "Guide mode": har position pe best move + KYU (Hinglish),
// alternatives, opponent ki expected chaalein probability ke saath, threats,
// capture hisaab aur opening plan. Voice (TTS) bhi isi me hai.
(function (root) {
  'use strict';

  const Coach = root.ChessCoach;
  const AI = root.ChessAI;
  const GLYPH = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };

  const KEY = 'chessSikho.coach';
  const small = typeof window !== 'undefined' && window.innerWidth < 900;
  const settings = {
    on: true,
    voice: false,
    depth: small ? 2 : 3,
    showReplies: true,
    rate: 1,
  };
  const Store = (typeof globalThis !== 'undefined' ? globalThis : window).AppStorage || {
    getJSON: (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || f; } catch (e) { return f; } },
    setJSON: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  Object.assign(settings, Store.getJSON(KEY, {}));
  function save() { Store.setJSON(KEY, settings); }

  // Browser me speech bina user-gesture ke block ho jaati hai — first tap pe unlock.
  let unlocked = false;
  if (typeof document !== 'undefined') {
    const un = () => { unlocked = true; };
    document.addEventListener('pointerdown', un, { once: true });
    document.addEventListener('keydown', un, { once: true });
  }

  const cache = new Map();
  let timer = null;
  let mounted = null;

  function fmt(text) {
    return String(text || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
  }
  const pct = (p) => Math.round((p || 0) * 100) + '%';

  function cacheGet(fen) {
    if (cache.has(fen)) {
      const v = cache.get(fen);
      cache.delete(fen);
      cache.set(fen, v);
      return v;
    }
    return null;
  }
  function cacheSet(fen, val) {
    cache.set(fen, val);
    if (cache.size > 40) cache.delete(cache.keys().next().value);
  }

  // ---------- rendering ----------
  function whyList(items) {
    if (!items || !items.length) return '';
    return `<ul class="why">${items.map((w) => `<li class="${w.tone}"><span class="wi">${w.icon}</span><span>${fmt(w.text)}</span></li>`).join('')}</ul>`;
  }

  function bar(prob, cls) {
    return `<span class="mini-bar ${cls || ''}"><i style="width:${Math.max(2, Math.round(prob * 100))}%"></i></span>`;
  }

  function renderBody(ctx) {
    const a = ctx.data;
    if (!a) return '';
    const parts = [];

    // --- best move ---
    if (a.best) {
      const b = a.best;
      parts.push(`
        <div class="coach-best">
          <div class="cb-top">
            <span class="cb-label">Sabse achhi chaal</span>
            <span class="cb-prob">${pct(b.winProb)} jeet</span>
          </div>
          <div class="cb-move">
            <span class="cb-san">${fmt(b.san)}</span>
            ${bar(b.winProb, 'win')}
          </div>
          ${whyList(b.why)}
          <div class="cb-actions">
            <button class="btn tiny primary" data-act="play">▶ Ye chaal chalo</button>
            <button class="btn tiny" data-act="speak">🔊 Suno</button>
            <button class="btn tiny ghost" data-act="show">👁 Board pe dikhao</button>
          </div>
        </div>`);
    } else if (a.over) {
      parts.push(`<div class="coach-empty">Game khatam — chaal baaki nahi hai.</div>`);
    }

    // --- alternatives ---
    if (a.alts && a.alts.length) {
      parts.push(`
        <details class="coach-sec" open>
          <summary>Dusre options <span class="dim">(${a.alts.length})</span></summary>
          <div class="alt-list">
            ${a.alts.map((x) => `
              <button class="alt-row" data-alt="${fmt(x.san)}">
                <span class="alt-san">${fmt(x.san)}</span>
                ${bar(x.winProb)}
                <span class="alt-pct">${pct(x.winProb)}</span>
                <span class="alt-gap">${x.gap > 0 ? '−' + (x.gap / 100).toFixed(1) : 'same'}</span>
              </button>`).join('')}
          </div>
        </details>`);
    }

    // --- opponent replies ---
    if (settings.showReplies && a.replies && a.replies.length) {
      parts.push(`
        <details class="coach-sec" open>
          <summary>Opponent kya khel sakta hai <span class="dim">(probability)</span></summary>
          <div class="reply-list">
            ${a.replies.map((r) => `
              <div class="reply-row">
                <div class="rr-head">
                  <span class="rr-san">${fmt(r.san)}</span>
                  ${bar(r.prob, 'rep')}
                  <span class="rr-pct">${pct(r.prob)}</span>
                </div>
                <div class="rr-note">${fmt(r.note)}</div>
                ${r.answer ? `<div class="rr-answer">👉 Jawab: <b>${fmt(r.answer.san)}</b> — ${fmt(r.answer.note)}</div>` : ''}
              </div>`).join('')}
          </div>
        </details>`);
    }

    // --- threats ---
    if (a.threats && a.threats.length) {
      parts.push(`
        <details class="coach-sec warn" open>
          <summary>⚠️ Dhyan rakho</summary>
          <ul class="threat-list">${a.threats.map((t) => `<li class="sev${t.severity}">${fmt(t.text)}</li>`).join('')}</ul>
        </details>`);
    }

    // --- captures ---
    if (a.captures && a.captures.length) {
      parts.push(`
        <details class="coach-sec">
          <summary>💰 Capture ka hisaab</summary>
          <div class="cap-list">
            ${a.captures.map((c) => `<div class="cap-row ${c.see > 50 ? 'good' : c.see < -30 ? 'bad' : ''}">
              <b>${fmt(c.san)}</b><span>${fmt(c.verdict)}</span><span class="cap-val">${(c.see / 100).toFixed(1)}</span>
            </div>`).join('')}
          </div>
        </details>`);
    }

    // --- opening ---
    if (a.opening) {
      const o = a.opening;
      parts.push(`
        <details class="coach-sec book" ${o.reached ? 'open' : ''}>
          <summary>📖 ${fmt(o.name)} ${o.reached ? '' : '<span class="dim">(aa sakti hai)</span>'}</summary>
          <p class="book-idea">${fmt(o.idea)}</p>
          ${o.nextMoves && o.nextMoves.length ? `<p class="book-next">Aage ki chaalein: <b>${o.nextMoves.map(fmt).join(' → ')}</b></p>` : ''}
          <ol class="book-plan">${o.plan.map((p) => `<li>${fmt(p)}</li>`).join('')}</ol>
          ${o.trap ? `<div class="book-trap">⚠️ ${fmt(o.trap)}</div>` : ''}
        </details>`);
    } else if (a.firstMove) {
      parts.push(`<details class="coach-sec book" open><summary>📖 Pehli chaal</summary><p class="book-idea">${fmt(a.firstMove.text)}</p></details>`);
    }

    // --- plan ---
    if (a.plan && a.plan.length) {
      parts.push(`
        <details class="coach-sec">
          <summary>🧭 Abhi ka plan <span class="dim">(${a.phase === 'opening' ? 'opening' : a.phase === 'middlegame' ? 'middlegame' : 'endgame'})</span></summary>
          <ol class="book-plan">${a.plan.map((p) => `<li>${fmt(p)}</li>`).join('')}</ol>
        </details>`);
    }

    return parts.join('');
  }

  function render() {
    if (!mounted) return;
    const { root: el, ctx } = mounted;
    const body = el.querySelector('[data-coach-body]');
    if (!body) return;

    el.classList.toggle('off', !settings.on);

    const head = el.querySelector('[data-coach-head]');
    if (head) {
      head.innerHTML = `
        <span class="coach-title">🧠 Coach</span>
        <span class="coach-spacer"></span>
        <button class="ico-btn ${settings.voice ? 'on' : ''}" data-act="voice" title="Voice guide">${settings.voice ? '🔊' : '🔇'}</button>
        <button class="ico-btn ${settings.on ? 'on' : ''}" data-act="toggle" title="Guide on/off">${settings.on ? '✅' : '⏸️'}</button>`;
    }

    if (!settings.on) {
      body.innerHTML = `<div class="coach-empty">Guide band hai. ✅ dabao ya <button class="linkish" data-act="once">ek baar analyze karo</button>.</div>`;
      return;
    }
    if (ctx.busy) {
      body.innerHTML = `<div class="coach-busy"><span class="spinner"></span> Coach soch raha hai… <span class="dim">(depth ${settings.depth})</span></div>`;
      return;
    }
    if (!ctx.data) {
      body.innerHTML = `<div class="coach-empty">Analysis ready nahi. <button class="linkish" data-act="analyze">Abhi analyze karo</button></div>`;
      return;
    }
    if (ctx.stale) {
      body.innerHTML = `<div class="coach-empty">Position badal gayi — <button class="linkish" data-act="analyze">dobara analyze karo</button></div>`;
      return;
    }
    body.innerHTML = renderBody(ctx) + `
      <div class="coach-foot">
        <span class="dim">depth ${settings.depth} · ${ctx.ms ? ctx.ms + 'ms' : ''}</span>
        <span class="coach-spacer"></span>
        <button class="btn tiny ghost" data-act="depth-down">−</button>
        <span class="depth-val">${settings.depth}</span>
        <button class="btn tiny ghost" data-act="depth-up">+</button>
        <button class="btn tiny ghost" data-act="refresh">↻</button>
      </div>`;
  }

  // ---------- analysis ----------
  function analyze(ctx, force) {
    if (!mounted || mounted.ctx !== ctx) return;
    if (!settings.on && !force) { ctx.data = null; render(); return; }
    const game = ctx.getGame();
    if (!game) return;
    const fen = game.fen();
    const sans = ctx.getSans ? ctx.getSans() : [];
    const cacheKey = fen + '|' + settings.depth;
    if (!force) {
      const hit = cacheGet(cacheKey);
      if (hit) {
        ctx.data = hit.data; ctx.ms = hit.ms; ctx.busy = false; ctx.stale = false; ctx.fen = fen;
        render();
        return;
      }
    }
    ctx.busy = true; ctx.stale = false; ctx.fen = fen;
    render();
    clearTimeout(timer);
    timer = setTimeout(() => {
      const g2 = ctx.getGame();
      if (!g2 || g2.fen() !== fen) { ctx.busy = false; ctx.stale = true; render(); return; }
      const t0 = Date.now();
      let data = null;
      try {
        data = Coach.analyze(g2, {
          sanHistory: sans,
          depth: settings.depth,
          maxNodes: settings.depth >= 4 ? 120000 : settings.depth === 3 ? 60000 : 24000,
        });
      } catch (e) {
        data = null;
      }
      const ms = Date.now() - t0;
      ctx.busy = false;
      ctx.data = data;
      ctx.ms = ms;
      if (data) cacheSet(cacheKey, { data, ms });
      render();
      if (data && ctx.onArrow) ctx.onArrow(data.best ? data.best.move : null);
      if (data && settings.voice && unlocked && ctx.shouldSpeak !== false) speak(data.spoken);
    }, 40);
  }

  function speak(text) {
    if (!text) return;
    const V = root.Voice;
    if (!V || !V.supported()) return;
    V.rate = settings.rate;
    if (!V.speakLong(text)) {
      const note = mounted && mounted.root.querySelector('[data-coach-body]');
      if (note) note.insertAdjacentHTML('afterbegin',
        '<div class="coach-empty">🔇 Voice is browser me blocked hai — ek baar screen pe tap karo, phir chalegi.</div>');
    }
  }

  // ---------- public API ----------
  function mount(container, ctx) {
    container.innerHTML = `
      <div class="coach-head" data-coach-head></div>
      <div class="coach-body" data-coach-body></div>`;
    container.classList.add('coach');
    mounted = { root: container, ctx };
    ctx.busy = false; ctx.stale = false; ctx.data = null;

    container.addEventListener('click', (e) => {
      const t = e.target.closest('[data-act]');
      const alt = e.target.closest('[data-alt]');
      if (alt && !t) {
        const san = alt.dataset.alt;
        const a = ctx.data && ctx.data.alts ? ctx.data.alts.find((x) => x.san === san) : null;
        if (a && ctx.onArrow) ctx.onArrow(a.move, true);
        if (a && ctx.onPreview) ctx.onPreview(a);
        return;
      }
      if (!t) return;
      const act = t.dataset.act;
      if (act === 'toggle') { settings.on = !settings.on; save(); if (settings.on) analyze(ctx, true); else render(); }
      else if (act === 'once') { analyze(ctx, true); }
      else if (act === 'analyze' || act === 'refresh') { analyze(ctx, true); }
      else if (act === 'voice') {
        settings.voice = !settings.voice; save();
        if (settings.voice) { unlocked = true; if (ctx.data) speak(ctx.data.spoken); }
        else if (root.Voice) root.Voice.stop();
        render();
      }
      else if (act === 'speak') { unlocked = true; if (ctx.data) speak(ctx.data.spoken); }
      else if (act === 'play' && ctx.data && ctx.data.best && ctx.onPlayMove) ctx.onPlayMove(ctx.data.best.move);
      else if (act === 'show' && ctx.data && ctx.data.best && ctx.onArrow) ctx.onArrow(ctx.data.best.move, true);
      else if (act === 'depth-up' && settings.depth < 4) { settings.depth++; save(); analyze(ctx, true); }
      else if (act === 'depth-down' && settings.depth > 1) { settings.depth--; save(); analyze(ctx, true); }
    });

    render();
    analyze(ctx, false);
    return { refresh: (force) => analyze(ctx, force), settings };
  }

  function unmount() {
    clearTimeout(timer);
    mounted = null;
    if (root.Voice) root.Voice.stop();
  }

  root.CoachUI = { mount, unmount, analyze, get settings() { return settings; }, cache };
})(typeof globalThis !== 'undefined' ? globalThis : this);
