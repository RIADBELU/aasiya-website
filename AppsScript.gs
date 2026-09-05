/**
 * Aasiya Musalla — Sheet writer (v2)
 * Lets admin.html edit the "Iqamah" schedule and the "Announcements" tab.
 *
 * Install: Extensions → Apps Script → replace everything with this file → Save
 *          → Deploy → Manage deployments → ✎ → Version: New version → Deploy.
 * The /exec URL never changes between versions.
 */
const SECRET   = "aasiya-2026";        // must match WRITE_SECRET in admin.html
const TAB_ANN  = "Announcements";      // message | startDate | endDate
const TAB_IQ   = "Iqamah";             // date | fajr | dhuhr | asr | maghrib | isha

function doPost(e) {
  let body = {};
  try { body = JSON.parse(e.postData.contents || "{}"); } catch (err) {}
  if (body.secret !== SECRET) return out({ ok: false, error: "Unauthorised" });

  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (err) { return out({ ok: false, error: "Sheet is busy — try again" }); }
  try {
    switch (body.action) {
      case "ping":        return out({ ok: true, service: "Aasiya sheet writer", version: 2, time: new Date().toISOString() });
      /* announcements */
      case "add":         return annAdd(body);
      case "update":      return annUpdate(body);
      case "delete":      return annDelete(body);
      /* iqamah */
      case "iqamah_set":  return iqamahSet(body);
      case "iqamah_add":  return iqamahAdd(body);
      case "iqamah_del":  return iqamahDelete(body);
      default:            return out({ ok: false, error: "Unknown action" });
    }
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err) });
  } finally { lock.releaseLock(); }
}

function doGet() { return out({ ok: true, service: "Aasiya sheet writer", version: 2 }); }

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
