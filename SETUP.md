# Aasiya Musalla — Prayer Times Display

A single-file masjid display.

* **Iqamah times** are imported from **your Google Sheet** — you control them.
* **Begin (adhan) times, sunrise/sunset and the Hijri date** come from the published
  **AlAdhan** timetable for Regina (ISNA method, the same one the local masjids use),
  with an offline astronomical fallback. They are never typed in and never go stale.

Nothing on the board needs a page reload: the date rolls over, sunset shifts, and the
Maghrib iqamah follows it — all while the screen keeps running.

Files:

| File | What it is |
|---|---|
| `prayerdisplay.html` | The whole TV display. This is the only file the TV needs. |
| `index.html` + `site.css` + `site.js` | The public website (prayer times, announcements, visit info). Keep the three files together. |
| `admin.html` | Password-protected page for managing announcements. |
| `AppsScript.gs` | Small script you paste into the Google Sheet so the Admin page can save (Part 5). |
| `Iqamah.csv` | Template for the **Iqamah** tab |
| `Announcements.csv` | Template for the **Announcements** tab |
| `Settings.csv` | Template for the **Settings** tab |

---

## Part 1 — Build the Google Sheet (10 minutes)

1. Go to <https://sheets.google.com> and create a blank spreadsheet.
   Name it e.g. `Aasiya Musalla Prayer Times`.
2. Create **three tabs**, named exactly (capitals matter):
   `Iqamah`, `Announcements`, `Settings`
3. For each tab: **File → Import → Upload**, pick the matching CSV from this folder,
   and choose **Replace current sheet**. That gives you the right headers and example rows.

### The `Iqamah` tab

| Date | Fajr | Dhuhr | Asr | Maghrib | Isha |
|---|---|---|---|---|---|
| 2026-05-01 | 4:30 | 1:30 | 6:30 | +5 | 10:45 |
| 2026-05-25 | 4:15 | 1:45 | 6:45 | +7 | 11:00 |

**You do not need a row for every day.** A row stays in effect until the next dated row.
Twelve rows (one per month) is enough for a whole year. The display picks the most
recent row whose date is on or before today.

What you can type in a time cell:

| You type | Meaning |
|---|---|
| `1:30 PM` or `13:30` | A fixed clock time |
| `1:30` | Fixed time; assumed PM for daytime prayers |
| `+5` | 5 minutes after that prayer's begin time (great for Maghrib) |
| `+10^5` | 10 minutes after begin, then rounded up to the next 5 minutes |
| *(blank)* | Defaults to `+10` — except **Maghrib**, which defaults to **sunset + 5** |

> **Maghrib:** leave the cell blank (or use `+5`) and it tracks the real sunset every single
> day, forever, with no reload and nothing to maintain. Only type a fixed time there if your
> committee wants to override the sunset rule.

> **Tip:** format the Date column as *plain text* (Format → Number → Plain text), or just
> type dates as `2026-05-01`. `5/1/2026` also works.

### The `Announcements` tab

| Message | StartDate | EndDate |
|---|---|---|
| Halaqah every Saturday after Maghrib. | | |
| Ramadan dinner this Friday. | 2027-02-01 | 2027-03-20 |

Leave both dates blank to show a message permanently. Messages outside their date window
are skipped automatically, so you can queue things up in advance and forget about them.

### The `Settings` tab

`Key` / `Value` pairs. Only include the ones you want to change — anything missing uses the
built-in default. The useful ones:

| Key | Default | Notes |
|---|---|---|
| `mosqueName` | Aasiya Musalla | Shown top-left |
| `location` | Regina, Saskatchewan | Subtitle |
| `latitude` / `longitude` | 50.4452 / -104.6189 | Your exact building |
| `method` | ISNA | `MWL`, `ISNA`, `Egypt`, `Karachi`, `Makkah`, `Tehran`, `Custom` |
| `asrMethod` | Standard | `Standard` or `Hanafi` |
| `highLatRule` | AngleBased | Keep this — see the Regina note below |
| `offsetFajr` … `offsetIsha` | 0 | Minute nudges to match your printed timetable |
| `hijriOffset` | 0 | `-1` or `+1` to align the Hijri date with local moon sighting |
| `timesSource` | aladhan | `aladhan` (published times) or `calculated` (offline maths only) |
| `maghribIqamahMinutes` | 5 | Minutes after sunset for Maghrib iqamah, when the Sheet cell is blank |
| `highlightHoldMinutes` | 10 | How long a prayer stays highlighted after its iqamah |
| `iqamahAlertMinutes` | 3 | Full-screen countdown before each iqamah |
| `prayerDurationMinutes` | 8 | Length of the "silence your phone" screen |
| `fajrDurationMinutes` | 12 | Same, for Fajr |
| `iqamahBoxSeconds` | 60 | How long the "Adhan Time" / "Iqamah Time" box stays up |
| `refreshMinutes` | 5 | How often the whole page re-syncs itself (minimum 1) |
| `nameSwapSeconds` | 10 | Prayer names alternate: this many seconds in English, then the same in Arabic. `0` = English only |
| `tickerSeconds` | 12 | Seconds per announcement |
| `tickerSpeed` | 60 | Scroll speed in pixels/second for long announcements (minimum 20) |
| `tickerScale` | 1 | Announcement text size — `1.2` = 20% bigger |
| `footerScale` | 1 | Height of the whole footer bar — `1.3` = 30% taller |
| `showSeconds` | TRUE | Seconds badge in the clock's top-right corner |
| `burnInProtection` | TRUE | Slowly drifts the layout to protect the panel |

---

### What your finished sheet should look like

Three tabs along the bottom, spelled exactly like this:

```
  ┌──────────┬────────────────┬──────────┐
  │  Iqamah  │ Announcements  │ Settings │      <- tab names, capitals matter
  └──────────┴────────────────┴──────────┘
```

**Tab 1 — `Iqamah`** (row 1 is the header; put it in cells A1:F1)

```
     A            B         C         D         E         F
1    Date         Fajr      Dhuhr     Asr       Maghrib   Isha
2    2026-01-01   6:30      1:15      3:45                7:15
3    2026-02-01   6:15      1:15      4:30                7:45
4    2026-03-01   5:45      1:30      5:15                8:30
5    2026-04-01   5:00      1:30      6:00                9:30
6    2026-05-01   4:30      1:30      6:30                10:45
7    2026-06-01   4:15      1:30      6:45                11:00
```

That is a complete year's worth of work: **one row per month, six columns, and you are
done.** Column E (Maghrib) is deliberately left empty so it follows the real sunset every
day. Add a new dated row any time the committee changes a time — the old rows can stay.

**Tab 2 — `Announcements`** (header in A1:C1)

```
     A                                            B            C
1    Message                                      StartDate    EndDate
2    Jumu'ah donations go to the building fund.
3    Sisters' halaqah every Saturday after Asr.
4    Eid prayer 8:00 AM at the community hall.    2026-03-15   2026-03-21
```

Row 2 and 3 show forever. Row 4 only appears during that week, then disappears on its own.

**Tab 3 — `Settings`** (header in A1:B1)

```
     A                    B
1    Key                  Value
2    mosqueName           Aasiya Musalla
3    location             Regina, Saskatchewan
4    refreshMinutes       5
5    tickerSpeed          60
6    footerScale          1
```

Only list the settings you actually want to change. Everything you leave out keeps its
default from the table above. A blank `Settings` tab is perfectly fine.

> **The one rule:** don't rename the tabs or move the header row. Everything else — colours,
> fonts, extra notes in column H, frozen rows — is yours to play with; the display only reads
> the columns shown above.

---

### Adjusting the announcement bar

Everything about the footer is controlled from the `Settings` tab, so you never have to open
the code:

| Want to… | Add this setting | Try |
|---|---|---|
| Make the announcement text bigger | `tickerScale` | `1.25` |
| Make the whole footer bar taller | `footerScale` | `1.3` |
| Slow a long announcement down | `tickerSpeed` | `40` (lower = slower) |
| Speed it up | `tickerSpeed` | `90` |
| Hold each message longer before the next | `tickerSeconds` | `20` |

**Portrait (the usual TV setup) always scrolls**, even a short announcement — the message has
the whole width of the screen to itself there, and the movement is what catches the eye from
across the room. In landscape, where the message shares the bar with the status readout, it
only scrolls when the text is actually too long to fit; short ones sit still.

Either way it is one continuous loop: the text drifts off the left edge and comes back in
from the right, so nothing is ever cut off mid-sentence and you never see the same sentence
twice at once. A long announcement flows straight into its next pass; a short one clears the
bar, pauses a beat, then comes round again.

Change a value, then refresh the page (or press **R**) and the new size applies immediately.
`tickerSpeed` is the one to reach for if the scroll feels too fast or too slow — it is a
constant pixels-per-second, so long and short messages move at the same pace.

---

## The prayer names: English, then Arabic

The name column alternates. Each prayer shows its English name for ten seconds, fades to the
Arabic for ten seconds, and fades back — all five rows flip together, so the column always
reads in one language at a time instead of doubling up side by side.

Change the pace from the `Settings` tab with `nameSwapSeconds`:

| Want to… | Set `nameSwapSeconds` to |
|---|---|
| Leave it as delivered | `10` |
| Give people longer to read each one | `15` |
| Flip faster | `6` |
| Stop the alternating and show English only | `0` |

The two names sit in the same spot and cross-fade, so the times beside them never move.

---

## Part 2 — Get an API key

1. Open <https://console.cloud.google.com/> and create a project (any name).
2. **APIs & Services → Library →** search **Google Sheets API →** *Enable*.
3. **APIs & Services → Credentials → Create credentials → API key.** Copy it.
4. Click **Edit API key** and lock it down:
   - **API restrictions →** *Restrict key* → tick **Google Sheets API** only.
   - **Application restrictions →** *Websites*, and add the address the display is served
     from. (Skip this one if you're opening the file directly from a USB stick.)

## Part 3 — Share the sheet

The API key can only read **public** sheets:

> **Share → General access → Anyone with the link → Viewer**

Nothing sensitive should ever live in this spreadsheet.

## Part 4 — Connect it

Open `prayerdisplay.html` in any text editor (and the same two lines near the top of `site.js`). At the top of the script (around line 360):

```js
const SHEET_ID = "";   // <- paste the ID here
const API_KEY  = "";   // <- paste the key here
```

The **Sheet ID** is the long code in the sheet's own URL:

```
https://docs.google.com/spreadsheets/d/  1AbCdEfGhIjKlMnOpQrStUvWxYz  /edit
                                         └──────── this part ────────┘
```

Save, then open `prayerdisplay.html` in a browser. The dot at the bottom-right should turn
**green** and read *Synced*.

---

## Running it on the TV

### Screen orientation

The display is designed **portrait-first** — mount the TV vertically (rotated 90°)
for the best-looking result. It also detects landscape automatically and switches
to a side-by-side layout, so a normal horizontal TV works with no changes.

To rotate the screen itself on a Linux mini-PC / Raspberry Pi:

```bash
# find your output name with: xrandr --query
xrandr --output HDMI-1 --rotate right     # or 'left', depending on the mount
```

On Windows: **Settings → System → Display → Display orientation → Portrait**.

Nothing in the page needs to change — the layout follows the screen shape.

### Launching

Open the file and press **F** for fullscreen. Keyboard shortcuts:

- **F** — toggle fullscreen
- **R** — force an immediate re-sync with the Sheet

Best results on a cheap mini-PC or Raspberry Pi in kiosk mode:

```bash
chromium-browser --kiosk --incognito --noerrdialogs \
  --disable-session-crashed-bubble --check-for-update-interval=31536000 \
  /path/to/prayerdisplay.html
```

The page reloads itself nightly at 3:05 AM to stay healthy 24/7.

### The status dot (bottom right)

| Colour | Meaning |
|---|---|
| 🟢 Green | Synced with the Sheet just now |
| 🟡 Amber | Can't reach Google — running on the last cached copy |
| 🔴 Red | No Sheet configured yet, showing demo times |

Green means **both** feeds are healthy (your Sheet *and* the AlAdhan timetable). If either
one is unreachable the dot goes amber and the last good copy of both keeps showing.

**Edits appear on the TV within 5 minutes.** No need to touch the TV — change the Sheet
from your phone and walk away.

---

### Refreshing it yourself

The whole page re-syncs on its own **every 5 minutes** — Sheet *and* prayer timetable, with
no page reload and no flicker. It also re-syncs the moment the internet comes back and the
moment the screen is woken up.

If you don't want to wait, **just refresh the page in the browser** — F5, Ctrl+R, the
browser's reload button, or the refresh key on the TV remote. Everything is re-read from
scratch. That is the normal way to force an update.

Two shortcuts also exist if you happen to be standing at the screen, and they avoid the
white flash of a full reload:

| How | Where |
|---|---|
| Click the **"Synced 7:41 PM"** text | Next to the status dot, bottom-right |
| Press **R** | Any keyboard or remote plugged into the TV |

To change the automatic interval, add `refreshMinutes` to the `Settings` tab. `1` is the
minimum (this is a safety floor so a typo can't hammer Google's servers).

**Other keys:** **F** toggles fullscreen.

---

## What the screen does on its own

Three things take over the display automatically. You never press anything.

| When | What appears |
|---|---|
| **At the adhan time** | **An "Adhan Time" box, with the prayer times blurred behind it. It clears itself after 1 minute** |
| 3 minutes before an iqamah | A full-screen countdown — "Maghrib Iqamah in 2:41" |
| **At the iqamah time** | **An "Iqamah Time" box, same style. Also clears itself after 1 minute** |
| After the iqamah | "Prayer in Progress — please silence your phone", for 8 minutes (12 for Fajr) |

The box appears the moment a time is reached and blurs the board behind it, so the room can
see at a glance what is happening. It says **Adhan Time** (الأذان) at a begin time and
**Iqamah Time** (الإقامة) at an iqamah, with the prayer's name underneath. Both fade away on
their own after one minute — change that with `iqamahBoxSeconds` in the `Settings` tab.

Sunrise never gets a box.

**The display is completely silent.** It plays no adhan and no
notification sound — it is a visual board only.

---

## The typeface

The screen is set in **real SF Pro** — Apple's own font files, the exact ones from apple.com.
Not a lookalike, not a substitute.

The eighteen font files (SF Pro Display and SF Pro Text, every weight from Ultralight 100 to
Black 900) are **built into `prayerdisplay.html` itself**, encoded as text inside the file. Nothing is
downloaded when the screen runs.

That matters because Apple's font URLs are locked to apple.com: if the Dell tried to fetch
them over the internet at runtime, Apple's servers would refuse and Windows would drop back to
Segoe UI — which is the look you didn't like. Embedding the files sidesteps that entirely. The
Dell never contacts apple.com, never needs the fonts installed in Windows, and will render
correctly even with the network unplugged.

To keep the file a sensible size, each font was trimmed to just the characters this screen
actually draws — the Latin letters, digits, punctuation and accented characters like the
**Ḥ** and **ū** in "Dhū al-Ḥijjah". That takes the fonts from about 3.2 MB down to roughly
475 KB, so `prayerdisplay.html` is around 700 KB in total and still opens instantly.

Arabic text (the bismillah in the header and the Arabic prayer names) is not part of SF Pro —
Arabic uses the machine's own Arabic font, which Windows already has.

---

## Why the times are trustworthy

Begin times, sunrise/sunset and the Hijri date are downloaded from **AlAdhan**
(`api.aladhan.com`), the published timetable service used across North America, requested
with **ISNA** method at your exact coordinates and the `America/Regina` timezone. Spot
check for 20 Aug 2026: AlAdhan gives Maghrib **8:08 PM** — exactly what IAOS Regina printed
for that date.

A **whole month** is downloaded in one request and kept in the browser's storage, so:

* the day rolls over on its own at midnight — **no reload**;
* Maghrib follows the **true sunset** as it moves through the year, and the Maghrib iqamah
  is re-derived as *sunset + 5 minutes* the moment the sunset value changes — **no reload**;
* the following month is pre-fetched near month-end, so a month rollover never needs
  the network;
* if the internet drops, the cached month keeps the board correct for weeks, and if that
  is gone too, the built-in astronomical engine takes over. The screen is never blank.

### The fallback engine

The offline fallback uses a standard solar-position algorithm, the same maths used by
IslamicFinder and PrayTimes. Verified against your existing board for 31 May 2026:

| | Board | This display |
|---|---|---|
| Sunrise | 4:51 AM | 4:53 AM |
| Dhuhr | 12:57 PM | 12:57 PM |
| Asr | 5:14 PM | 5:14 PM |
| Maghrib | 9:02 PM | 9:00 PM |

The one- to two-minute differences are just a slightly different set of coordinates and
rounding conventions. If you want an exact match to your printed timetable, set
`offsetMaghrib` to `2`, `offsetSunrise` to `-2`, and so on in the Settings tab.

### An important note for Regina

Regina sits at 50.4° N. Around the summer solstice **true astronomical twilight never
ends** — the sun never drops 15° below the horizon, so Fajr and Isha are mathematically
undefined for several weeks. Many prayer apps show blanks, absurd times, or an Isha that
lands after Fajr during this period.

This display applies the **AngleBased** high-latitude rule, which proportionally divides
the night. It was tested on every third day of the year: no missing values, and the
prayers stay in correct order all 12 months. Your local committee may still prefer a
fixed convention in June/July — if so, just type fixed clock times into the Iqamah tab
for those weeks, which always override everything.


---

## Part 5 — The website and the Admin page

Files: `index.html` (public website), `admin.html` + `admin.css` (admin console), `prayerdisplay.html` (TV), shared `site.css` / `site.js`.

**Admin login:** click **Admin** in the website menu (or open `admin.html`).
Email `riadkabashi569@gmail.com`, password `huda0710`. Works on https:// or localhost.

### What the admin console does
- **Overview** — today's times exactly as the website/TV show them, live announcement count, quick actions.
- **Iqamah schedule** — type a new time next to each prayer, see the resulting clock time instantly, press **Save changes**. This **edits the existing row in the Sheet** (the one currently in effect) — it never adds a row unless you open *Advanced: schedule a future change*. Changes reach the TV within 5 minutes.
- **Announcements** — post, edit, expire or delete messages; date chips (7/14/30 days) set the end date.
- **Data & sheet** — connection status, raw rows, link to the Sheet.

### One-time: install the writer script (v2) — REQUIRED
The API key can only *read* the Sheet, so the admin page writes through a tiny Google Apps Script.

1. Open the Sheet → **Extensions → Apps Script**.
2. Delete everything in `Code.gs` and paste the full contents of **`AppsScript.gs`** (v2). Save (Ctrl/Cmd+S).
3. **Deploy → Manage deployments → ✎ (edit) → Version: "New version" → Deploy.**
   Execute as **Me**, Who has access **Anyone**. Authorise when prompted.
   (First time only: Deploy → New deployment → Web app.)
4. The `/exec` URL stays the same; it is already in `admin.html` (`WRITE_URL`).
5. Test: open the admin console → **Data & sheet** → status should say *Connected · read & write* (or open the /exec URL in a browser — you should see `{"ok":true,"version":2,...}`).

If you see **"Script function not found: doPost"**, the deployment is serving an old version — repeat step 3 (New version). Every time you edit the script, you must deploy a **New version**; saving alone does nothing.

Shared secret: `WRITE_SECRET` in `AppsScript.gs` must match `WRITE_SECRET` in `admin.html` (`aasiya-2026`). Change both if you change one.

### Iqamah cell grammar (Sheet or admin page)
`5:15` / `5:15 pm` fixed time (≤11 is treated as PM when the adhan is after noon) · `+5` minutes after adhan · `+10 ^5` adhan+10 rounded up to next 5 · blank = default.
