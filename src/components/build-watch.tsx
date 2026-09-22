"use client";

import { useEffect } from "react";

/** Stamped into the bundle at build time, so it is what this phone is running. */
const RUNNING = process.env.NEXT_PUBLIC_BUILD_SHA ?? "dev";

/**
 * Notices when the phone is running an older build than the server, and fixes
 * it without being asked.
 *
 * This app is installable, so a phone keeps a service worker and a cache of the
 * build it first saw. Deploying does not reach into that: the host starts
 * serving new code and the phone carries on with the old, which is exactly what
 * "nothing came live" looks like from the outside — a deploy that is provably
 * on the server and invisible on the screen. There is a manual Update control
 * under More for this, but nobody should have to know that.
 *
 * /api/build says what the server has; the constant above says what this bundle
 * is. If they differ, the worker and its caches go and the page reloads once.
 *
 * Once, not once per attempt: the sha it acted on is recorded first, so a
 * server it can never match — mid-deploy, or a build that does not report a
 * stamp — cannot put the phone in a reload loop. If the tab cannot write that
 * record at all, it does nothing rather than risk one.
 */
export function BuildWatch() {
  useEffect(() => {
    if (RUNNING === "dev") return;

    let cancelled = false;

    async function check() {
      let live: string | undefined;
      try {
        const response = await fetch("/api/build", { cache: "no-store" });
        if (!response.ok) return;
        live = (await response.json())?.sha;
      } catch {
        return; // Offline, or the host is between restarts. Try again later.
      }

      if (cancelled || !live || live === RUNNING) return;

      const key = `lc-update:${live}`;
      try {
        if (sessionStorage.getItem(key)) return;
        sessionStorage.setItem(key, "1");
      } catch {
        return;
      }

      try {
        if ("serviceWorker" in navigator) {
          const workers = await navigator.serviceWorker.getRegistrations();
          await Promise.all(workers.map((worker) => worker.unregister()));
        }
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((name) => caches.delete(name)));
        }
      } catch {
        // Private mode refuses both. The reload is still worth doing.
      }

      window.location.reload();
    }

    check();

    // An installed app is opened far more often than it is loaded, so checking
    // only on mount would miss the case this exists for.
    function onVisible() {
      if (document.visibilityState === "visible") void check();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
