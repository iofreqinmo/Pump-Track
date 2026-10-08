# Pump Track 💧

A sweet little phone app for logging pumping sessions.

- **At a glance:** a ring with today's total (it fills toward a daily goal if you set one), when the last pump was and how long ago, and a table of pumps, total and average per pump for **today** and the **last 24 hours**.
- **Every pump, last 24h:** a chart with one bar per pump (taller bars mean more milk). Tap a bar for its time and amount.
- **Log a pump:** the amount (±5 ml buttons, quick presets, starts at your last amount), optional minutes, the time (defaults to now, and can be moved back to earlier in the week) and a note.
- **History → Today:** today's pumps. Tap one to edit or delete it (deletes can be undone).
- **History → Last 7 days:** pumps, total and average per pump for each day, plus a daily average. Tap a day to see its pumps.
- **Settings:** ml or oz, a daily goal, backup export/import (JSON), and CSV export.
- Works offline, follows your phone's dark mode for night pumps, and can be installed to the home screen.

## Data

- **Shared family log:** entries live in Firestore and sync live between everyone signed in with Google.
  Pump Track uses the same Firebase project as Twin Track (its own `pumps` collection), so the same accounts can sign in.
  Setup steps: [SETUP-FIREBASE.md](SETUP-FIREBASE.md).
- **This phone only:** if `firebase-config.js` is set to `null`, entries are stored only in the browser on the device you use.

Either way the app keeps a copy on the phone, so it opens instantly and works offline.

## Running it

It's plain HTML/CSS/JS with no build step.

- **Locally:** run `python3 -m http.server` in this folder, then open http://localhost:8000.
- **On your phone:** turn on GitHub Pages under repo **Settings → Pages**, choosing the `main` branch and `/ (root)`. The app will be at https://iofreqinmo.github.io/Pump-Track/ (the capital letters matter). Open it on your phone, then use **Share → Add to Home Screen** (iOS) or **Install app** (Android).

When you change files, bump `CACHE` in `sw.js` and `APP_VERSION` in `app.js`. `vendor/firebase.js` is a bundled copy of the Firebase SDK; rebuild it with `scripts/build-firebase.sh`. Installed copies check for updates whenever they are opened and reload themselves.
