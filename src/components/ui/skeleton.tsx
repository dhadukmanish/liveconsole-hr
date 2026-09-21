import { cn } from "@/lib/utils";

/**
 * The shape of something before its data arrives.
 *
 * Used for the parts of a screen that stream in behind a <Suspense>, so the
 * page does not jump when they land. Not used as a whole-page loading state: a
 * route-level loading.tsx was tried and taken out again, because with one in
 * place a server action's revalidate stopped refreshing the screen — checking
 * in, switching language and approving leave all wrote to the database and left
 * the old page on screen. Navigation feedback comes from NavPending instead.
 *
 * The pulse is opacity only, so it costs nothing to animate, and it stops for
 * anyone who asked the OS to stop animations.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn("animate-pulse rounded-lg bg-hairline/70", className)}
      {...props}
    />
  );
}
