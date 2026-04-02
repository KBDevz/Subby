# Subby

Subby is a mobile-first soccer coaching app for managing:

- team setup and saved rosters
- formations and lineup assignment
- game-day attendance
- live substitutions and auto-sub suggestions
- score, goals, and assists
- season stats and player leaderboards

## Local Development

Install dependencies:

```bash
npm install
```

Start the app:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

## Deployment

Subby is a Vite app and can be deployed as a static site.

Recommended settings:

- Build command: `npm run build`
- Output directory: `dist`

Works well on:

- Vercel
- Netlify

## Current Stack

- React
- Vite
- Supabase Auth + data sync

## Notes

- Invite links are generated from `window.location.origin`, so once the app is deployed, coach invite links will automatically use the live domain.
- The current team-sharing flow supports shared team access. True live multi-coach realtime game sync is the next major collaboration feature to build.
