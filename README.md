# Household Organizer

Private household inventory and shopping app.

## Requirements

- Node.js 20.9 or later
- [pnpm](https://pnpm.io/) 11
- Local [Supabase](https://supabase.com/docs/guides/local-development) for Auth, RPC, and Playwright tests

## Environment

Copy [`.env.example`](.env.example) to `.env.local` and set only these public values:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

Do not put a service-role or secret Supabase key in the app. The browser and Next.js server use the publishable key only.

Open Food Facts product lookup needs no API key and no extra environment variables.

Production:

- Serve the app over HTTPS (required for the camera barcode scanner and installable PWA).
- Set the two `NEXT_PUBLIC_*` variables on Vercel (or the host you use).
- In the production Supabase project, disable public signup or use invite-only Auth. Local signup stays enabled so Playwright can register test users.
- Apply the migrations in `supabase/migrations/` to the production database.

## Getting started

```bash
pnpm install
```

Start local Supabase, then the app:

```bash
pnpm dev
```

Open [http://localhost:3001](http://localhost:3001). Port 3001 is reserved for this app so it does not collide with whatever is already on 3000.

## Checks

```bash
pnpm typecheck
pnpm lint
pnpm build
pnpm test
pnpm test:e2e
```

`pnpm test` includes Supabase RPC tests. Those tests skip when local Supabase is not running; a skip means the database was unavailable, not that the RPCs passed.
