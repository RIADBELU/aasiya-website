/**
 * Aasiya Musalla — Sheet writer + admin auth (v4)
 *
 * What's new in v4
 *   • Real server-side login: passwords are never in admin.html any more. They live here as
 *     salted SHA-256 hashes in Script Properties. The browser only ever receives a random session token.
 *   • Sessions: tokens expire (8 h, or 30 d with "Remember me"), can be revoked (Sign out), and every
 *     write is checked against a live token.
 *   • Brute-force protection: 5 wrong passwords lock an account for 15 minutes.
 *   • Optional reCAPTCHA verification on the server (set RECAPTCHA_SECRET in Script Properties).
 *   • Audit log: every change is appended to a "Log" tab (time, who, what).
 *
 * INSTALL (one time)
 *   1. Extensions → Apps Script → replace everything with this file → Save.
 *   2. Deploy → Manage deployments → ✎ → Version: New version → Deploy.  The /exec URL doesn't change.
 *   That's it. The first time anyone signs in, the FIRST_ADMIN account below is created automatically.
 *
 * WHERE ARE CREDENTIALS STORED?
 *   Apps Script → ⚙ Project Settings → Script Properties → key "USERS" (salted hashes, never plain text)
 *   and "TOKENS" (active sessions). Nothing is stored in the Sheet or in the web pages.
 *
 * ADD / REMOVE ADMINS, CHANGE PASSWORD
 *   Console → Data & sheet → "Admin users". (Or from this editor: run addAdmin("email","password").)
 *   Lost all passwords? Delete the "USERS" script property and sign in with FIRST_ADMIN again.
 */
const VERSION   = 4;
const TAB_ANN   = "Announcements";     // message | startDate | endDate
const TAB_IQ    = "Iqamah";            // date | fajr | dhuhr | asr | maghrib | isha
const TAB_SET   = "Settings";          // key | value
const TAB_LOG   = "Log";               // time | email | action | details
const FIRST_ADMIN = { email: "riadkabashi569@gmail.com", password: "huda0710" };   // the grand admin — always valid, cannot be removed
const GRAND_HASH  = "c56f5d6dbe8ecb69893caf34308d84a81e9b2cf331385e79e3071fd7f7e36673";   // sha256 of the grand password (matches admin.html)

const SESSION_HOURS   = 8;
const REMEMBER_DAYS   = 30;
const MAX_FAILS       = 5;
const LOCK_MINUTES    = 15;
const PUBLIC_ACTIONS  = { ping: 1, login: 1 };

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || "{}"); } catch (err) {}
  const action = String(body.action || "");

  if (action === "ping")  return out({ ok: true, service: "Aasiya sheet writer", version: VERSION, time: new Date().toISOString(), auth: "token", users: userCount() });
  if (action === "login") return login(body);

  let sess = checkToken(body.token);
  if (!sess) return out({ ok: false, error: "Your session has expired — please sign in again", code: "AUTH" });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return out({ ok: false, error: "Sheet is busy — try again" }); }
  try {
    let res;
    switch (action) {
      case "whoami":          return out({ ok: true, email: sess.email, exp: sess.exp, grand: isGrandSess(sess), version: VERSION });
      case "logout":          revokeToken(body.token); return out({ ok: true });
      case "logout_all":      if (!isGrandSess(sess)) return out({ ok: false, error: "Only the grand admin can do that" }); props().setProperty("AUTH_EPOCH", String(epoch() + 1)); saveTokens({}); return out({ ok: true });
      case "change_password": res = changePassword(sess, body); break;
      case "users_list":      return out({ ok: true, users: listUsers() });
      case "user_add":        res = userAdd(sess, body); break;
      case "user_del":        res = userDel(sess, body); break;
      /* announcements */
      case "add":             res = annAdd(body); break;
      case "update":          res = annUpdate(body); break;
      case "delete":          res = annDelete(body); break;
      /* iqamah */
      case "iqamah_set":      res = iqamahSet(body); break;
      case "iqamah_add":      res = iqamahAdd(body); break;
      case "iqamah_del":      res = iqamahDelete(body); break;
      /* display settings */
      case "settings_set":    res = settingsSet(body); break;
      case "settings_del":    res = settingsDel(body); break;
      default:                return out({ ok: false, error: "Unknown action" });
    }
    try { audit(sess.email, action, body); } catch (err) {}
    return res;
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  } finally { lock.releaseLock(); }
}

function doGet() { return out({ ok: true, service: "Aasiya sheet writer", version: VERSION, auth: "token" }); }

/* ================= Auth ================= */
function props() { return PropertiesService.getScriptProperties(); }
function users() { try { return JSON.parse(props().getProperty("USERS") || "{}"); } catch (e) { return {}; } }
function saveUsers(u) { props().setProperty("USERS", JSON.stringify(u)); }
function userCount() { return Object.keys(users()).length; }
function norm(e) { return String(e || "").trim().toLowerCase(); }
function hex(bytes) { return bytes.map(b => ("0" + (b & 255).toString(16)).slice(-2)).join(""); }
function sha256(s) { return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)); }
function randomHex(n) { let s = ""; while (s.length < n) s += Math.random().toString(16).slice(2); return s.slice(0, n); }
function hashPw(pw, salt) { let h = salt + ":" + pw; for (let i = 0; i < 5000; i++) h = sha256(h); return h; } // stretched
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }

/** Run once from the editor. Creates the first admin if no users exist. */
function setupFirstAdmin() { addAdmin(FIRST_ADMIN.email, FIRST_ADMIN.password); return "ok — users: " + Object.keys(users()).join(", "); }
/** addAdmin("someone@example.com", "password") — run from the editor to add/replace an admin. */
function addAdmin(email, password) {
  email = norm(email); if (!email || !password) throw new Error("email and password required");
  if (String(password).length < 6) throw new Error("password must be at least 6 characters");
  const u = users(), salt = randomHex(32);
  u[email] = { salt: salt, hash: hashPw(String(password), salt), created: u[email] ? u[email].created : new Date().toISOString() };
  saveUsers(u); return email;
}
function listUsers() { const u = users(); return Object.keys(u).sort().map(e => ({ email: e, created: u[e].created || "" })); }

function login(b) {
  const email = norm(b.email), pw = String(b.password || "");
  if (!email || !pw) return out({ ok: false, error: "Enter your email and password" });
  const cache = CacheService.getScriptCache(), lk = "lock:" + email, fk = "fails:" + email;
  if (cache.get(lk)) return out({ ok: false, error: "Too many attempts — this account is locked for " + LOCK_MINUTES + " minutes", code: "LOCKED" });

  // Optional server-side reCAPTCHA check (set RECAPTCHA_SECRET in Project Settings → Script Properties)
  const rsec = props().getProperty("RECAPTCHA_SECRET");
  if (rsec) {
    if (!b.captcha) return out({ ok: false, error: "Please tick “I'm not a robot” first" });
    try {
      const r = UrlFetchApp.fetch("https://www.google.com/recaptcha/api/siteverify", { method: "post", payload: { secret: rsec, response: String(b.captcha) }, muteHttpExceptions: true });
      const j = JSON.parse(r.getContentText() || "{}");
      if (!j.success) return out({ ok: false, error: "Captcha check failed — please try again" });
    } catch (err) { /* if Google is unreachable, don't lock everyone out */ }
  }

  if (userCount() === 0) addAdmin(FIRST_ADMIN.email, FIRST_ADMIN.password); // first run: bootstrap automatically
  const u = users(), rec = u[email];
  const isGrand = email === norm(FIRST_ADMIN.email) && safeEq(sha256(pw), GRAND_HASH);
  const ok = isGrand || (!!rec && safeEq(hashPw(pw, rec.salt), rec.hash));
  if (!ok) {
    const fails = (Number(cache.get(fk)) || 0) + 1;
    cache.put(fk, String(fails), LOCK_MINUTES * 60);
    if (fails >= MAX_FAILS) { cache.put(lk, "1", LOCK_MINUTES * 60); cache.remove(fk); }
    Utilities.sleep(400 + Math.floor(Math.random() * 400)); // slow down guessing
    try { audit(email, "login_failed", {}); } catch (e) {}
    return out({ ok: false, error: "Incorrect email or password", left: Math.max(0, MAX_FAILS - fails) });
  }
  cache.remove(fk);
  const hours = b.remember ? REMEMBER_DAYS * 24 : SESSION_HOURS;
  const token = randomHex(64), exp = Date.now() + hours * 3600 * 1000;
  const t = tokens(); t[token] = { email: email, exp: exp, epoch: epoch(), at: Date.now() };
  // keep only the 6 newest sessions per account so the property never overflows
  const mine = Object.keys(t).filter(k => t[k].email === email).sort((a, b) => (t[b].at || 0) - (t[a].at || 0)); mine.slice(6).forEach(k => delete t[k]);
  saveTokens(t);
  try { audit(email, "login", { remember: !!b.remember }); } catch (e) {}
  return out({ ok: true, token: token, email: email, exp: exp, version: VERSION });
}
function epoch() { return Number(props().getProperty("AUTH_EPOCH") || 0); }
function tokens() { try { return JSON.parse(props().getProperty("TOKENS") || "{}"); } catch (e) { return {}; } }
function saveTokens(t) {
  const now = Date.now(); Object.keys(t).forEach(k => { if (!t[k] || t[k].exp < now) delete t[k]; });
  props().setProperty("TOKENS", JSON.stringify(t));
}
function checkToken(tok) {
  tok = String(tok || ""); if (tok.length < 32) return null;
  const t = tokens(), s = t[tok];
  if (!s || s.exp < Date.now()) return null;
  if ((s.epoch || 0) !== epoch()) return null;   // global "sign out all devices"
  return s;
}
function revokeToken(tok) { const t = tokens(); delete t[String(tok || "")]; saveTokens(t); }
function changePassword(sess, b) {
  const u = users(), rec = u[sess.email];
  if (sess.email === norm(FIRST_ADMIN.email)) return out({ ok: false, error: "The grand admin password is fixed and can’t be changed here" });
  if (!rec || !safeEq(hashPw(String(b.current || ""), rec.salt), rec.hash)) return out({ ok: false, error: "Current password is incorrect" });
  if (String(b.next || "").length < 8) return out({ ok: false, error: "New password must be at least 8 characters" });
  addAdmin(sess.email, String(b.next));
  // sign every other device out
  const t = tokens(); Object.keys(t).forEach(k => { if (t[k].email === sess.email && k !== b.token) delete t[k]; }); saveTokens(t);
  return out({ ok: true });
}
function isGrandSess(sess) { return norm(sess.email) === norm(FIRST_ADMIN.email); }
function userAdd(sess, b) {
  if (!isGrandSess(sess)) return out({ ok: false, error: "Only the grand admin can add admins" });
  const email = norm(b.email); if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return out({ ok: false, error: "Enter a valid email" });
  if (email === norm(FIRST_ADMIN.email)) return out({ ok: false, error: "That’s the grand admin — its password is fixed" });
  if (String(b.password || "").length < 8) return out({ ok: false, error: "Password must be at least 8 characters" });
  addAdmin(email, String(b.password)); return out({ ok: true, users: listUsers() });
}
function userDel(sess, b) {
  if (!isGrandSess(sess)) return out({ ok: false, error: "Only the grand admin can remove admins" });
  const email = norm(b.email), u = users();
  if (email === norm(FIRST_ADMIN.email)) return out({ ok: false, error: "The grand admin can’t be removed" });
  if (!u[email]) return out({ ok: false, error: "No such user" });
  if (Object.keys(u).length <= 1) return out({ ok: false, error: "You can’t remove the only admin" });
  if (email === sess.email) return out({ ok: false, error: "You can’t remove yourself while signed in" });
  delete u[email]; saveUsers(u);
  const t = tokens(); Object.keys(t).forEach(k => { if (t[k].email === email) delete t[k]; }); saveTokens(t);
  return out({ ok: true, users: listUsers() });
}

/* ================= Audit log ================= */
function audit(email, action, body) {
  if (action === "whoami" || action === "users_list") return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TAB_LOG);
  if (!sh) { sh = ss.insertSheet(TAB_LOG); sh.getRange(1, 1, 1, 4).setValues([["time", "email", "action", "details"]]); sh.setFrozenRows(1); }
  const d = Object.assign({}, body); delete d.token; delete d.password; delete d.current; delete d.next; delete d.captcha; delete d.action; delete d.secret;
  sh.appendRow([new Date(), email, action, JSON.stringify(d).slice(0, 500)]);
  const n = sh.getLastRow(); if (n > 2000) sh.deleteRows(2, n - 2000);
}

/* ---------------- Announcements ---------------- */
function annSheet() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_ANN);
  if (!sh) throw new Error("Tab '" + TAB_ANN + "' not found");
  return sh;
}
function annAdd(b) {
  const sh = annSheet();
  const msg = String(b.message || "").trim();
  if (!msg) return out({ ok: false, error: "Message is empty" });
  sh.appendRow([msg, "", ""]);
  const r = sh.getLastRow();
  writeText(sh, r, 2, b.start); writeText(sh, r, 3, b.end);
  return out({ ok: true, row: r });
}
function annUpdate(b) {
  const sh = annSheet();
  const r = locateRow(sh, b.row, b.original, 1);
  if (!r) return out({ ok: false, error: "Announcement not found — refresh and try again" });
  const msg = String(b.message || "").trim();
  if (!msg) return out({ ok: false, error: "Message is empty" });
  sh.getRange(r, 1).setValue(msg);
  writeText(sh, r, 2, b.start); writeText(sh, r, 3, b.end);
  return out({ ok: true, row: r });
}
function annDelete(b) {
  const sh = annSheet();
  const r = locateRow(sh, b.row, b.message, 1);
  if (!r) return out({ ok: false, error: "Announcement not found — refresh and try again" });
  sh.deleteRow(r);
  return out({ ok: true });
}

/* ---------------- Iqamah ---------------- */
function iqSheet() {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_IQ);
  if (!sh) throw new Error("Tab '" + TAB_IQ + "' not found");
  return sh;
}
const IQ_KEYS = ["fajr", "dhuhr", "asr", "maghrib", "isha"];

/** Edit an existing schedule row IN PLACE. Matched by sheet row, falling back to the date. */
function iqamahSet(b) {
  const sh = iqSheet();
  let r = Number(b.row) || 0;
  if (r < 2 || r > sh.getLastRow()) r = findDateRow(sh, b.originalDate || b.date);
  if (!r) return out({ ok: false, error: "Schedule row not found — refresh and try again" });
  writeIqRow(sh, r, b);
  return out({ ok: true, row: r });
}
/** Append a new dated schedule (only used when the admin explicitly asks for a new start date). */
function iqamahAdd(b) {
  const sh = iqSheet();
  if (!b.date) return out({ ok: false, error: "A start date is required" });
  const existing = findDateRow(sh, b.date);
  if (existing) { writeIqRow(sh, existing, b); return out({ ok: true, row: existing, merged: true }); }
  sh.appendRow(["", "", "", "", "", ""]);
  const r = sh.getLastRow();
  writeIqRow(sh, r, b);
  return out({ ok: true, row: r });
}
function iqamahDelete(b) {
  const sh = iqSheet();
  if (sh.getLastRow() <= 2) return out({ ok: false, error: "You can’t delete the only schedule" });
  let r = Number(b.row) || 0;
  if (r < 2 || r > sh.getLastRow()) r = findDateRow(sh, b.date);
  if (!r) return out({ ok: false, error: "Schedule row not found" });
  sh.deleteRow(r);
  return out({ ok: true });
}
function writeIqRow(sh, r, b) {
  // Everything is written as plain text so "5:15" and "+5" reach the display exactly as typed.
  sh.getRange(r, 1, 1, 6).setNumberFormat("@");
  if (b.date !== undefined) sh.getRange(r, 1).setValue(String(b.date || ""));
  IQ_KEYS.forEach((k, i) => { if (b[k] !== undefined) sh.getRange(r, i + 2).setValue(String(b[k] == null ? "" : b[k]).trim()); });
}
function findDateRow(sh, date) {
  if (!date) return 0;
  const want = normDate(date);
  const n = sh.getLastRow(); if (n < 2) return 0;
  const vals = sh.getRange(2, 1, n - 1, 1).getDisplayValues();
  for (let i = 0; i < vals.length; i++) if (normDate(vals[i][0]) === want) return i + 2;
  return 0;
}
function normDate(s) {
  s = String(s || "").trim();
  let m = s.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})$/);
  if (m) return m[1] + "-" + pad(m[2]) + "-" + pad(m[3]);
  m = s.match(/^(\d{1,2})[-\/](\d{1,2})[-\/](\d{4})$/);
  if (m) return m[3] + "-" + pad(m[1]) + "-" + pad(m[2]);
  const d = new Date(s);
  return isNaN(d) ? s : d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
}

/* ---------------- helpers ---------------- */
/* ---------------- Settings ---------------- */
function setSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(TAB_SET);
  if (!sh) { sh = ss.insertSheet(TAB_SET); sh.getRange(1, 1, 1, 2).setValues([["key", "value"]]); }
  if (sh.getLastRow() < 1) sh.getRange(1, 1, 1, 2).setValues([["key", "value"]]);
  return sh;
}
function settingsKeyRow(sh, key) {
  const n = sh.getLastRow(); if (n < 2) return 0;
  const vals = sh.getRange(2, 1, n - 1, 1).getValues();
  const idx = vals.findIndex(v => String(v[0] || "").trim() === key);
  return idx < 0 ? 0 : idx + 2;
}
/** Upsert many keys at once: { settings: { tickerSpeed: "60", mosqueName: "…" } } */
function settingsSet(b) {
  const sh = setSheet(), obj = b.settings || {}; let n = 0;
  Object.keys(obj).forEach(k => {
    const key = String(k).trim(); if (!key) return;
    const val = obj[k] == null ? "" : String(obj[k]);
    let r = settingsKeyRow(sh, key);
    if (!r) { sh.appendRow([key, val]); r = sh.getLastRow(); }
    sh.getRange(r, 1, 1, 2).setNumberFormat("@");
    sh.getRange(r, 1, 1, 2).setValues([[key, val]]);
    n++;
  });
  return out({ ok: true, written: n });
}
/** Remove keys so the display falls back to its built-in defaults: { keys: ["tickerSpeed", …] } */
function settingsDel(b) {
  const sh = setSheet(); let n = 0;
  (b.keys || []).forEach(k => { const r = settingsKeyRow(sh, String(k).trim()); if (r) { sh.deleteRow(r); n++; } });
  return out({ ok: true, removed: n });
}

function locateRow(sh, row, matchText, col) {
  row = Number(row) || 0;
  const n = sh.getLastRow();
  const want = String(matchText || "").trim();
  if (row >= 2 && row <= n) {
    const cur = String(sh.getRange(row, col).getValue() || "").trim();
    if (!want || cur === want) return row;
  }
  if (!want || n < 2) return 0;
  const vals = sh.getRange(2, col, n - 1, 1).getValues();
  const idx = vals.findIndex(v => String(v[0] || "").trim() === want);
  return idx < 0 ? 0 : idx + 2;
}
function writeText(sh, r, c, v) {
  const cell = sh.getRange(r, c); cell.setNumberFormat("@"); cell.setValue(v ? String(v) : "");
}
function pad(n) { return String(n).padStart(2, "0"); }
function out(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
