# Live Console HR — Build brief for Claude Code

Read this fully, then run the steps in order. Ask me only before destructive actions.

## 0. Host pattern
- Host is site4now (SmarterASP.NET) Windows shared hosting with Node.js (iisnode) and PostgreSQL. Another Next.js + PostgreSQL app already runs there at live.kriviinfotech.com, so the pattern works.
- Use the standard SmarterASP Node.js setup: `web.config` with iisnode handler + URL rewrite to `server.js`; a small custom `server.js` that starts Next in production mode (`next({ dev:false })`); `next build` output committed or uploaded so the host only runs `node server.js`; env vars via host panel or `.env` (never committed).
- Before building, read SmarterASP's Node.js/iisnode docs (search the web) and confirm the exact web.config they recommend. Tell me what you found.

## 1. Infrastructure (site4now / SmarterASP Windows shared hosting, Node.js + PostgreSQL)
- GitHub repo: `dhadukmanish/liveconsole-hr` (private), branches `main` (prod) + `develop`.
- Prod: `https://task.kriviinfotech.com` (subdomain already created on the host; currently shows the host's default index.html — remove it on first deploy).
- PostgreSQL: a DB created in the site4now panel; I will give the connection string in this session (never print it, put it in `.env`/host env, never commit it).
- File uploads: store under the app's own writable folder on the host (e.g. `/App_Data/uploads` or whatever the Ops app uses); keep paths in DB.
- Deploy: same method as Ops. If the host's GitHub deploy does not run `next build`, commit the production build artifacts on a `deploy` branch (or as Ops does) so the host only needs `node server.js`.
- No cron on shared hosting: implement reminders/backups as an API route hit by an external free cron (cron-job.org) — Phase 4.
- Dev testing: run locally in the cloud session (`next dev`) and use Vercel preview or the host's second subdomain `task-dev.kriviinfotech.com` only if I create it later. Default: test on `task.kriviinfotech.com` behind a "beta" banner until I say go live.

## 2. Stack
Match the Ops app's Next.js major version and Node version (the host's Node version decides). Otherwise: Next.js (App Router, TypeScript, src/), Tailwind, shadcn/ui, Prisma + PostgreSQL, Auth.js (credentials + OTP), next-intl (en default, hi, gu), PWA (`@ducanh2912/next-pwa`, manifest, icons), zod, bcryptjs. Avoid features that need long-running processes or edge runtime (iisnode limits).

## 3. Theme (brand)
- Primary orange `#F7941D` (buttons, active tab), hover `#C96E0A`
- Accent red `#E8412C` (urgent, reject), yellow `#FBB03B` (pending), green `#1D9E75` (approved/done)
- Text `#2C2C2A`, muted `#6B6A65`, hairline `#ECE7DF`, page `#FFF8F0`, card white
- Dark mode: page `#151412`, card `#2C2B28`, text `#F1EFE8`; orange unchanged
- Font: Mukta (Google Fonts) — supports Devanagari + Gujarati + Latin
- Mobile: bottom tab bar (Home, Task, Attendance, Leave, More); ≥768px: left sidebar
- One big primary button per screen. Min text 14px, tap targets ≥48px. No clutter.

## 4. Roles & permissions (dynamic)
- Roles: SUPERADMIN, ADMIN, EMPLOYEE. `users.manager_id` builds hierarchy.
- Permission = module × action: VIEW, ADD, EDIT, DELETE, APPROVE. Modules: TASK, ATTENDANCE, LEAVE, DOCUMENTS, PHONEBOOK, LICENSES, USERS, SETTINGS.
- `role_permissions` defaults + `user_permissions` overrides. UI hides modules/buttons without permission.
- Data scope is separate from permission: EMPLOYEE sees own; ADMIN sees own team (recursive by manager_id); SUPERADMIN sees all.

## 5. Login (Phase 1)
- Two methods per user, chosen by admin at user creation: `login_method = OTP | PASSWORD`.
- OTP: mobile number → 6-digit OTP (dev: log to console + show in UI banner "DEV OTP"; prod: MSG91 provider stub behind an interface). 10-min expiry, 5 attempts.
- PASSWORD: admin sets initial password; user can change from More → Change password.
- Admin/SuperAdmin can: reset password, block/unblock, deactivate, change login method.
- Session 30 days. Language stored on user profile; default `en`.

## 6. Phase 1 scope (build now, deploy to dev)
Screens (mobile-first, per the design):
1. Login (OTP + password, language switch)
2. Home — greeting, big Check-in placeholder (disabled with "coming in Phase 2"), stats, my tasks placeholder
3. More — profile, My ID card (PDF), Documents, Language, Change password, Logout
4. Users (ADMIN/SUPERADMIN) — list, create (name, mobile, email, role, manager, login method), edit, block/deactivate, reset password
5. Permissions (SUPERADMIN) — grid role × module × action, plus per-user override
6. Documents — upload PDF/image per user, dynamic document types (Aadhaar, PAN, Other…), download; stored in uploads dir, DB row with path
7. ID card — PDF from profile (photo, name, designation, emp code, QR with emp code)
8. Settings (SUPERADMIN) — document types master, leave types master, task types/priorities masters (data only; used in later phases)

Prisma models: User, EmployeeProfile, Role, Permission, RolePermission, UserPermission, Document, DocumentType, OtpCode, Session, AuditLog, and masters (LeaveType, TaskType, TaskPriority, TaskStatus). Seed: 1 SUPERADMIN (mobile from me), roles, default permissions, default masters.

## 7. Definition of done for Phase 1
- `https://task.kriviinfotech.com` opens (HTTPS if the host provides SSL for the subdomain; otherwise tell me how to enable it), installable as PWA on Android.
- Seeded SUPERADMIN can log in (password), create an ADMIN and an EMPLOYEE, set permissions, upload a document, download an ID card, switch language.
- Lighthouse mobile performance ≥ 85.
- Deployment is repeatable with one command or one panel click, documented in `DEPLOY.md`.

## 8. Working style
- Commit small, push to `develop` often; deploy to the host only at milestones and tell me before each deploy.
- After each milestone, give me: what's done, the URL, and one-line test instructions.
- Later phases (don't build yet): Phase 2 Attendance + Leave, Phase 3 Tasks (Kanban), Phase 4 Phone book + Licenses + reminders, Phase 5 WhatsApp.
