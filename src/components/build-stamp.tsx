"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

/**
 * Which build this phone is running, and a way to make it the newest one.
 *
 * This exists because "we deployed it" and "your phone is looking at it" turned
 * out to be different things, and there was no way to tell them apart from the
 * screen. The stamp is inlined at build time, so what it says is what the
 * payload on the device actually is — not what the server would like it to be.
 */
export function BuildStamp({ label }: { label: string }) {
  const t = useTranslations();
  const [busy, setBusy] = useState(false);

  /**
   * Throws away the service worker and everything it cached, then reloads. The
   * worker is configured not to cache pages, so this should never be needed —
   * but "should never be needed" is not something to ask somebody to take on
   * trust when their screen is showing last week's app.
   */
  async function update() {
    setBusy(true);
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
      // Private mode and locked-down browsers refuse both of these. The reload
      // below is still worth doing, and is what most stale pages needed anyway.
    }
    window.location.reload();
  }

  return (
    <div className="mt-6 mb-2 flex items-center justify-between gap-3">
      {/* Selectable: the first thing anyone will do with this is read it out. */}
      <p className="font-mono text-xs text-muted select-text">{label}</p>
      <button
        type="button"
        onClick={update}
        disabled={busy}
        className="-my-1 flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold text-brand-ink underline underline-offset-4 transition-transform duration-150 active:scale-95 disabled:opacity-50"
      >
        {busy ? t("common.loading") : t("more.update")}
      </button>
    </div>
  );
}
