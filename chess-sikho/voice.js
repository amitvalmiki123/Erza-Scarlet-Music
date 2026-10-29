// voice.js — Hinglish guide ko bolne ke liye.
// APK me native Android TTS bridge (window.AndroidTTS), browser me Web Speech API.
(function (root) {
  'use strict';

  const PREFS = {
    on: false,
    rate: 1.0,
    lang: 'en-IN',
    voiceName: '',
  };
  const Store = (typeof globalThis !== 'undefined' ? globalThis : window).AppStorage || {
    getJSON: (k, f) => { try { return JSON.parse(localStorage.getItem(k) || 'null') || f; } catch (e) { return f; } },
    setJSON: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } },
  };
  Object.assign(PREFS, Store.getJSON('chessSikho.voice', {}));

  function save() { Store.setJSON('chessSikho.voice', PREFS); }

  // Kuch WebView/browsers me speechSynthesis hota hai par Utterance nahi —
  // dono milenge tabhi Web Speech use karo, warna native bridge / chup.
  let hasUtterance = false;
  try {
    hasUtterance = typeof root.SpeechSynthesisUtterance === 'function'
      && !!new root.SpeechSynthesisUtterance('');
  } catch (e) { hasUtterance = false; }
  const synth = (root.speechSynthesis && hasUtterance) ? root.speechSynthesis : null;
  let voices = [];
  let chosen = null;

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices() || [];
    if (!voices.length) return;
    chosen = null;
    if (PREFS.voiceName) chosen = voices.find((v) => v.name === PREFS.voiceName) || null;
    if (!chosen) chosen = voices.find((v) => v.lang === PREFS.lang) || null;
    if (!chosen) chosen = voices.find((v) => /^hi/i.test(v.lang)) || null;
    if (!chosen) chosen = voices.find((v) => /^en-IN/i.test(v.lang)) || null;
    if (!chosen) chosen = voices.find((v) => /^en/i.test(v.lang)) || null;
    if (!chosen) chosen = voices[0];
  }

  if (synth) {
    loadVoices();
    if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', loadVoices);
    else synth.onvoiceschanged = loadVoices;
  }

  function nativeBridge() {
    return root.AndroidTTS && typeof root.AndroidTTS.speak === 'function' ? root.AndroidTTS : null;
  }

  // APK me native TTS ko language + rate batao.
  function syncNative() {
    const b = nativeBridge();
    if (!b) return;
    try { if (typeof b.setLang === 'function') b.setLang(PREFS.lang); } catch (e) { /* ignore */ }
    try { if (typeof b.setRate === 'function') b.setRate(PREFS.rate); } catch (e) { /* ignore */ }
  }
  syncNative();

  function supported() {
    return !!nativeBridge() || !!synth;
  }

  // TTS ke liye text ko saaf karo (markdown/emoji hatao)
  function clean(text) {
    return String(text || '')
      .replace(/\*\*/g, '')
      .replace(/`/g, '')
      .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  let speaking = false;

  function speak(text, opts) {
    const t = clean(text);
    if (!t) return false;
    stop();
    const bridge = nativeBridge();
    if (bridge) {
      try {
        syncNative();
        speaking = true;
        if (opts && opts.queue && typeof bridge.speakQueue === 'function') bridge.speakQueue(t);
        else bridge.speak(t);
        return true;
      } catch (e) { speaking = false; /* fall through to web speech */ }
    }
    if (!synth || typeof root.SpeechSynthesisUtterance !== 'function') return false;
    try {
      const u = new root.SpeechSynthesisUtterance(t);
      if (chosen) u.voice = chosen;
      u.lang = (chosen && chosen.lang) || PREFS.lang;
      u.rate = (opts && opts.rate) || PREFS.rate;
      u.pitch = 1;
      u.onend = () => { speaking = false; };
      u.onerror = () => { speaking = false; };
      speaking = true;
      synth.speak(u);
      return true;
    } catch (e) {
      speaking = false;
      return false;
    }
  }

  function stop() {
    speaking = false;
    try {
      const bridge = nativeBridge();
      if (bridge && typeof bridge.stop === 'function') bridge.stop();
    } catch (e) { /* ignore */ }
    try { if (synth) synth.cancel(); } catch (e) { /* ignore */ }
  }

  // Lambi text ko tukdo me bolo (kuch engines ~200 char pe kaat dete hain)
  function speakLong(text, opts) {
    const t = clean(text);
    if (!t) return false;
    if (nativeBridge()) return speak(t, opts);
    if (t.length <= 220) return speak(t, opts);
    const parts = t.match(/[^.!?]+[.!?]?/g) || [t];
    const chunks = [];
    let cur = '';
    for (const p of parts) {
      if ((cur + p).length > 200) { chunks.push(cur.trim()); cur = p; }
      else cur += p;
    }
    if (cur.trim()) chunks.push(cur.trim());
    let i = 0;
    if (typeof root.SpeechSynthesisUtterance !== 'function') return false;
    const next = () => {
      if (i >= chunks.length || !speaking && i > 0) return;
      const u = new root.SpeechSynthesisUtterance(chunks[i++]);
      if (chosen) u.voice = chosen;
      u.lang = (chosen && chosen.lang) || PREFS.lang;
      u.rate = (opts && opts.rate) || PREFS.rate;
      u.onend = () => { if (i < chunks.length) next(); else speaking = false; };
      u.onerror = () => { speaking = false; };
      synth.speak(u);
    };
    stop();
    speaking = true;
    next();
    return true;
  }

  root.Voice = {
    get on() { return PREFS.on; },
    set on(v) { PREFS.on = !!v; save(); if (!PREFS.on) stop(); },
    get rate() { return PREFS.rate; },
    set rate(v) { PREFS.rate = v; save(); syncNative(); },
    get lang() { return PREFS.lang; },
    set lang(v) { PREFS.lang = v; save(); loadVoices(); syncNative(); },
    get isNative() { return !!nativeBridge(); },
    get voiceName() { return chosen ? chosen.name : ''; },
    listVoices() { return voices.map((v) => ({ name: v.name, lang: v.lang })); },
    supported,
    speak,
    speakLong,
    stop,
    get speaking() { return speaking; },
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
