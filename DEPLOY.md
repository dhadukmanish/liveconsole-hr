# Deploying Live Console HR to site4now (SmarterASP.NET)

Target: `https://task.kriviinfotech.com`

The host does not run `npm install` or `next build` for us — their own Node.js
articles tell you to build elsewhere and upload the result. So the build happens
here and the host only ever runs `node server.js`.

---

## 1. One command builds the payload

```bash
npm run package
```

This produces `deploy-payload/` and `deploy-payload.zip` (~25 MB zipped, ~79 MB
unpacked, 2,202 files). It:

1. runs `prisma generate` and `next build` (standalone output),
2. copies the standalone server, `.next/static` and `public/`,
3. copies `web.config`,
4. copies `prisma/schema.prisma` and `prisma/migrations/`,
5. **copies the Windows Prisma query engine** — a Linux build only traces the
   Linux engine, and without this the app cannot open a database connection on
   the host,
6. writes `.env` from `secrets/production.env` (never committed),
7. creates `App_Data/uploads/` and `logs/`,
8. prunes build-only packages (webpack, esbuild, typescript) and sharp, which
   only serves `next/image` and is not used here — 132 MB down to 79 MB.

> The payload's `server.js` is the one Next generates for standalone output, not
> the `server.js` in the repo root. Next inlines the build-time config into it,
> which the repo's copy cannot do because `next.config.ts` is not shipped. Both
> read `PORT` from the environment, so `web.config` is the same either way. The
> repo's `server.js` is what `npm start` uses when running from source.

## 2. Upload

Three ways; all put the same files in the same place. Whichever you pick, the
site folder must end up with `server.js` directly inside it, not one level down.

### a. VS Code SFTP extension

```bash
cp .vscode/sftp.sample.json .vscode/sftp.json   # add your password if you like
npm run package
# Command palette -> SFTP: Upload Folder -> deploy-payload
```

`context` is already set to `deploy-payload`, so only the built app is sent,
never the source tree. `uploadOnSave` is off on purpose — this app must be
rebuilt before anything ships. Check `remotePath` once against the remote
listing. Details in `.vscode/README-sftp.md`.

### b. One command from your machine

```bash
npm run package
FTP_HOST=win8194.site4now.net FTP_USER=... FTP_PASSWORD=... npm run deploy:ftp
```

Or put those three in a `.env.ftp` file (gitignored) and just run
`npm run deploy:ftp`. Add `--zip-only` to send the single 25 MB zip instead of
~2,200 files, then Extract it in the File Manager — far faster. `--dry-run`
shows what would go without connecting.

This will not work from a cloud build sandbox: outbound FTP is usually blocked
there, which is exactly why the payload is committed to the `deploy` branch.

### c. Control panel File Manager

1. Control panel → **File Manager** → the `task.kriviinfotech.com` folder.
2. **Delete the host's default `index.html`.** IIS serves it ahead of the app and
   you will keep seeing the placeholder page until it is gone.
3. Upload `deploy-payload.zip` and extract it in place (far faster than FTP,
   which sends all 2,202 files one at a time).
4. Confirm the site root now contains `server.js`, `web.config`, `.next/`,
   `node_modules/`, `public/`, `.env`, `App_Data/`.

## 3. Enable Node.js for the site

Control panel → **Hosting Manager → Node.js** (or **Advance → NodeJS Manager**),
select the site and its root folder, and enable it.

`web.config` is written for **httpPlatformHandler**, which is what SmarterASP's
current Node.js and Next.js articles use: IIS starts `node server.js`, picks a
free port and passes it in as `%HTTP_PLATFORM_PORT%`.

**If the site 500s immediately with a handler or module error**, the account is
wired for iisnode instead. In `web.config`, comment out the `<handlers>` +
`<httpPlatform>` block and uncomment the iisnode block below it. No rebuild is
needed.

To pin a Node version, upload `node.exe` to `/App_Data` and point `processPath`
at it (`processPath="..\App_Data\node.exe"`).

## 4. Environment

`.env` sits at the site root and is read at startup. `web.config` denies `.env`
over HTTP, but check it is not reachable anyway:

```
https://task.kriviinfotech.com/.env     -> must be 404 or 403
```

Keys:

| Key | Notes |
| --- | --- |
| `DATABASE_URL` | Port **6432**, with `pgbouncer=true&connection_limit=1`. 6432 is a PgBouncer pooler; without that flag Prisma's prepared statements break, and without the connection limit shared hosting will cut you off. |
| `DIRECT_DATABASE_URL` | Port **5432**, used only by `prisma migrate`. Migrations cannot run through transaction-mode pooling. |
| `AUTH_SECRET` | 32+ random bytes. Rotating it signs everyone out. |
| `UPLOAD_DIR` | `./App_Data/uploads`. Must be writable by the app pool and outside the web root. |
| `NEXT_PUBLIC_BETA_BANNER` | `"false"` removes the beta banner. This one is baked in at build time, so change it **before** `npm run package`. |
| `SMS_PROVIDER` | `console` logs OTPs to `logs/`. Switch to `msg91` with the three MSG91 keys when SMS goes live. |
| `MSG91_REMINDER_TEMPLATE_ID` | A second DLT template, for reminders. Reminders refuse to send over SMS until this is set rather than borrow the OTP template, which the operator never registered for this text. |
| `CRON_SECRET` | Bearer token for `/api/cron/reminders`. The deploy derives one from `AUTH_SECRET` if the repository secret is unset, so rotating `AUTH_SECRET` changes the reminder URL too. |

## 5. Database migrations

Migrations need the direct (5432) connection, from a machine that can reach the
database. From your own machine with the repo checked out:

```bash
# .env must hold the production DIRECT_DATABASE_URL
npx prisma migrate deploy
```

**If port 5432 is not open to you**, apply the SQL by hand instead: open
`prisma/migrations/<timestamp>_init/migration.sql` and run it in the control
panel's PostgreSQL query tool. Prisma then needs its bookkeeping table seeded,
so afterwards run `npx prisma migrate resolve --applied <migration_name>` when
you do get a direct connection, or keep applying future migrations by hand.

### Seeding

Seeding creates the roles, the 40 permissions, the masters and one SUPERADMIN.
It is idempotent: re-running never resets a password or a permission that has
since been edited in the UI.

```bash
SUPERADMIN_MOBILE=9601292221 SUPERADMIN_NAME="Manish Dhaduk" npm run db:seed
```

It prints the generated password once. The account is flagged
`mustChangePassword`, so the first sign-in forces a replacement before anything
else in the app is reachable.

## 6. Verify

1. `https://task.kriviinfotech.com/login` loads with the beta banner.
2. Sign in as the SUPERADMIN → forced password change → Home.
3. Create a user, upload a document, download the ID card PDF.
4. Chrome on Android → menu → **Add to home screen** should offer to install.
5. `logs/` should contain a `node` stdout file; check there first when anything
   misbehaves.

## 7. Daily reminders (external cron)

Shared Windows hosting has no scheduler, so the reminders run when something
outside calls them:

```
GET  https://task.kriviinfotech.com/api/cron/reminders?token=<CRON_SECRET>
```

It reports what it did as JSON, and it is safe to call more than once: every
send is recorded against (kind, record, India-local day, recipient), so the
second call the same day sends nothing. A send that fails is deliberately not
recorded, so it is retried on the next run.

To set it up:

1. Push a commit whose **subject** contains `[cron-url]`. The workflow prints
   the full URL, token included, into that run's summary. (It is in the run
   summary rather than anywhere public because the token is in the URL.)
2. At [cron-job.org](https://cron-job.org) create a job: that URL, method GET,
   once a day at 09:00 **Asia/Kolkata**, and enable failure notifications.
3. Run it once by hand and check the response. `{"ok":true,...}` is the
   endpoint working; `{"error":"unauthorized"}` means the token does not match
   what the host has in `.env`.

What it sends:

- **Licences** inside their own `remindDaysBefore` window, and licences already
  expired, to the owner — or to the admins when the licence has no owner.
- **Leave requests** still `PENDING` after two days, to the applicant's manager,
  falling back to the admins.

While `SMS_PROVIDER` is `console` these are written to `logs/` instead of sent.

## 8. SSL

If `https://` fails, enable SSL for the subdomain in the control panel
(**Websites → SSL**, Let's Encrypt is free on their plans). Once HTTPS is on,
add `SESSION_COOKIE_SECURE="true"` to `.env` and restart — the session cookie is
deliberately not `Secure` by default so the app is not unusable before SSL is
turned on.

## 9. Redeploying

`npm run package`, upload, extract, overwrite. To restart the app without a
re-upload, touch `web.config` in File Manager (any save recycles the process).

**Do not overwrite `App_Data/uploads/`** — that is where the documents live.
The zip contains only an empty `.keep`, so extracting over the top is safe, but
avoid deleting the folder first.

## 10. Rollback

Keep the previous `deploy-payload.zip`. Rolling back is re-extracting it. Only a
migration needs care: if the newer build added a migration, roll the database
back first or the older code may meet columns it does not expect.

## 11. Troubleshooting

| Symptom | Cause |
| --- | --- |
| **Empty 500, no body, nothing in `logs/`** | IIS rejected `web.config` before any handler ran. Node never started, which is why the log is empty. Almost always a config error: the one that bit us was adding `App_Data` under `hiddenSegments`, which IIS already hides by default, so the duplicate key made the whole file invalid. Push `[handler]` to see IIS's own sub-status. |
| **A generic "500 - Internal server error" page** | IIS sends detailed errors to local requests only. `deploy-variants/web.config.detailed` turns them on for remote callers; take it off again afterwards, since it exposes server paths. |
| Host's placeholder page still shows | `index.html` was not deleted from the site root |
| HTTP 500.19 | `web.config` references a handler the account does not have — switch to the iisnode block |
| HTTP 502 / app never starts | Check `logs/`. Usually `.env` missing, or the app pool cannot write to `App_Data/uploads` |
| "Query engine library for current platform could not be found" | The Windows Prisma engine did not make it into the payload. Confirm `binaryTargets = ["native", "windows"]` in `prisma/schema.prisma`, re-run `npm run package` |
| Timeouts on first request after idle | Shared hosting spun the process down. `startupTimeLimit` is already 120s; first hit after idle is slow by design |
| OTP never arrives | `SMS_PROVIDER` is still `console` — the code is in `logs/`, not an SMS |
| Reminder URL returns `unauthorized` | The token in the URL does not match `CRON_SECRET` in the host's `.env`. Push `[cron-url]` to read the current one; note that rotating `AUTH_SECRET` changes it when no explicit `CRON_SECRET` is set |
| Reminders run but nobody is told | Expected while `SMS_PROVIDER=console` — check `logs/` for `[sms:console] text for …`. With `msg91`, `MSG91_REMINDER_TEMPLATE_ID` must be set or every send is reported in `failures` |

---

## Diagnosing without a full redeploy

Uploading 2,202 files takes fifteen minutes, which is far too slow a loop for
debugging. Two commit-message markers avoid it:

- `[inspect]` — lists the remote folder, pulls the host's stdout logs and
  reports what the site returns over http and https. About forty seconds.
- `[handler]` — swaps only `web.config` and probes after each variant, for
  when the failure is IIS-side rather than in the app.
- `[cron-url]` — prints the daily reminder URL into the run summary.
- `[reset-admin]` — resets the SUPERADMIN password from the repository secret.

## Known constraints

- **No cron on shared hosting.** Reminders are an API route called by an
  external scheduler; see section 7. Nothing fires on its own until that job
  exists.
- **One Node process** (`nodeProcessCountPerApplication="1"`). The login rate
  limiter keeps its counters in memory and assumes this. If the host is ever
  configured for multiple processes, that limiter needs to move into Postgres.
- **The build sandbox cannot reach the host or the database** (egress policy), so
  the upload and the migration step are manual and were not executed from here.
