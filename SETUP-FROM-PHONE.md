# Deploying from a phone

You add a handful of secrets once on github.com. After that every deploy is a
push, and GitHub does the FTP upload, the database migration and the health
check for you. Nothing has to run on your laptop.

This exists because a cloud build sandbox cannot open outbound FTP, while
GitHub's runners can.

---

## Once: add the secrets

On github.com (the mobile browser is fine — request the desktop site if the
menus are hard to reach):

**Repository → Settings → Secrets and variables → Actions → New repository secret**

| Secret | Value |
| --- | --- |
| `FTP_HOST` | `win8194.site4now.net` |
| `FTP_USER` | your FTP username |
| `FTP_PASSWORD` | your FTP password |
| `DATABASE_URL` | the pooled URL, port **6432**, ending `?pgbouncer=true&connection_limit=1&sslmode=prefer` |
| `DIRECT_DATABASE_URL` | the same but port **5432**, no pgbouncer flag — migrations need this |
| `AUTH_SECRET` | 32+ random characters; changing it later signs everyone out |

Optional: `SUPERADMIN_PASSWORD` (otherwise one is generated and printed once),
`CRON_SECRET` (the scheduled URLs are guarded by it; leave it unset and one is
derived from `AUTH_SECRET`), and the `MSG91_*` secrets when SMS goes live —
`MSG91_AUTH_KEY`, `MSG91_SENDER_ID`, `MSG91_TEMPLATE_ID` for login codes and
`MSG91_REMINDER_TEMPLATE_ID` for reminders, which need a separate template.

For WhatsApp: `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` (see the
WhatsApp section below).

### Then the variables

Same page, **Variables** tab → **New repository variable**:

| Variable | Value | Why |
| --- | --- | --- |
| `SUPERADMIN_MOBILE` | your mobile number | who the first super admin is |
| `SUPERADMIN_NAME` | your name | shown in the app |
| `SITE_URL` | `https://task.kriviinfotech.com` | used by the health check |
| `FTP_REMOTE` | leave unset at first | set it only if the site is not at the FTP root |
| `SESSION_COOKIE_SECURE` | `false` | set to `true` once HTTPS works |
| `NOTIFY_CHANNEL` | leave unset | `whatsapp`, `sms` or `console`; unset works it out from what is configured |
| `OTP_CHANNEL` | leave unset | `whatsapp` or `sms` for login codes; unset prefers WhatsApp and falls back to SMS |
| `WHATSAPP_TEMPLATE_LANG` | `en` | set to `hi` or `gu` if your approved templates are in that language |

Variables are visible in logs; secrets are masked. That is why the password and
the database URLs are secrets and the rest are variables.

---

## Every deploy after that

Put `[deploy]` in the **first line** of the commit message. That is the whole
trigger — only the subject line is read, so writing about `[deploy]` further
down in a commit body never ships anything:

```
Fix the leave screen [deploy]
```

The first time, also add `[seed]` so the roles, permissions, masters and your
super admin get created:

```
First production deploy [deploy] [seed]
```

Seeding is safe to repeat — it never resets a password or a permission that has
been edited in the app — but it is opt-in so a routine deploy cannot touch
account data.

A push **without** `[deploy]` builds nothing and changes nothing on the host.

### Other markers, none of which upload anything

| Marker | What it does |
| --- | --- |
| `[seed]` | with `[deploy]`, creates roles, permissions, masters and the super admin |
| `[inspect]` | lists what is on the host, pulls its logs and checks what the live URLs return — about forty seconds |
| `[handler]` | swaps the IIS handler, for when the site answers an empty 500 |
| `[reset-admin]` | resets the super admin password from `SUPERADMIN_PASSWORD` |
| `[cron-url]` | prints the daily reminder URL into the run summary |

---

## Reports

**More → Reports** on any phone. Four of them — attendance register, leave
register, task summary and licence list — each with a **Download PDF** button.

Who sees what follows the same rule as the rest of the app: an employee sees
their own rows, an admin their team's, a super admin everybody's. The screen says
which of the three you are getting, so there is no guessing.

The period is in the address, so a link to September's attendance is a link you
can send to somebody.

Each report opens with a chart — days per person, leave by type, work per person,
and which month each licence falls due in. The same chart is in the PDF, so a
printed copy shows what the screen showed.

---

## Once: the three scheduled jobs

The host has no scheduler of its own, so nothing reminds anybody, nothing gets
sent and nothing backs up until these exist. All free, and a few minutes on a
phone.

1. Push a commit whose first line contains `[cron-url]`. Open the run (Actions
   tab → the run → **Summary**) and copy the URL it prints. It contains the
   token, so treat it like a password.
2. Sign up at [cron-job.org](https://cron-job.org) and create:

   | Job | URL | When |
   | --- | --- | --- |
   | Reminders | the URL from step 1 | daily, 09:00, timezone **Asia/Kolkata** |
   | Messages | the same URL with `/reminders` changed to `/notifications` | every 15 minutes |
   | Backup | the same URL with `/reminders` changed to `/backup` | weekly, Sunday 02:00 |

   The **Messages** one is what actually sends. Approving leave or assigning a
   task queues a message; nothing leaves the building until this job runs. Every
   fifteen minutes is a good balance — a person notices a quarter of an hour,
   and it keeps each run small.

3. Hit **Test run** on each. `{"ok":true,...}` means it works.
   `{"error":"unauthorized"}` means the token does not match the host.

Once they are running, **More → Notifications** says when the scheduler last
called and what each of the three jobs did. If it says the scheduler has never
called, the job does not exist — whatever the cron-job.org dashboard shows.

Calling either one twice does no harm: the reminder run sends nothing the second
time the same day, and the backup overwrites that day's file instead of piling
up copies. Backups land in `App_Data/backups` on the host — download them over
FTP now and then, because a backup that only lives on the same server is not
really a backup.

---

## WhatsApp

The app queues its messages whatever happens, so this can wait — but nothing is
actually delivered until it is done. Two halves:

**The half that works today, with no setup.** Every contact in the phone book and
every task you assign to somebody has a *Send on WhatsApp* button. It opens your
own WhatsApp with the message ready, and you press send. No business account, no
approval.

**The automatic half, which needs a WhatsApp Business account.** Approvals,
assignments and reminders go out on their own. WhatsApp only allows this through
templates that Meta has approved in advance, so:

1. Create a Meta app with the WhatsApp product, add your business number, and
   finish business verification.
2. In WhatsApp Manager → Message templates, add one Utility template per event.
   The names and the numbered placeholders are listed in `DEPLOY.md` section 8 —
   the wording is yours, the placeholder order is not.
   Add one more, category **Authentication**, named `login_code`, with a **Copy
   code** button: that is the one that sends login codes, and Meta keeps those in
   their own category.
3. Add `WHATSAPP_PHONE_NUMBER_ID` and `WHATSAPP_ACCESS_TOKEN` as repository
   secrets and deploy. Use a **permanent** token: the one the dashboard shows
   first expires in 24 hours.

Until then, **More → Notifications** (super admin) lists every message with its
status and says plainly that nothing is being sent. The text also goes to
`logs/` on the host, so you can read what would have gone out.

Anybody who does not want WhatsApp messages can be switched off individually:
Users → open them → *Do not send WhatsApp messages*. They keep seeing everything
inside the app.

## What the workflow does, in order

1. Checks that the secrets exist, and stops with a readable error if not.
2. `npm ci`, then builds the payload (including the Windows Prisma engine).
3. Writes `.env` into the payload from the secrets — so you never create that
   file by hand on the host.
4. Applies database migrations over the **direct** connection.
5. Seeds, only when asked.
6. Prints the remote folder listing, so you can see where the site lives.
7. Uploads over FTP and deletes the host's placeholder `index.html`, which IIS
   would otherwise serve ahead of the app.
8. Polls `SITE_URL/login` until it answers 200.

## Watching a run from your phone

**Repository → Actions → the newest run.** Each step opens to show its log. The
last step tells you whether the site answered.

## If the first run fails

| What the log says | What to do |
| --- | --- |
| `Missing repository secrets: ...` | add the ones it names |
| FTP connects but the listing looks wrong | the site is not at the FTP root — set the `FTP_REMOTE` variable to the folder from the listing, e.g. `/task.kriviinfotech.com/wwwroot` |
| `Can't reach database server` during migrations | port 5432 is closed to outside connections; tell me and we apply the SQL through the panel instead |
| Upload succeeds but the health check warns | Node.js is probably not enabled yet for that folder: control panel → Hosting Manager → Node.js |
| The site shows the host's placeholder | the upload went to a different folder than the site root — same fix as `FTP_REMOTE` above |

## One thing to keep in mind

Anyone who can push to this repository can deploy, and the GitHub Actions logs
are visible to everyone with repository access. The secrets themselves are
masked, but a seeded super admin password is printed once in the seed step — so
sign in and change it straight away.
