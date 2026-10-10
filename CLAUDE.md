# De Vie Handovers

## Before changing any interface in this repo

Read `DESIGN.md` in this repo first. It is the De Vie Design Standard and it is
identical in every De Vie repo. It defines the colour, type, spacing, radius and
breakpoint tokens, the shared UI patterns, and a checklist (Part 5) to run
before merging a UI change.

Do not introduce a hex value, a breakpoint or a control size that is not in
`DESIGN.md` Part 2. If something genuinely needs a new token, add it to
`DESIGN.md` in every repo rather than only here.

## What this app is

handovers.devie.bar. The nightly handover and the maintenance list, replacing the
single-file prototype. Next.js 14 App Router, Tailwind, Supabase (the shared De Vie
Database project, same login and middleware as the dashboard).

- `/` Tonight: one block per room (Summer, Spring, Autumn), the closing manager
  section with the Square block, a maintenance quick-add, and Publish.
- `/log` Every published night, newest first.
- `/maintenance` The maintenance list. At 840px and above it is the right rail on
  every page instead, and this route sends a wide window back to `/`.
- `/api/square/night?date=YYYY-MM-DD` Server-side Square pull for the service
  window (15:00 to 06:00 Paris), summarised by `lib/square-summary.ts`.
- `/api/slack/publish` POST `{date, target: "channel" | "test"}`. Builds the
  message from the `handovers` row plus open maintenance items
  (`lib/slack-text.ts`, markdown converted to Slack mrkdwn) and posts it with a
  thread reply.

## How it works

- One draft row per service date in `public.handover_drafts`. Phones follow it
  with Supabase realtime (`postgres_changes`), so rooms see each other's
  submissions. Room writes are partial: read `rooms`, merge one room, update.
- Publishing upserts `public.handovers`, marks the draft published, then calls
  the Slack route. A Slack failure leaves the log row saved and says so.
- `public.maintenance_items` is live the same way. Done items stay, filtered out of
  the Active view.
- Service date is today in Paris, or yesterday before 06:00 (`lib/paris.ts`).
- Access: any signed-in user with a row in `public.profiles`
  (`lib/auth.ts`, and `has_handovers_access()` in the RLS policies). The dashboard's
  `hasDashboard` role gate is deliberately not used here.
- The signed-in user's name (profiles.full_name, else the email local part) is the
  default "By" and closing manager. A first name on the people list is matched to it.
- Styles: the prototype's CSS lives in `app/globals.css` under a `.ho-` prefix
  inside `:where(.ho-app)`, so it adds no specificity and Tailwind utilities
  (EstateNav, SignOutButton) still win. Tailwind token names are the dashboard's.

## Estate list

`lib/estate.ts` is identical in every De Vie repo. It gained a Handovers entry
after Book, so the same line must be copied to every other repo:

`{ key: "handovers", label: "Handovers", blurb: "Nightly handovers and the maintenance list", url: "https://handovers.devie.bar" },`

## Environment

See `.env.example`. Server only: `SQUARE_ACCESS_TOKEN`, `SQUARE_LOCATION_ID`,
`SLACK_BOT_TOKEN`, `HANDOVERS_SLACK_CHANNEL`, `SLACK_TEST_CHANNEL`. The Supabase
URL and publishable key default in `lib/config.ts`. The Supabase auth redirect
list must include `https://handovers.devie.bar/auth/callback`.

## Database

`supabase/migrations/20261010_handovers.sql` creates `handover_drafts`,
`handovers` and `maintenance_items`, RLS for anyone with a profile, realtime for the
drafts and the maintenance list, and the `updated_at` trigger. Apply it once.

## Non-negotiables

- No horizontal scrolling without a visible affordance and a sticky first column.
- The value a screen exists for (price, amount, status, commit button) is never the
  thing that scrolls out of view.
- 44px minimum control height below 840px, 32px at and above.
- PP Editorial New is always set at -0.05em letter-spacing.
- Every async view has a timeout, a visible error and a retry.
- No em dashes or double hyphens in copy, comments or commit messages.
