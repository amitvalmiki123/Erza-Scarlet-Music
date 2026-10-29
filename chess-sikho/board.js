// board.js — draggable / clickable chess board UI. ChessKit ke saath chalta hai.
(function (root) {
  'use strict';
  const { sqToName, nameToSq } = root.ChessKit;

  const GLYPHS = { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' };
  const PROMO_ORDER = ['q', 'r', 'b', 'n'];

  class Board {
    constructor(el, opts = {}) {
      this.el = el;
      this.opts = opts;
      this.game = opts.game || null;
      this.flipped = opts.orientation === 'b';
      this.interactive = opts.interactive !== false;
      this.locked = false;
      this.onMove = opts.onMove || function () {};
      this.selected = null;
      this.lastMove = null;
      this.arrows = [];
      this.hintSquares = [];
      this.checkSq = -1;
      this.showLegal = opts.showLegal !== false;
      this._dragging = null;
      this._promo = null;
      this._build();
      this.render();
    }

    setGame(game) {
      this.game = game;
      this.selected = null;
      this.lastMove = null;
      this.arrows = [];
      this.hintSquares = [];
      this.checkSq = -1;
      this.render();
    }

    setOrientation(color) {
      this.flipped = color === 'b';
      this.render();
    }

    _build() {
      this.el.classList.add('chboard');
      this.el.innerHTML = '';
      this.squares = [];
      for (let v = 0; v < 64; v++) {
        const d = document.createElement('div');
        d.className = 'sq';
        const piece = document.createElement('span');
        piece.className = 'piece';
        d.appendChild(piece);
        const coord = document.createElement('span');
        coord.className = 'coord';
        d.appendChild(coord);
        this.el.appendChild(d);
        this.squares.push(d);
      }
      this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      this.svg.setAttribute('class', 'arrows');
      this.svg.setAttribute('viewBox', '0 0 8 8');
      this.svg.setAttribute('preserveAspectRatio', 'none');
      this.el.appendChild(this.svg);

      this.el.addEventListener('pointerdown', (e) => {
        activeBoard = this;
        this._down(e);
      });
    }

    sqFromEvent(e) {
      const rect = this.el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x < 0 || y < 0 || x >= rect.width || y >= rect.height) return -1;
      let col = Math.floor((x / rect.width) * 8);
      let row = Math.floor((y / rect.height) * 8);
      col = Math.max(0, Math.min(7, col));
      row = Math.max(0, Math.min(7, row));
      const v = row * 8 + col;
      return this.flipped ? 63 - v : v;
    }

    _canControl(sq) {
      if (!this.interactive || this.locked || !this.game || this.game.status() === 'checkmate' || this.game.status() === 'stalemate') return false;
      const pc = this.game.board[sq];
      return !!pc && (pc === pc.toUpperCase() ? 'w' : 'b') === this.game.turn;
    }

    legalTo(sq) {
      if (this.selected === null || !this.game) return false;
      return this.game.movesFrom(this.selected).some((m) => m.to === sq);
    }

    _down(e) {
      if (!this.game || this._promo) return;
      const sq = this.sqFromEvent(e);
      if (sq < 0) return;
      if (this.locked) return;
      e.preventDefault();

      // Pehle se selected piece ho aur destination pe tap -> move
      if (this.selected !== null && sq !== this.selected && this.legalTo(sq)) {
        this._tryMove(this.selected, sq);
        return;
      }
      if (this._canControl(sq)) {
        this.selected = this.selected === sq ? null : sq;
        this._dragStart = { sq, x: e.clientX, y: e.clientY };
        this.render();
      } else {
        this.selected = null;
        this.render();
      }
    }

    _move(e) {
      if (!this._dragStart || this.locked) return;
      const dx = e.clientX - this._dragStart.x;
      const dy = e.clientY - this._dragStart.y;
      if (!this._dragging && Math.hypot(dx, dy) > 8) {
        const pc = this.game.board[this._dragStart.sq];
        if (!pc) return;
        const ghost = document.createElement('div');
        ghost.className = 'drag-ghost ' + (pc === pc.toUpperCase() ? 'white' : 'black');
        ghost.textContent = GLYPHS[pc.toLowerCase()];
        document.body.appendChild(ghost);
        this._dragging = ghost;
        this.el.classList.add('dragging');
      }
      if (this._dragging) {
        this._dragging.style.transform = `translate(${e.clientX}px, ${e.clientY}px) translate(-50%, -50%)`;
        const sq = this.sqFromEvent(e);
        this.squares.forEach((d, v) => {
          d.classList.toggle('hover', Number(d.dataset.sq) === sq && this.legalTo(sq));
        });
      }
    }

    _up(e) {
      if (this._dragStart && this.locked) {
        this._dragStart = null;
        this._clearGhost();
        return;
      }
      if (!this._dragStart) return;
      const from = this._dragStart.sq;
      const wasDragging = !!this._dragging;
      const target = wasDragging ? this.sqFromEvent(e) : -1;
      this._dragStart = null;
      this._clearGhost();
      if (wasDragging) {
        if (target >= 0 && target !== from && this.legalTo(target)) {
          this._tryMove(from, target);
          return;
        }
        this.render();
      }
    }

    _clearGhost() {
      if (this._dragging) this._dragging.remove();
      this._dragging = null;
      this.el.classList.remove('dragging');
      this.squares.forEach((d) => d.classList.remove('hover'));
    }

    _tryMove(from, to) {
      const moves = this.game.movesFrom(from).filter((m) => m.to === to);
      if (!moves.length) return;
      if (moves.length > 1 && moves[0].promotion) {
        this.selected = null;
        this.render();
        this._showPromotion(from, to);
        return;
      }
      this.selected = null;
      this.render();
      this.onMove(from, to, null);
    }

    _showPromotion(from, to) {
      const layer = document.createElement('div');
      layer.className = 'promo-layer';
      const box = document.createElement('div');
      box.className = 'promo-box';
      const white = this.game.turn === 'w';
      for (const p of PROMO_ORDER) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'promo-btn ' + (white ? 'white' : 'black');
        b.textContent = GLYPHS[p];
        b.title = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' }[p];
        b.addEventListener('click', () => {
          layer.remove();
          this._promo = null;
          this.onMove(from, to, p);
        });
        box.appendChild(b);
      }
      layer.appendChild(box);
      layer.addEventListener('click', (ev) => {
        if (ev.target === layer) {
          layer.remove();
          this._promo = null;
          this.render();
        }
      });
      this._promo = layer;
      this.el.parentElement.appendChild(layer);
    }

    render() {
      if (!this.game) {
        for (let v = 0; v < 64; v++) this.squares[v].dataset.color = ((v >> 3) + (v & 7)) % 2 === 0 ? 'light' : 'dark';
        return;
      }
      const legal = this.selected !== null ? this.game.movesFrom(this.selected) : [];
      const legalTargets = new Set(legal.map((m) => m.to));
      const game = this.game;
      for (let v = 0; v < 64; v++) {
        const sq = this.flipped ? 63 - v : v;
        const d = this.squares[v];
        const row = sq >> 3;
        const col = sq & 7;
        d.dataset.sq = String(sq);
        d.dataset.color = (row + col) % 2 === 0 ? 'light' : 'dark';
        const pc = game.board[sq];
        const pieceEl = d.querySelector('.piece');
        pieceEl.textContent = pc ? GLYPHS[pc.toLowerCase()] : '';
        pieceEl.dataset.color = pc ? (pc === pc.toUpperCase() ? 'white' : 'black') : '';
        const c = d.querySelector('.coord');
        let coord = '';
        const bottomRow = this.flipped ? 0 : 7;
        const leftCol = this.flipped ? 7 : 0;
        if (row === bottomRow) coord += 'abcdefgh'[col];
        if (col === leftCol) coord += String(8 - row);
        c.textContent = coord;

        d.classList.toggle('sel', this.selected === sq);
        d.classList.toggle('last', !!this.lastMove && (this.lastMove.from === sq || this.lastMove.to === sq));
        d.classList.toggle('check', this.checkSq === sq);
        d.classList.toggle('hint', this.hintSquares.includes(sq));
        const isTarget = this.showLegal && legalTargets.has(sq);
        d.classList.toggle('target', isTarget);
        d.classList.toggle('capture', isTarget && !!pc);
      }
      this._drawArrows();
    }

    _drawArrows() {
      this.svg.innerHTML = '';
      const ns = 'http://www.w3.org/2000/svg';
      const defs = document.createElementNS(ns, 'defs');
      defs.innerHTML =
        '<marker id="arrowhead" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="3.4" markerHeight="3.4" orient="auto-start-reverse">' +
        '<path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor"/></marker>';
      this.svg.appendChild(defs);
      for (const a of this.arrows) {
        const from = typeof a[0] === 'string' ? nameToSq(a[0]) : a[0];
        const to = typeof a[1] === 'string' ? nameToSq(a[1]) : a[1];
        const f = this.flipped ? 63 - from : from;
        const t = this.flipped ? 63 - to : to;
        const x1 = (f & 7) + 0.5, y1 = (f >> 3) + 0.5;
        const x2 = (t & 7) + 0.5, y2 = (t >> 3) + 0.5;
        const line = document.createElementNS(ns, 'line');
        line.setAttribute('x1', x1); line.setAttribute('y1', y1);
        line.setAttribute('x2', x2); line.setAttribute('y2', y2);
        line.setAttribute('stroke', a[2] || '#e8b34b');
        line.setAttribute('stroke-width', '0.14');
        line.setAttribute('stroke-linecap', 'round');
        line.setAttribute('opacity', '0.9');
        line.setAttribute('marker-end', 'url(#arrowhead)');
        this.svg.appendChild(line);
      }
    }

    flash(...squares) {
      for (const s of squares) {
        const v = this.flipped ? 63 - s : s;
        const el = this.squares[v];
        if (!el) continue;
        el.classList.add('flash');
        setTimeout(() => el.classList.remove('flash'), 650);
      }
    }
  }

  // Ek hi global pointermove/up listener — har board ka apna listener nahi (leak se bacho).
  let activeBoard = null;
  window.addEventListener('pointermove', (e) => { if (activeBoard) activeBoard._move(e); });
  window.addEventListener('pointerup', (e) => {
    const b = activeBoard;
    activeBoard = null;
    if (b) b._up(e);
  });
  window.addEventListener('pointercancel', () => {
    const b = activeBoard;
    activeBoard = null;
    if (b) b._up({ clientX: -9999, clientY: -9999 });
  });

  root.ChessBoard = Board;
})(typeof globalThis !== 'undefined' ? globalThis : this);
