# Hosting research — SmarterASP.NET / site4now, Node.js + Next.js

Status: research only (Step 1 of the brief). No app code written yet.

## 1. Which IIS handler does SmarterASP use?

Both exist on their platform, and their docs have moved:

- **httpPlatformHandler — what their current KB articles use.** Their Quick Start
  and framework articles (Express, NestJS, Next.js, Angular Universal) all say the
  app must listen on `process.env.PORT`, and IIS injects the real port as
  `%HTTP_PLATFORM_PORT%`. This is the pattern to follow.
- **iisnode — still supported, older pattern.** Referenced by their "custom Node
  version" and "ES6 import" articles (`iisnode.yml`, `nodeProcessCommandLine`,
  `<add name="iisnode" path="server.js" ... modules="iisnode" />`).

Recommendation: write `web.config` for **httpPlatformHandler** as primary, and keep
a commented iisnode fallback block in the same file. One panel setting decides
which is active, and we can flip without a rebuild.

### web.config — httpPlatformHandler (primary)

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <handlers>
      <add name="httpPlatformHandler" path="*" verb="*" modules="httpPlatformHandler"
           resourceType="Unspecified" />
    </handlers>
    <httpPlatform processPath="node"
                  arguments="server.js"
                  startupTimeLimit="120"
                  startupRetryCount="3"
                  stdoutLogEnabled="true"
                  stdoutLogFile=".\logs\node">
      <environmentVariables>
        <environmentVariable name="PORT" value="%HTTP_PLATFORM_PORT%" />
        <environmentVariable name="NODE_ENV" value="production" />
      </environmentVariables>
    </httpPlatform>
  </system.webServer>
</configuration>
```

Notes:
- `startupTimeLimit` must be generous: Next boot + Prisma client init is slower
  than a hello-world, and the default 20s can flap on shared hosting.
- `processPath="node"` uses the host's Node. To pin a version, upload `node.exe`
  to `/App_Data` and point `processPath` at it (their custom-version article).

### web.config — iisnode (fallback, keep commented)

```xml
<handlers>
  <add name="iisnode" path="server.js" verb="*" modules="iisnode" />
</handlers>
<rewrite>
  <rules>
    <rule name="nextjs" stopProcessing="true">
      <match url="^(.*)$" />
      <conditions logicalGrouping="MatchAll">
        <add input="{REQUEST_FILENAME}" matchType="IsFile" negate="true" />
        <add input="{REQUEST_FILENAME}" matchType="IsDirectory" negate="true" />
      </conditions>
      <action type="Rewrite" url="server.js" />
    </rule>
  </rules>
</rewrite>
<iisnode node_env="production" nodeProcessCountPerApplication="1" />
```

With iisnode the URL-rewrite rule is required (it maps every non-file request to
`server.js`); with httpPlatformHandler `path="*"` already does that, so no rewrite
is needed. Do NOT ship a rewrite that lets IIS serve `/_next/*` off disk — Next's
own handler must serve those so headers and immutable caching stay correct.

## 2. server.js

Custom server, production mode, port from the environment:

```js
const { createServer } = require('http')
const next = require('next')

const port = parseInt(process.env.PORT, 10) || 3000
const app = next({ dev: false })
const handle = app.getRequestHandler()

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(port)
})
```

`dev: false` (not `NODE_ENV !== 'production'`) so a missing env var on the host
can never boot us into dev mode.

## 3. Build and deploy reality on this host

- The host does **not** run `npm install` or `next build` for us. Confirmed by
  their own articles: they instruct you to run `npm install` **on Windows** and
  upload `node_modules`, and to upload the built output.
- `node_modules` built on Linux is not portable to Windows (native bindings,
  platform-specific binaries), so a Linux-built `node_modules` cannot simply be
  pushed. Either build on Windows, or use Next's **standalone** output
  (`output: 'standalone'`), which emits `.next/standalone` with only the traced
  runtime dependencies — a much smaller, cleaner payload. Standalone still needs
  `.next/static` and `public/` copied in beside it.
- `bcryptjs` (pure JS, per the brief) is deliberately safer here than `bcrypt`
  (native). Keep it that way.
- Plan: a `deploy` branch carrying the built payload, as the brief allows, so the
  host only runs `node server.js`.

## 4. Environment variables / secrets

Their dotenv article confirms a `.env` file next to the app works. Belt and
braces: `web.config` `<environmentVariables>` for `NODE_ENV`/`PORT`, and `.env`
(uploaded, never committed) for `DATABASE_URL` and auth secrets. `.env` must sit
outside the web-servable path or be denied by IIS — an unprotected `.env` under
the site root is readable over HTTP on some configs.

## 5. Database — the connection string I was given

- The database host resolves, but **raw TCP to 5432/6432 is blocked from this
  cloud session** by the egress policy. So I cannot run
  `prisma migrate deploy` or seed against the real DB from here. Migrations will
  have to run from the host or from your Windows machine (documented in
  DEPLOY.md), or via a one-time token-protected admin route.
- **Port 6432 is a PgBouncer pooler**, not plain Postgres. That matters for
  Prisma: the runtime URL needs `?pgbouncer=true&connection_limit=1`, and
  `prisma migrate` cannot run through a transaction-mode pooler — it needs a
  direct connection (usually port 5432) set as Prisma's `directUrl`. Please
  confirm from the panel whether 5432 is open to us too; if not, migrations run
  as plain SQL applied through the panel's query tool.
- Shared hosting will cap connections hard. Prisma + `connection_limit=1` and a
  single Node process (`nodeProcessCountPerApplication="1"`) keeps us inside it.

## 6. Constraints confirmed for this session

| Thing | State |
|---|---|
| `smarterasp.net` | egress-blocked from this session (read via search snippets) |
| `live.kriviinfotech.com`, `task.kriviinfotech.com` | egress-blocked (403 at proxy) |
| DB TCP 5432/6432 | blocked |
| Local Postgres 16 | available — dev/test DB runs here |
| Docker | unavailable |

So: build and test locally against a local Postgres; you (or a deploy step on the
host) handle the real DB and the upload. I cannot verify the live URL myself.

## Sources

- https://www.smarterasp.net/support/kb/a1970/quick-start-node_js.aspx
- https://www.smarterasp.net/support/kb/a2233/how-to-publish-a-next_js-project-to-your-hosting-account.aspx
- https://www.smarterasp.net/support/kb/a2228/how-to-publish-an-expressjs-application-to-your-hosting-account.aspx
- https://www.smarterasp.net/support/kb/a2205/how-to-custom-nodejs-version-with-our-server.aspx
- https://www.smarterasp.net/support/kb/a2234/how-to-use-node-environment-variables-with-a-dotenv-file-in-node_js.aspx
- https://www.smarterasp.net/support/kb/a276/getting-started-with-node_js-hosting-on-smarterasp_net.aspx
- https://gist.github.com/valakhosravi/a861b00f36dda6b0f0185a53631cc22d
- https://github.com/makite/deploy-nextjs-to-iis-web-server
- https://eysermans.com/post/using-http-platform-handler-to-host-a-node-js-application-via-iis/
