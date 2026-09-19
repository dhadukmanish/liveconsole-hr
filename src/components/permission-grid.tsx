"use client";

import { useActionState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { PermissionsState } from "@/app/(app)/permissions/actions";

export type GridCell = { module: string; action: string; allowed: boolean };

const ACTION_KEYS: Record<string, string> = {
  VIEW: "permissions.view",
  ADD: "permissions.add",
  EDIT: "permissions.edit",
  DELETE: "permissions.delete",
  APPROVE: "permissions.approve",
};

/**
 * Both grids are the same information, and both used to be laid out for a
 * desktop that nobody here has. The role grid was a table 34rem wide inside a
 * horizontal scroller, so on a 390px phone the Delete and Approve columns were
 * off the right edge with nothing to say they existed. The per-user grid was
 * forty-five dropdowns stacked into a three-thousand-pixel scroll, in which the
 * two that had actually been changed looked exactly like the forty-three that
 * had not.
 *
 * So: a card per module, and the choice for each action made in one tap on a
 * control that is already on screen. The inputs are still plain checkboxes and
 * radios, hidden behind their own labels — the styling is CSS on :checked, so
 * the form posts the same fields, works without JavaScript, and stays reachable
 * from a keyboard and a screen reader.
 */

/**
 * The pill an input wears. Shared so the checkbox in one grid and the radio in
 * the other cannot drift apart: they are the same control to a thumb.
 *
 * On is a tint of the brand, not a slab of it. Forty solid orange pills on one
 * screen is what the first version looked like, and when everything shouts the
 * two you were looking for are no easier to find than before. The tint is the
 * 15% the --brand-ink colour was mixed for, so the label still clears 4.5:1.
 *
 * The tick is not decoration: colour alone would be the only thing separating
 * on from off, which is exactly the distinction some people cannot see.
 */
const PILL_BASE =
  "flex min-h-12 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-hairline bg-page px-2 text-center text-sm font-semibold text-muted transition-[background-color,border-color,color,transform] duration-150 select-none active:scale-[0.97] peer-checked:[&_svg]:opacity-100 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand";

/**
 * What the chosen pill turns. On the three-way control the tone carries the
 * meaning — allow is the green one, block the red one — so which of the three
 * is set can be read without reading. Each string is written out in full
 * because Tailwind scans source text: a class assembled at runtime is a class
 * that was never generated.
 */
const PILL_TONES = {
  brand: "peer-checked:border-brand peer-checked:bg-brand/15 peer-checked:text-brand-ink",
  success:
    "peer-checked:border-success/50 peer-checked:bg-success/10 peer-checked:text-success-ink",
  danger: "peer-checked:border-danger/50 peer-checked:bg-danger/10 peer-checked:text-danger-ink",
} as const;

const PILL = `${PILL_BASE} ${PILL_TONES.brand}`;

/** The tick inside a pill. Invisible until its input is checked. */
function Tick() {
  return (
    <svg
      viewBox="0 0 16 16"
      className="h-3.5 w-3.5 shrink-0 opacity-0 transition-opacity duration-150"
      aria-hidden
    >
      <path
        d="M3 8.5 6.5 12 13 4.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** Role grid: which actions this role may take, one card per module. */
export function RolePermissionGrid({
  action,
  roleId,
  modules,
  actions,
  allowed,
}: {
  action: (state: PermissionsState, formData: FormData) => Promise<PermissionsState>;
  roleId: string;
  modules: string[];
  actions: string[];
  allowed: Set<string>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<PermissionsState, FormData>(action, {});
  const form = useRef<HTMLFormElement>(null);

  /**
   * Eight modules times five actions is forty taps to give a role everything.
   * This makes it eight. It reads the boxes it is about to change rather than
   * tracking state of its own, so the button says what the next tap will do.
   */
  function toggleModule(moduleName: string) {
    const boxes = Array.from(
      form.current?.querySelectorAll<HTMLInputElement>(
        `input[type="checkbox"][data-module="${moduleName}"]`,
      ) ?? [],
    );
    const turnOn = boxes.some((box) => !box.checked);
    for (const box of boxes) box.checked = turnOn;
  }

  return (
    <form action={formAction} ref={form}>
      <input type="hidden" name="roleId" value={roleId} />

      {state.error ? (
        <Alert tone="danger" className="mb-3 lc-fade">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3 lc-fade">
          {t(state.notice as "permissions.savedRole")}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-3">
        {modules.map((moduleName) => (
          <fieldset key={moduleName} className="rounded-xl border border-hairline p-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <legend className="text-sm font-bold text-ink">
                {t(`modules.${moduleName}` as "modules.TASK")}
              </legend>
              <button
                type="button"
                onClick={() => toggleModule(moduleName)}
                className="-my-2 -mr-2 flex min-h-11 min-w-16 items-center justify-center rounded-lg px-3 text-xs font-semibold text-brand-ink underline underline-offset-4 transition-transform duration-150 active:scale-95"
              >
                {t("permissions.toggleAll")}
              </button>
            </div>

            {/* Two per row on a phone, all five across from 480px up. The
                actions are short words, so they never need to be truncated. */}
            <div className="grid grid-cols-2 gap-2 min-[480px]:grid-cols-5">
              {actions.map((actionName) => {
                const key = `${moduleName}:${actionName}`;
                return (
                  <div key={key} className="flex">
                    <input type="hidden" name="known" value={key} />
                    <label className="flex-1">
                      <input
                        type="checkbox"
                        name="cell"
                        value={key}
                        data-module={moduleName}
                        defaultChecked={allowed.has(key)}
                        aria-label={`${t(`modules.${moduleName}` as "modules.TASK")} ${t(
                          ACTION_KEYS[actionName] as "permissions.view",
                        )}`}
                        className="peer sr-only"
                      />
                      <span className={PILL}>
                        <Tick />
                        {t(ACTION_KEYS[actionName] as "permissions.view")}
                      </span>
                    </label>
                  </div>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {/* Sticky so the phone never has to scroll eight module cards back down
          to save. bottom-20 clears the tab bar; the tinted backdrop keeps the
          cards from showing through the gap around the button. */}
      <div className="sticky bottom-20 z-10 -mx-1 mt-4 rounded-xl bg-card/85 px-1 py-2 backdrop-blur-sm md:bottom-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}

/** Per-user grid: inherit the role, or override it one action at a time. */
export function UserPermissionGrid({
  action,
  userId,
  modules,
  actions,
  roleAllowed,
  overrides,
}: {
  action: (state: PermissionsState, formData: FormData) => Promise<PermissionsState>;
  userId: string;
  modules: string[];
  actions: string[];
  roleAllowed: Set<string>;
  overrides: Map<string, boolean>;
}) {
  const t = useTranslations();
  const [state, formAction, pending] = useActionState<PermissionsState, FormData>(action, {});

  const choices = [
    { value: "inherit", label: t("permissions.useDefault"), tone: "brand" },
    { value: "grant", label: t("permissions.allow"), tone: "success" },
    { value: "revoke", label: t("permissions.block"), tone: "danger" },
  ] as const;

  return (
    <form action={formAction}>
      <input type="hidden" name="userId" value={userId} />

      {state.error ? (
        <Alert tone="danger" className="mb-3 lc-fade">
          {t(state.error)}
        </Alert>
      ) : null}
      {state.notice ? (
        <Alert tone="success" className="mb-3 lc-fade">
          {t("permissions.savedUser", { name: state.noticeName ?? "" })}
        </Alert>
      ) : null}

      <div className="flex flex-col gap-2">
        {modules.map((moduleName) => {
          // Overrides are the exception, so a module is worth opening only when
          // it has one. The count is what makes that visible without opening
          // all eight.
          const changed = actions.filter((actionName) =>
            overrides.has(`${moduleName}:${actionName}`),
          ).length;

          return (
            <details
              key={moduleName}
              open={changed > 0}
              className="group rounded-xl border border-hairline bg-card"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-2 px-3 [&::-webkit-details-marker]:hidden">
                <span className="text-sm font-bold text-ink">
                  {t(`modules.${moduleName}` as "modules.TASK")}
                </span>
                <span className="flex items-center gap-2">
                  {changed > 0 ? (
                    <span className="rounded-full bg-brand/15 px-2 py-0.5 text-xs font-semibold text-brand-ink">
                      {t("permissions.changedCount", { count: changed })}
                    </span>
                  ) : (
                    <span className="text-xs text-muted">{t("permissions.asRole")}</span>
                  )}
                  {/* Rotates instead of swapping glyphs, so the state change is
                      one continuous thing rather than a flicker. */}
                  <svg
                    viewBox="0 0 20 20"
                    className="h-4 w-4 shrink-0 text-muted transition-transform duration-200 group-open:rotate-180"
                    aria-hidden
                  >
                    <path
                      d="M5 7.5 10 12.5 15 7.5"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
              </summary>

              <div className="lc-panel flex flex-col gap-3 border-t border-hairline p-3">
                {actions.map((actionName) => {
                  const key = `${moduleName}:${actionName}`;
                  const override = overrides.get(key);
                  const current =
                    override === undefined ? "inherit" : override ? "grant" : "revoke";
                  const inherited = roleAllowed.has(key)
                    ? t("permissions.granted")
                    : t("permissions.revoked");

                  return (
                    <fieldset key={key}>
                      <legend className="mb-1 text-sm font-semibold text-ink">
                        {t(ACTION_KEYS[actionName] as "permissions.view")}{" "}
                        <span className="font-normal text-muted">
                          · {t("permissions.roleGives", { state: inherited })}
                        </span>
                      </legend>
                      <div className="flex gap-2">
                        {choices.map((choice) => (
                          <label key={choice.value} className="flex-1">
                            <input
                              type="radio"
                              name={`cell:${key}`}
                              value={choice.value}
                              defaultChecked={current === choice.value}
                              className="peer sr-only"
                            />
                            <span
                              className={`${PILL_BASE} ${PILL_TONES[choice.tone]} px-1 text-[0.8125rem]`}
                            >
                              <Tick />
                              {choice.label}
                            </span>
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>

      <div className="sticky bottom-20 z-10 -mx-1 mt-4 rounded-xl bg-card/85 px-1 py-2 backdrop-blur-sm md:bottom-2">
        <Button type="submit" size="lg" disabled={pending}>
          {pending ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
