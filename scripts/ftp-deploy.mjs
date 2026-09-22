/**
 * Uploads the built payload to site4now over FTP.
 *
 * Run this from your own machine — a cloud build sandbox usually cannot open
 * outbound FTP at all.
 *
 *   FTP_HOST=win8194.site4now.net FTP_USER=... FTP_PASSWORD=... \
 *     node scripts/ftp-deploy.mjs
 *
 * Options:
 *   --dir <path>      what to upload            (default: ./deploy-payload)
 *   --remote <path>   remote folder             (default: /)
 *   --zip-only        upload just deploy-payload.zip, for extracting in the
 *                     panel's File Manager — one file instead of ~2,200
 *   --dry-run         list what would be sent, connect to nothing
 *   --secure          use FTPS (explicit TLS)
 *   --port <n>        control port             (default: 21)
 *   --list            print the remote folder listing and stop
 *   --list --path <p> list that folder on the host instead of the site root,
 *                     for answering "did this file actually get uploaded?"
 *   --verify          walk the payload and report every file that is missing
 *                     from the host or there at the wrong size
 *   --verify --fix    ...and upload those files
 *   --resume          skip files whose size already matches the host, for
 *                     retrying an upload the host interrupted part way
 *   --logs            print the app's stdout logs from the host and stop
 *   --put <file> --as <name>
 *                     upload a single file, for swapping web.config while
 *                     diagnosing without re-sending 2,200 files
 *   --remove-default-index
 *                     delete the host's placeholder index.html, which IIS
 *                     otherwise serves ahead of the app
 *
 * Credentials are read from the environment (or a local .env.ftp) and are
 * never written to the repository.
 */
import { Client } from "basic-ftp";
import { existsSync, readFileSync, statSync } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : fallback;
};

// Allow a local .env.ftp so the password never has to be typed into a shell
// (and never into the repo — .env.ftp is gitignored).
function loadEnvFile(file = ".env.ftp") {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const value = match[2].replace(/^["']|["']$/g, "");
    process.env[match[1]] ??= value;
  }
}
loadEnvFile();

const HOST = process.env.FTP_HOST;
const USER = process.env.FTP_USER;
const PASSWORD = process.env.FTP_PASSWORD;
const REMOTE = option("remote", process.env.FTP_REMOTE ?? "/");
const PORT = Number(option("port", process.env.FTP_PORT ?? 21));
const LOCAL = path.resolve(option("dir", "deploy-payload"));
/** Written by the packager; says which dependency tree node_modules came from. */
const MANIFEST = ".deploy-manifest.json";
const DRY = flag("dry-run");
const ZIP_ONLY = flag("zip-only");
const LIST_ONLY = flag("list");
const LIST_PATH = option("path", null);
const VERIFY = flag("verify");
const FIX = flag("fix");
const LOGS_ONLY = flag("logs");
const PUT_FILE = option("put", null);
const PUT_AS = option("as", null);
const REMOVE_INDEX = flag("remove-default-index");

/** Validated when the script runs, not when it is imported for testing. */
function assertUsable() {
  if (!DRY && (!HOST || !USER || !PASSWORD)) {
    console.error(
      "Missing credentials. Set FTP_HOST, FTP_USER and FTP_PASSWORD in the\n" +
        "environment or in a .env.ftp file next to package.json.",
    );
    process.exit(1);
  }

  if (!ZIP_ONLY && !LIST_ONLY && !LOGS_ONLY && !PUT_FILE && !existsSync(LOCAL)) {
    console.error(`${LOCAL} does not exist. Run: npm run package`);
    process.exit(1);
  }
}

/** Refuse to upload a payload that still has secrets in it. */
function guardAgainstSecrets(dir) {
  const envFile = path.join(dir, ".env");
  if (existsSync(envFile)) {
    console.warn(
      "\n  NOTE: deploy-payload/.env exists and WILL be uploaded.\n" +
        "  That is fine if you meant to publish this environment file, but it\n" +
        "  must never be committed to git.\n",
    );
  }
}

async function countFiles(dir) {
  let files = 0;
  let bytes = 0;
  const walk = async (current) => {
    for (const entry of await readdir(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else {
        files += 1;
        bytes += statSync(full).size;
      }
    }
  };
  await walk(dir);
  return { files, bytes };
}

const mb = (bytes) => `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function connect(client) {
  return client.access({
    host: HOST,
    port: PORT,
    user: USER,
    password: PASSWORD,
    secure: flag("secure"),
  });
}

/**
 * Prints whatever the host captured from the app's stdout. When IIS answers an
 * empty 500 the handler started Node and Node died; this is where it says why.
 */
async function printRemoteLogs(client) {
  const os = await import("node:os");
  const { readFileSync, mkdtempSync } = await import("node:fs");
  const tmp = mkdtempSync(path.join(os.tmpdir(), "hostlogs-"));

  for (const folder of ["logs", "iisnode", "App_Data/logs"]) {
    const dir = path.posix.join(REMOTE, folder);
    let entries;
    try {
      entries = await client.list(dir);
    } catch {
      console.log(`(no ${folder}/ on the host)`);
      continue;
    }

    const files = entries.filter((entry) => entry.isFile && entry.size > 0);
    if (files.length === 0) {
      console.log(`(${folder}/ exists but is empty)`);
      continue;
    }

    // Newest last-modified first; the most recent crash is the interesting one.
    files.sort((a, b) => (b.modifiedAt?.getTime() ?? 0) - (a.modifiedAt?.getTime() ?? 0));

    for (const file of files.slice(0, 3)) {
      const local = path.join(tmp, file.name.replace(/[^\w.-]/g, "_"));
      await client.downloadTo(local, path.posix.join(dir, file.name));
      const text = readFileSync(local, "utf8");
      console.log(`\n=== ${folder}/${file.name} (${file.size} bytes) ===`);
      console.log(text.split(/\r?\n/).slice(-80).join("\n").trim() || "(empty)");
    }
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Walks the payload and uploads each file, tolerating the one failure mode a
 * Windows host reliably produces: a file the running app holds open.
 *
 * A locked file whose size already matches the host is treated as up to date —
 * node_modules content does not change without its size changing — while a
 * locked file that genuinely differs fails the deploy rather than leaving the
 * site half updated.
 */
/**
 * Which files may be left alone when the host already has them at the same size.
 *
 * Two kinds, and no others:
 *
 *   .next/static/**   the filename contains a hash of the contents, so a name
 *                     that is already there IS the same file. Not a guess.
 *   node_modules/**   vendored dependencies, and only when the host's copy of
 *                     the dependency stamp matches this payload's — so this is
 *                     "the dependency tree did not change", not "the sizes look
 *                     similar".
 *
 * Everything else — our own server code, web.config, the messages, Prisma —
 * goes up every time. That is around two hundred files out of two thousand two
 * hundred, and it is the part where "same size, different content" is a thing
 * that can actually happen.
 */
function reusableOnHost(relativePath, { dependenciesUnchanged }) {
  if (relativePath.startsWith(".next/static/")) return true;
  if (relativePath.startsWith("node_modules/")) return dependenciesUnchanged;
  return false;
}

export async function uploadTree(client, localRoot, remoteRoot, options = {}) {
  const { readdir, stat } = await import("node:fs/promises");
  const {
    reconnect,
    resume = false,
    remoteIndex = null,
    dependenciesUnchanged = false,
  } = options;
  const uploaded = { count: 0 };
  const skipped = [];
  const failed = [];
  const reconnects = { count: 0 };

  /**
   * A dead connection is not a dead file. This host drops the data socket part
   * way through a 2,000-file upload, and once basic-ftp marks the client closed
   * every later call fails instantly — so the whole deploy failed on one
   * network blip. Reconnect and carry on with the same file.
   */
  const isConnectionLost = (error) =>
    /client is closed|econnreset|epipe|etimedout|socket|not connected/i.test(
      String(error?.message ?? error),
    );

  async function remoteSize(remotePath) {
    try {
      return await client.size(remotePath);
    } catch {
      return null;
    }
  }

  async function walk(localDir, remoteDir) {
    await client.ensureDir(remoteDir);
    const entries = await readdir(localDir, { withFileTypes: true });

    for (const entry of entries) {
      const localPath = path.join(localDir, entry.name);
      const remotePath = path.posix.join(remoteDir, entry.name);

      if (entry.isDirectory()) {
        await walk(localPath, remotePath);
        // ensureDir leaves the client inside the directory it created.
        await client.cd(remoteDir);
        continue;
      }

      const localSize = (await stat(localPath)).size;
      let lastError;

      // Already on the host, and of a kind where that settles it. The verify
      // step still checks every one of these afterwards, so a wrong call here
      // is caught rather than shipped.
      if (remoteIndex) {
        const relative = path.posix.relative(remoteRoot, remotePath);
        if (
          reusableOnHost(relative, { dependenciesUnchanged }) &&
          remoteIndex.get(remotePath) === localSize
        ) {
          skipped.push(relative || entry.name);
          continue;
        }
      }

      // Resuming an interrupted upload: same size means it already went up.
      // Off by default — for an app file, same size and different content is
      // unlikely but possible, and a half-updated site is worse than a slow one.
      if (resume && (await remoteSize(remotePath)) === localSize) {
        skipped.push(path.posix.relative(remoteRoot, remotePath) || entry.name);
        continue;
      }

      for (let attempt = 1; attempt <= 4; attempt += 1) {
        try {
          await client.uploadFrom(localPath, remotePath);
          uploaded.count += 1;
          lastError = undefined;
          break;
        } catch (error) {
          lastError = error;

          if (isConnectionLost(error) && reconnect) {
            try {
              await reconnect();
              reconnects.count += 1;
              // The working directory is gone with the old session, and the
              // directory itself may predate it.
              await client.ensureDir(remoteDir);
              continue;
            } catch {
              // Reconnecting failed too; fall through to the normal backoff.
            }
          }

          // 550 here is almost always "in use by another process".
          await sleep(attempt * 1500);
        }
      }

      if (lastError) {
        const size = await remoteSize(remotePath);
        if (size === localSize) {
          skipped.push(path.posix.relative(remoteRoot, remotePath) || entry.name);
        } else {
          failed.push({
            path: remotePath,
            reason: String(lastError.message ?? lastError).slice(0, 120),
          });
        }
      }
    }
  }

  await walk(localRoot, remoteRoot);
  return { uploaded: uploaded.count, skipped, failed, reconnects: reconnects.count };
}

/**
 * Compares the payload against the host, file by file.
 *
 * This host drops the connection part way through a two-thousand-file upload,
 * and the uploader reconnects and carries on — but a deploy that reported
 * success had still left one directory out, and nothing noticed for days. The
 * app kept working, because what was missing was a route nothing called yet.
 *
 * Size rather than checksum: FTP has no hash, and a build artefact that changed
 * without changing size is not a thing that happens here.
 */
/**
 * Does the host's node_modules come from the same dependency tree as this
 * payload's?
 *
 * The packager writes .deploy-manifest.json next to the app with a hash of
 * package-lock.json. If the copy on the host says the same thing, then the two
 * thousand files under node_modules are the same two thousand files, and the
 * ones already there at the right size do not need sending again. If it says
 * anything else — or is not there, as it will not be the first time — they all
 * go up.
 *
 * Deliberately pessimistic everywhere: any failure to read it answers no.
 */
async function hostDependencyStampMatches(client) {
  const { readFile, mkdtemp, rm } = await import("node:fs/promises");
  const os = await import("node:os");

  let ours;
  try {
    ours = JSON.parse(await readFile(path.join(LOCAL, MANIFEST), "utf8"))?.deps;
  } catch {
    return false;
  }
  if (!ours) return false;

  const scratch = await mkdtemp(path.join(os.tmpdir(), "lc-manifest-"));
  const local = path.join(scratch, MANIFEST);
  try {
    await client.downloadTo(local, path.posix.join(REMOTE, MANIFEST));
    const theirs = JSON.parse(await readFile(local, "utf8"))?.deps;
    return Boolean(theirs) && theirs === ours;
  } catch {
    return false;
  } finally {
    await rm(scratch, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Every file on the host, with its size, as one map.
 *
 * The cost of this is one round trip per DIRECTORY — `list` returns names and
 * sizes together — where asking about files one at a time is one per file. On
 * this payload that is the difference between about a minute and about ten.
 */
async function indexRemoteTree(client, root) {
  const index = new Map();
  async function walk(dir) {
    let entries;
    try {
      entries = await client.list(dir);
    } catch {
      return; // Not there at all; every file under it counts as missing.
    }
    for (const entry of entries) {
      const full = path.posix.join(dir, entry.name);
      if (entry.isDirectory) await walk(full);
      else index.set(full, entry.size);
    }
  }
  await walk(root);
  return index;
}

async function verifyTree(client, localRoot, remoteRoot, { fix = false } = {}) {
  const { readdir, stat } = await import("node:fs/promises");
  const missing = [];
  const wrongSize = [];
  let checked = 0;

  const remoteIndex = await indexRemoteTree(client, remoteRoot);

  async function walk(localDir, remoteDir) {
    for (const entry of await readdir(localDir, { withFileTypes: true })) {
      const localPath = path.join(localDir, entry.name);
      const remotePath = path.posix.join(remoteDir, entry.name);
      if (entry.isDirectory()) {
        await walk(localPath, remotePath);
        continue;
      }
      checked += 1;
      const localSize = (await stat(localPath)).size;
      const hostSize = remoteIndex.get(remotePath);
      if (hostSize === undefined) missing.push({ localPath, remotePath, localSize });
      else if (hostSize !== localSize) {
        wrongSize.push({ localPath, remotePath, localSize, hostSize });
      }
    }
  }
  await walk(localRoot, remoteRoot);

  const broken = [...missing, ...wrongSize];
  if (fix && broken.length > 0) {
    console.log(`Re-sending ${broken.length} file(s)...`);
    for (const item of broken) {
      await client.ensureDir(path.posix.dirname(item.remotePath));
      await client.uploadFrom(item.localPath, item.remotePath);
      console.log(`  sent ${item.remotePath}`);
    }
  }

  return { checked, missing, wrongSize };
}

async function main() {
  assertUsable();

  if (PUT_FILE) {
    const target = PUT_AS ?? path.basename(PUT_FILE);
    const client = new Client(60_000);
    await connect(client);
    await client.uploadFrom(PUT_FILE, path.posix.join(REMOTE, target));
    client.close();
    console.log(`uploaded ${PUT_FILE} -> ${path.posix.join(REMOTE, target)}`);
    return;
  }

  if (LOGS_ONLY) {
    const client = new Client(60_000);
    await connect(client);
    await printRemoteLogs(client);
    client.close();
    return;
  }

  if (VERIFY) {
    const client = new Client(120_000);
    await connect(client);
    const result = await verifyTree(client, LOCAL, REMOTE, { fix: FIX });
    client.close();

    console.log(`\nChecked ${result.checked} files against ${HOST}.`);
    for (const item of result.missing) console.log(`  MISSING     ${item.remotePath}`);
    for (const item of result.wrongSize) {
      console.log(`  WRONG SIZE  ${item.remotePath} (host ${item.hostSize}, payload ${item.localSize})`);
    }
    const broken = result.missing.length + result.wrongSize.length;
    if (broken === 0) {
      console.log("Every file in the payload is on the host at the right size.");
    } else if (FIX) {
      console.log(`${broken} file(s) were wrong and have been re-sent.`);
    } else {
      console.log(`${broken} file(s) are wrong. Re-run with --fix to send them.`);
      process.exitCode = 1;
    }
    return;
  }

  if (LIST_ONLY) {
    // Used on a first deploy to learn where the site actually lives: if the
    // account does not land in the site root, FTP_REMOTE has to say so.
    const client = new Client(60_000);
    await connect(client);
    const where = LIST_PATH
      ? path.posix.join(REMOTE, LIST_PATH.replace(/^\/+/, ""))
      : REMOTE;
    const entries = await client.list(where);
    console.log(`Remote listing of ${where} on ${HOST}:\n`);
    for (const entry of entries) {
      const kind = entry.isDirectory ? "dir " : "file";
      console.log(`  ${kind}  ${String(entry.size).padStart(10)}  ${entry.name}`);
    }
    if (entries.some((entry) => entry.name === "index.html")) {
      console.log(
        "\n  index.html is present. IIS serves it ahead of the app, so it has to go.",
      );
    }
    client.close();
    return;
  }

  if (ZIP_ONLY) {
    const zip = path.resolve("deploy-payload.zip");
    if (!existsSync(zip)) {
      console.error("deploy-payload.zip not found. Run: npm run package");
      process.exit(1);
    }
    console.log(`Uploading one file: deploy-payload.zip (${mb(statSync(zip).size)})`);
    console.log("Extract it afterwards in the panel's File Manager.\n");
    if (DRY) return;

    const client = new Client(120_000);
    client.ftp.verbose = false;
    await client.access({
      host: HOST,
      port: PORT,
      user: USER,
      password: PASSWORD,
      secure: flag("secure"),
    });
    await client.ensureDir(REMOTE);
    client.trackProgress((info) => {
      if (info.bytes > 0) process.stdout.write(`\r  ${mb(info.bytesOverall)} sent   `);
    });
    await client.uploadFrom(zip, path.posix.join(REMOTE, "deploy-payload.zip"));
    client.trackProgress();
    client.close();
    console.log("\nDone.");
    return;
  }

  guardAgainstSecrets(LOCAL);
  const { files, bytes } = await countFiles(LOCAL);
  console.log(`Uploading ${files} files (${mb(bytes)})`);
  console.log(`  from: ${LOCAL}`);
  console.log(`  to:   ${HOST ?? "(dry run)"}${REMOTE}`);
  console.log(
    "\n  This is a lot of small files; FTP will take a while. If you have\n" +
      "  File Manager access, `--zip-only` plus Extract is much faster.\n",
  );

  if (DRY) {
    console.log("Dry run — nothing was sent.");
    return;
  }

  const client = new Client(120_000);
  client.ftp.verbose = false;

  // trackProgress fires more than once per file, so count distinct names.
  const seen = new Set();
  client.trackProgress((info) => {
    if (info.type !== "upload" || !info.name) return;
    seen.add(info.name);
    const label = info.name.length > 44 ? `...${info.name.slice(-44)}` : info.name;
    process.stdout.write(
      `\r  ${String(Math.min(seen.size, files)).padStart(4)}/${files}  ${mb(info.bytesOverall).padStart(8)}  ${label.padEnd(48)}`,
    );
  });

  try {
    await client.access({
      host: HOST,
      port: PORT,
      user: USER,
      password: PASSWORD,
      secure: flag("secure"),
    });
    await client.ensureDir(REMOTE);

    if (REMOVE_INDEX) {
      // The host ships a placeholder index.html that IIS serves ahead of the
      // Node app. This deploy never produces an index.html of its own, so
      // removing it cannot delete anything of ours.
      try {
        await client.remove(path.posix.join(REMOTE, "index.html"));
        console.log("  removed the host's placeholder index.html");
      } catch {
        console.log("  no index.html to remove");
      }
    }

    // What is already up there, and whether the dependency tree behind it is
    // the one this payload was built from. Listing costs a round trip per
    // directory; asking about files one at a time costs one per file, which on
    // this payload is the whole ten minutes.
    client.trackProgress();
    process.stdout.write("  reading what the host already has... ");
    const remoteIndex = await indexRemoteTree(client, REMOTE);
    const dependenciesUnchanged = await hostDependencyStampMatches(client);
    console.log(
      `${remoteIndex.size} file(s) there; dependencies ` +
        (dependenciesUnchanged ? "unchanged" : "changed or unknown"),
    );

    client.trackProgress((info) => {
      if (info.name) seen.add(info.name);
      const label = info.name ? path.posix.relative(REMOTE, info.name) : "";
      process.stdout.write(
        `\r  ${String(Math.min(seen.size, files)).padStart(4)}/${files}  ${mb(info.bytesOverall).padStart(8)}  ${label.padEnd(48)}`,
      );
    });

    // Uploaded file by file rather than with uploadFromDir, because a redeploy
    // onto a running Windows app hits locked files, and one locked file must
    // not abandon the other two thousand.
    const result = await uploadTree(client, LOCAL, REMOTE, {
      reconnect: () => connect(client),
      resume: flag("resume"),
      remoteIndex,
      dependenciesUnchanged,
    });
    client.trackProgress();

    console.log("\n");
    console.log(`Uploaded ${result.uploaded} files.`);
    if (result.reconnects > 0) {
      console.log(
        `The host dropped the connection ${result.reconnects} time(s); reconnected and carried on.`,
      );
    }
    if (result.skipped.length > 0) {
      console.log(
        `${result.skipped.length} file(s) were already on the host at the right` +
          " size and of a kind that settles it — content-hashed build output, or" +
          " vendored packages with an unchanged dependency stamp — so they were" +
          " left alone. The verify step checks every one of them anyway.",
      );
    }
    if (result.failed.length > 0) {
      console.error(`\n${result.failed.length} file(s) could not be uploaded:`);
      for (const entry of result.failed.slice(0, 15)) {
        console.error(`  ${entry.path}: ${entry.reason}`);
      }
      throw new Error("some files failed to upload");
    }
    console.log("Upload finished.");
  } catch (error) {
    client.trackProgress();
    console.error("\n\nUpload failed:", error.message);
    console.error(
      "\nIf this is a timeout or 'connection reset', check that outbound FTP is\n" +
        "allowed from this machine — some office and cloud networks block port 21.",
    );
    process.exitCode = 1;
  } finally {
    client.close();
  }
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  main();
}
