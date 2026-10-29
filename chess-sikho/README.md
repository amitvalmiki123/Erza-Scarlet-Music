# ♞ Chess Sikho — offline Hinglish chess coach

Ek zero-dependency chess learning app: **Hinglish lessons + asli board + coach jo har
move pe batata hai kya chalna chahiye aur KYU** — browser me bhi, aur **native Android
APK** me bhi (poora offline, koi permission nahi).

## 📱 APK (Android)

**Download:** https://github.com/amitvalmiki123/Erza-Scarlet-Music/releases/tag/chess-sikho-apk

- `ChessSikho.apk` — release build (~120 KB)
- Phone me link kholo → APK download → install ("Unknown sources" allow karna padega)
- Internet permission **nahi** hai — lessons, bot, coach, voice sab phone ke andar chalta hai
- Progress + settings `SharedPreferences` me save hote hain

APK GitHub Actions pe build hota hai (`.github/workflows/android-apk.yml`) — har push pe
`chess-sikho/**` badalne par naya APK release ho jaata hai.

### APK khud build karna

```bash
cd chess-sikho/android
./gradlew assembleRelease          # app/build/outputs/apk/release/app-release.apk
```

Zaroori: JDK 17 + Android SDK (platform 34). Web files build time par
`chess-sikho/` se `assets/` me copy hoti hain (Gradle `copyWebAssets` task) —
isliye alag se copy karne ki zaroorat nahi.

## 🖥️ Browser me chalana

```bash
python3 chess-sikho/serve.py 8000      # http://localhost:8000
```

Ya `chess-sikho/index.html` ko direct khol lo. Build step nahi, koi CDN nahi.

## 🧠 Coach (guide mode) kya karta hai

Khelo tab me sidebar me coach panel hai. Har position pe:

| Section | Kya milta hai |
|---|---|
| **Sabse achhi chaal** | Best move + jeetne ki probability + **kyu** (Hinglish bullets) |
| **Dusre options** | 2nd–4th best moves, unki win% aur best se kitna peeche |
| **Opponent kya khel sakta hai** | Top 3 replies **probability %** ke saath + har ek ka **jawab** aur uska reason |
| **🩹 Tumhare piece khatre me** | Hanging pieces / saste piece se attack ho rahe pieces |
| **⚠️ Dhyan rakho** | Opponent ke threats (free capture, check, mate idea) |
| **💰 Capture ka hisaab** | Har possible capture ka SEE verdict: lena chahiye / barabar / nuksan |
| **📖 Opening** | Position kis opening ki hai, idea, aage ki chaalein, aur trap |
| **🧭 Plan** | Opening / middlegame / endgame ke hisaab se concrete tips |

Buttons: **▶ Ye chaal chalo** (coach ki chaal khud chal jaati hai), **🔊 Suno** (voice),
**👁 Board pe dikhao** (arrow), `−/+` se search depth (1–4), ✅/⏸️ se guide on/off.

**Voice**: browser me Web Speech API, APK me native Android TTS (`AndroidTTS` bridge).
Default `en-IN` — Hinglish Roman script me likhi hai isliye Indian English voice saaf bolta hai.

### Coach ke "kyu" me kya-kya aata hai

- 🚀 piece develop hua (ghar se nikla) · 🎯 center control badha
- 🏰 castling · 👑 check · 🍴 fork · 📌 pin · 🚑 piece bacha
- 💰/⚖️/⚠️ capture ka poora exchange hisaab (SEE + recapture me jo piece khoya wo bhi ginta hai)
- 🩹 hanging piece warning · ⚠️ castled king ke saamne ka pawn hil gaya
- 📖 opening book ki standard chaal

## 📚 Content

- **15 lessons** (~3000 shabd) — 5 chapters: Shuruaat, Opening, Middlegame, Endgame, Practice
- **⚡ Crash mode** — sirf 6 zaroori lessons (~15 min)
- **28 interactive diagram boards** + **6 practice widgets** (castling/promotion/mate-in-1 khud chalo)
- **8 mate-in-1 puzzles** + 1 trap puzzle (jahan mate hai hi nahi)
- **18 opening lines** with idea / plan / trap
- **4 bot levels** (🐣 naya → 🔥 club player)

## 🗂 Files

```
chess-sikho/
├── index.html        # shell + script order
├── styles.css        # theme (board, coach panel, lessons, responsive)
├── storage.js        # AppStorage: native SharedPreferences → localStorage → memory
├── engine.js         # rules: castling, en passant, promotion, draws, SAN, FEN
├── ai.js             # alpha-beta + PST bot; rankMoves()/bestMove() coach ke liye
├── openings.js       # opening book (18 lines) + first-move guide
├── analyzer.js       # ChessCoach: best move + WHY + replies/probability + threats + SEE
├── board.js          # click/drag board, arrows, highlights, promotion picker
├── voice.js          # TTS abstraction (native bridge + Web Speech API)
├── coach.js          # coach sidebar UI
├── lessons.js        # saara lesson + puzzle content — yahi edit karo
├── app.js            # views (home/learn/play/puzzles), progress, practice widgets
├── serve.py          # zero-dependency static server
├── android/          # Gradle project (WebView + TTS/Storage/App bridges)
│   ├── app/src/main/java/com/chesssikho/app/MainActivity.java
│   └── tools/make_icons.py    # launcher icon generator (Pillow)
└── test/
    ├── perft.cjs     # engine correctness (standard perft positions)
    ├── dom.cjs       # jsdom UI smoke test (lessons, practice, play, puzzles)
    └── coach.cjs     # coach output test (best move, replies, probabilities)
```

## ✅ Tests

```bash
node chess-sikho/test/perft.cjs
node chess-sikho/test/coach.cjs
# UI test (jsdom ek baar install karo):
npm i jsdom && JSDOM_PATH=$(node -p "require.resolve('jsdom')") node chess-sikho/test/dom.cjs
```

Perft standard positions se match karta hai (startpos d4 = 197281, Kiwipete d3 = 97862).

## Content edit karna

`lessons.js` me `window.LESSONS` / `window.PUZZLES`. Block types:

- `{ h }`, `{ p }` (**bold** + `code` support), `{ list[] }`, `{ steps[] }`
- `{ tip }`, `{ warn }`, `{ note }` — callouts
- `{ table: { head, rows } }`
- `{ diagram: { fen, arrows, highlights, caption } }`
- `{ practice: { fen, goal, title, hint, solution? } }` — goals: `mate1`, `mateOrPromote`,
  `promote`, `castle`, `reach` (+`target`), `free`, `nomate`

`openings.js` me `{ moves[], name, for, priority, idea, plan[], trap }` — `priority`
se decide hota hai ki ek hi prefix pe kaun si line suggest ho.

---
Ye app `Erza-Scarlet-Music` repo ke andar ek standalone folder hai — music bot ka code touch nahi hota.
