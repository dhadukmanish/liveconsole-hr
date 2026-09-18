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
and the three `MSG91_*` secrets when SMS goes live.

### Then the variables

Same page, **Variables** tab → **New repository variable**:

| Variable | Value | Why |
| --- | --- | --- |
| `SUPERADMIN_MOBILE` | your mobile number | who the first super admin is |
| `SUPERADMIN_NAME` | your name | shown in the app |
| `SITE_URL` | `https://task.kriviinfotech.com` | used by the health check |
| `FTP_REMOTE` | leave unset at first | set it only if the site is not at the FTP root |
| `BETA_BANNER` | `true` | set to `false` to remove the beta strip |
| `SESSION_COOKIE_SECURE` | `false` | set to `true` once HTTPS works |

Variables are visible in logs; secrets are masked. That is why the password and
the database URLs are secrets and the rest are variables.

---

## Every deploy after that

Put `[deploy]` anywhere in the commit message. That is the whole trigger:

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
