/**
 * Writes down what actually threw.
 *
 * A browser shown "Application error: a server-side exception has occurred"
 * with a digest is Next refusing, correctly, to tell the public what broke. The
 * real error goes to the server — and this app had nowhere for it to go that
 * anybody could reach, so a report of that screen came with nothing to act on:
 * the host's log held three clean startup lines and no error at all.
 *
 * `onRequestError` is called for every error thrown while rendering on the
 * server, with the same digest the browser was shown. Printing it to stderr is
 * enough: the host writes the app's output to logs/, which the deploy tooling
 * can already read. So the next time it happens, the digest in the screenshot
 * matches a line here with a stack under it.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string },
  context: { routerKind: string; routePath: string; routeType: string },
) {
  const digest =
    typeof error === "object" && error !== null && "digest" in error
      ? String((error as { digest?: unknown }).digest)
      : "(none)";

  // One line to find it by, then the stack. Never the error's own `cause`
  // chain blindly — a Prisma error can carry the connection string in it.
  console.error(
    `[error] digest=${digest} ${request.method} ${request.path} ` +
      `route=${context.routePath} (${context.routeType}) at ${new Date().toISOString()}`,
  );
  console.error(error instanceof Error ? (error.stack ?? error.message) : String(error));
}
