# Live Console HR

HR console for Krivi Infotech — tasks, attendance, leave, documents and people.

Built so far:

- **Phase 1** — login (OTP or password), users, permissions, documents, ID card
  PDF, settings masters.
- **Phase 2** — attendance check-in/check-out, leave apply and approval.
- **Phase 3** — tasks as a Kanban board, with detail and comments.
- **Phase 4** — phone book, licences with expiry tracking, daily reminders and
  database snapshots, both driven by an external scheduler.

- **Phase 5** — WhatsApp: an outbox that queues every notification, a Cloud API
  channel that drains it, click-to-chat where that is quicker, and a delivery log
  for super admins.

`BRIEF.md` has the original plan.

Live at **http://task.kriviinfotech.com** (HTTPS once the host issues a
certificate for the subdomain).

- **Stack** — Next.js 15.5 (App Router, TypeScript, `src/`), Tailwind v4,
  Prisma 6 + PostgreSQL, next-intl (en / hi / gu), PWA via `@ducanh2912/next-pwa`.
- **Host** — SmarterASP.NET / site4now, Windows shared hosting, IIS +
  httpPlatformHandler. See `DEPLOY.md` and `HOSTING-NOTES.md`.

## Running locally

```bash
npm install
npm run dev:db:start          # local Postgres 16 on port 5433
cp .env.example .env          # then fill in AUTH_SECRET
npm run db:migrate
npm run db:seed               # prints the super admin password once
npm run dev
```

`SMS_PROVIDER=console` (the default) logs OTPs to the terminal and shows a
"DEV OTP" banner on the login screen outside production.

## Scripts

| Script | Does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | `prisma generate` + `next build` |
| `npm start` | Runs the app from source via `server.js` |
| `npm run package` | Builds the upload payload for the host (see `DEPLOY.md`) |
| `npm run db:migrate` / `db:deploy` / `db:seed` | Prisma migrate dev / deploy / seed |
| `npm run dev:db:start` / `dev:db:stop` | Local Postgres cluster in `.pgdata/` |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |

## How the important parts work

**Sessions are rows, not tokens.** `sessions` holds a SHA-256 of the cookie
value; every request re-reads the user's status. That is what makes "block this
person" take effect on their next request — a stateless JWT could not be
revoked before it expired.

**Permission and scope are separate.** A permission (`module × action`, with
role defaults in `role_permissions` and per-user grants/revokes in
`user_permissions`) decides *whether* you can do something. Scope decides *whose
records* you see: an employee gets their own, an admin gets their team resolved
recursively through `manager_id`, a super admin gets everyone. Both are checked
on the server for every action and route; the UI hiding a button is cosmetic.

**Documents are never static files.** Uploads land outside the web root and are
streamed by `/api/documents/[id]/file`, which re-checks session, permission and
scope. Stored filenames are generated, so a crafted upload name cannot escape
the upload directory.

## Layout

```
prisma/          schema, migrations, seed
scripts/         local db, icon generation, deploy packaging
src/app/(auth)/  login
src/app/(app)/   everything behind a session
src/app/api/     document streaming, ID card PDF, the three cron routes
src/lib/         prisma, rbac, scope, storage, auth, audit, validation, reminders,
                 backup, notify (the outbox), messaging (the channels)
messages/        en / hi / gu (identical key sets)
web.config       IIS configuration for the host
server.js        entry point when running from source
```

## Notes on deliberate choices

- **Custom session auth instead of Auth.js.** The brief asked for Auth.js, but
  its credentials provider forces stateless JWT sessions, and the brief also
  requires admins to block and deactivate people. A JWT cannot be revoked, so
  blocking would not have taken effect until the token expired. The `Session`
  model the brief itself lists is the database-backed approach used here.
- **Mukta + Mukta Vaani.** Mukta has no Gujarati subset; Gujarati lives in Mukta
  Vaani. Both load from the same superfamily and the browser picks per glyph.
- **Text on the brand orange is the ink colour, not white.** White on `#F7941D`
  is 2.28:1 and fails WCAG AA; the ink colour on the same orange is 6.2:1. The
  orange is unchanged.
- **Reminders are idempotent, not scheduled.** Shared hosting has no cron, so
  `/api/cron/reminders` is called by an external scheduler. Schedulers retry, so
  every send is recorded against (kind, record, India-local day, recipient) and
  the second call in a day sends nothing. A failed send is deliberately *not*
  recorded, so it is retried on the next run.
- **Reminders use a different SMS template from OTPs.** An Indian provider
  routes the two through separate DLT-registered templates; a reminder pushed
  through the OTP template is rejected or mangled. `sendText` refuses rather
  than borrow the OTP template.
- **A WhatsApp link only appears when the number can really be one.** A landline
  with an STD code is 11 digits, which looks like an international number but
  is not one, so `0281 2345678` gets a call link and no WhatsApp link.
- **The backup enumerates tables from the database, not from a list.** A
  snapshot that silently stopped covering a table added in a later phase would
  be worse than no snapshot, so `/api/cron/backup` reads
  `information_schema` and dumps what it finds, minus sessions and one-time
  codes. It includes password hashes — that is what makes it restorable — so the
  files live in `App_Data`, which IIS does not serve.
- **Notifications are queued, never sent inline.** Approving leave writes a row
  in `notifications`; the external scheduler sends it. A server action must not
  sit waiting on Meta's API, iisnode gives us no background worker, and a failed
  send has to be retryable — which an inline call cannot be once the request has
  ended. Producers carry a dedupe key, so running one twice sends nothing twice.
- **Every WhatsApp notification is a template.** Meta only allows free-form text
  within 24 hours of the person writing in, so a notification nobody asked for
  has to be an approved template. Hence `params` next to `body`: the parameters
  go to Meta, the body is what SMS, the dev console and the log show.
- **Approved and rejected are separate templates.** One template with the
  decision as a parameter would drop an English word into a Gujarati sentence.
- **Retrying is classified, not blanket.** A rate limit or a Graph 500 is worth
  another go; an unknown template or a number that is not on WhatsApp is not, and
  fails immediately so somebody reads it.
- **A login screen that cannot send a code says so.** With `SMS_PROVIDER=console`
  in production the code goes to a log file nobody signing in can read, and
  "OTP sent to your mobile" would leave them waiting for a text that never
  comes. The OTP box stays usable — an administrator can read the code out of
  the log — but the claim is dropped.
