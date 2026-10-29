// storage.js — ek hi jagah se save/load.
// APK me native SharedPreferences bridge (AndroidStore), browser me localStorage,
// aur dono fail ho to memory. Isse progress kabhi lost nahi hota.
(function (root) {
  'use strict';

  const memory = {};

  function bridge() {
    return root.AndroidStore && typeof root.AndroidStore.get === 'function' ? root.AndroidStore : null;
  }

  function get(key) {
    const b = bridge();
    if (b) {
      try {
        const v = b.get(key);
        return v === null || v === undefined || v === '' ? null : String(v);
      } catch (e) { /* fall through */ }
    }
    try {
      return root.localStorage.getItem(key);
    } catch (e) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    }
  }

  function set(key, value) {
    const str = String(value);
    const b = bridge();
    if (b) {
      try { b.set(key, str); return true; } catch (e) { /* fall through */ }
    }
    try {
      root.localStorage.setItem(key, str);
      return true;
    } catch (e) {
      memory[key] = str;
      return false;
    }
  }

  function remove(key) {
    const b = bridge();
    if (b) { try { b.remove(key); } catch (e) { /* ignore */ } }
    try { root.localStorage.removeItem(key); } catch (e) { delete memory[key]; }
  }

  function getJSON(key, fallback) {
    const raw = get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
  }

  function setJSON(key, value) {
    try { return set(key, JSON.stringify(value)); } catch (e) { return false; }
  }

  root.AppStorage = { get, set, remove, getJSON, setJSON, native: !!bridge() };
})(typeof globalThis !== 'undefined' ? globalThis : this);
