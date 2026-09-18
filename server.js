/**
 * Custom entry point for IIS (SmarterASP.NET / site4now).
 *
 * IIS starts this file via httpPlatformHandler (or iisnode, see web.config) and
 * hands us a port in process.env.PORT. `dev: false` is hard-coded on purpose:
 * a missing NODE_ENV on the host must never boot the app into dev mode.
 */
const { createServer } = require("http");
const next = require("next");

const port = parseInt(process.env.PORT, 10) || 3000;
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    createServer((req, res) => {
      handle(req, res).catch((err) => {
        console.error("[server] request failed:", err);
        res.statusCode = 500;
        res.end("Internal Server Error");
      });
    }).listen(port, hostname, () => {
      console.log(`[server] listening on ${hostname}:${port}`);
    });
  })
  .catch((err) => {
    console.error("[server] failed to start:", err);
    process.exit(1);
  });
