# ♞ Chess Sikho — Hinglish chess crash course

Ek chhota, offline, zero-dependency web app jo beginner ko **jaldi chess sikhata hai**:
rules → opening principles → mate patterns, plus real playable board aur puzzles.

## Kaise chalaayein

```bash
python3 chess-sikho/serve.py 8000
# phir browser me kholo: http://localhost:8000
```

Ya bas `index.html` browser me direct khol lo — build step nahi hai, koi dependency nahi.
(Static file server host pe bhi deploy kar sakte ho — `chess-sikho/` folder hi daal do.)

## Kya-kya hai

| View | Kya milta hai |
|---|---|
| **Home** | 15-minute route, progress, piece-value cheat sheet, "har move se pehle 3 sawaal" |
| **Seekho** | 15 lessons (2–5 min each), 28 interactive diagram boards, 6 practice widgets, "⚡ Crash" mode = sirf 6 zaroori lessons |
| **Khelo** | Poora chess board vs bot (4 levels), undo, hint, flip, move list, captured pieces, material advantage |
| **Puzzles** | 8 mate-in-1 puzzles (back rank, ladder, queen mate, promotion) + 1 trap puzzle |

Progress browser ke `localStorage` me save hota hai (`chessSikho.v1`). Footer se reset kar sakte ho.

## Files

```
chess-sikho/
├── index.html     # markup + script tags
├── styles.css     # scarlet/ember dark theme, mobile friendly
├── engine.js      # chess rules: castling, en passant, promotion, draws, SAN, FEN
├── ai.js          # alpha-beta + piece-square tables bot (levels 1–4)
├── board.js       # click + drag board UI, arrows, promotion picker
├── lessons.js     # SAARA content yahan hai (lessons + puzzles) — yahi edit karo
├── app.js         # views, progress, practice widgets, game loop, puzzles
├── serve.py       # zero-dependency static server
└── test/
    ├── perft.cjs  # engine correctness (standard perft positions)
    └── dom.cjs    # jsdom smoke test for the whole UI
```

## Content edit karna

`lessons.js` me `window.LESSONS` array hai. Har lesson ke `blocks` me ye blocks chalte hain:

- `{ h: 'Heading' }`
- `{ p: 'Paragraph with **bold** and `code`' }`
- `{ list: ['point 1', 'point 2'] }` / `{ steps: [...] }` (numbered)
- `{ tip: '...' }`, `{ warn: '...' }`, `{ note: '...' }` — callouts
- `{ table: { head: [...], rows: [[...]] } }`
- `{ diagram: { fen: '...', arrows: [['e2','e4']], highlights: ['d1'], caption: '...' } }`
- `{ practice: { fen: '...', goal: 'mate1' | 'mateOrPromote' | 'promote' | 'castle' | 'reach' | 'free', target: 'c3', hint: '...' } }`

## Tests

```bash
node chess-sikho/test/perft.cjs     # engine: perft 1-4, SAN, mate/stalemate
# UI test ke liye (ek baar jsdom install karo):
npm i jsdom && JSDOM_PATH=$(node -p "require.resolve('jsdom')") node chess-sikho/test/dom.cjs
```

Perft numbers standard test positions se match karte hain (startpos 197281, Kiwipete 97862, etc.).

## Bot levels

| Level | Kya karta hai |
|---|---|
| 1 🐣 Naya khiladi | depth 1 + 55% random/galti — beginner jeet sakta hai |
| 2 🙂 Sikhne wala | depth 2 — basic tactics |
| 3 😎 Theek-thaak | depth 3 — 3 chaal aage |
| 4 🔥 Club player | depth 4 — dhyaan se khelo |

Ye app `Erza-Scarlet-Music` repo ke andar ek standalone folder hai — music bot ke code ko touch nahi karta.
