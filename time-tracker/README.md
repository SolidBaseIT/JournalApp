# Work Rhythm

A small productivity PWA (React + TypeScript + Vite) that keeps you on an hourly work rhythm:

- **:00–:40 — Focus.** Deep work.
- **:40–:50 — Document.** A reminder fires at :40 to write down what you did this hour.
- **:50–:00 — Break.** A reminder fires at :50 to take a 10-minute break.

Each work hour has a **documentation checkbox** so you can confirm you wrote things down, with a
daily completion count. Everything is stored locally on the device (localStorage) — no server, no
account.

## Features

- Live hour ring showing the current phase, countdown to the next phase, and markers at :40 and :50
- Notifications (when permitted), a sound chime, and vibration on each phase change
- Per-hour documentation checklist for your configured workday, reset daily
- Configurable: documentation minute, break minute, workday start/end, quiet hours
- "Keep screen on" (Wake Lock) so alerts are guaranteed during a session
- Installable PWA with offline support (service worker)

## Run locally

```bash
cd time-tracker
pnpm install
pnpm dev        # dev server
pnpm build      # production build in dist/
```

## Put it on your iPhone

1. Host the `dist/` folder anywhere static (GitHub Pages, Netlify, Vercel, or any web server).
   The build uses relative paths, so any subdirectory works.
2. On the iPhone, open the URL in **Safari**.
3. Tap **Share → Add to Home Screen**.
4. Launch it from the home screen icon and tap **Enable alerts** (iOS only allows web notifications
   for apps installed to the home screen, iOS 16.4+).

### iOS limitation worth knowing

Web apps on iOS cannot fire *scheduled* notifications while closed or in the background — that
requires a server sending push messages or a native app. In practice:

- With the app **open** (foreground), all alerts work: banner, chime, vibration.
- Use **Keep screen on** during a work session and alerts are 100% reliable.
- If you background it, you'll see the correct phase as soon as you return (the clock is
  wall-time based), but the :40/:50 banner may not fire in the background.

If you later want fully-native background reminders, the same logic ports cleanly to a React
Native/Expo app using `expo-notifications` local scheduled notifications.

## Icons

`public/*.png` are generated — regenerate with:

```bash
pnpm icons
```
