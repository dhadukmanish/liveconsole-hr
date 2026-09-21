import { Suspense } from "react";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckInCard } from "@/components/check-in-card";
import { todayAttendance } from "@/app/(app)/attendance/actions";
import { myOpenTasks } from "@/app/(app)/tasks/actions";
import { TaskCard } from "@/components/task-card";
import { formatIstTime, minutesToHours } from "@/lib/workday";
import { requireUser } from "@/lib/auth/guard";
import { can, type CurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { visibleUserIds } from "@/lib/scope";
import { myHoursTrend, peopleCounts, pendingForMe, teamToday } from "@/lib/dashboard";
import { hoursChart, teamTodayChart } from "@/lib/chart-model";
import { ReportChart } from "@/components/report-chart";

function greetingKey(hour: number) {
  if (hour < 12) return "home.greetingMorning";
  if (hour < 17) return "home.greetingAfternoon";
  return "home.greetingEvening";
}

/**
 * The screen is built from four sections that each fetch their own data and
 * stream in as they resolve, rather than one render that waits for all twelve
 * queries before sending a byte. The greeting and the headings need nothing but
 * the session, so they are on screen while the rest is still being asked for —
 * which on a database that lives on another machine is the difference between
 * a screen that appears and a tap that seems not to have registered.
 */
export default async function HomePage() {
  const user = await requireUser();
  const t = await getTranslations();
  const firstName = user.name.split(/\s+/)[0];

  return (
    <>
      <header className="mb-4">
        <h1 className="text-xl font-bold text-ink">
          {t(greetingKey(new Date().getHours()) as "home.greetingMorning", { name: firstName })}
        </h1>
        <p className="mt-0.5 text-sm text-muted">
          {t(`roles.${user.roleCode}` as "roles.ADMIN")}
          {user.profile?.employeeCode ? ` · ${user.profile.employeeCode}` : ""}
        </p>
      </header>

      {/* The one big primary action on this screen. */}
      <Suspense fallback={<Skeleton className="mb-4 h-32 rounded-card" />}>
        <CheckIn user={user} />
      </Suspense>

      <section className="mb-4">
        <h2 className="mb-2 lc-section-label">{t("home.stats")}</h2>
        <Suspense fallback={<StatsSkeleton />}>
          <Stats user={user} />
        </Suspense>
      </section>

      <Suspense fallback={null}>
        <Charts user={user} />
      </Suspense>

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="lc-section-label">{t("home.myTasks")}</h2>
          <Link
            href="/tasks"
            className="-my-1 flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-brand-ink underline underline-offset-4 transition-transform duration-150 active:scale-95"
          >
            {t("tasks.all")}
          </Link>
        </div>
        <Suspense fallback={<Skeleton className="h-20 rounded-xl" />}>
          <MyTasks user={user} />
        </Suspense>
      </section>

      <section className="mt-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <Link href="/more" className="block">
            <Card className="h-full transition-[border-color,transform] duration-150 hover:border-brand active:scale-[0.99]">
              <CardTitle>{t("more.profile")}</CardTitle>
              <CardMuted className="mt-1">{t("more.idCard")} · {t("more.documents")}</CardMuted>
            </Card>
          </Link>
          {can(user, "USERS", "VIEW") ? (
            <Link href="/users" className="block">
              <Card className="h-full transition-[border-color,transform] duration-150 hover:border-brand active:scale-[0.99]">
                <CardTitle>{t("nav.users")}</CardTitle>
                <Suspense fallback={<Skeleton className="mt-1 h-4 w-8" />}>
                  <PeopleCount user={user} />
                </Suspense>
              </Card>
            </Link>
          ) : null}
        </div>
      </section>
    </>
  );
}

async function CheckIn({ user }: { user: CurrentUser }) {
  const t = await getTranslations();
  if (!can(user, "ATTENDANCE", "ADD")) {
    return (
      <Card className="mb-4">
        <Button size="lg" disabled aria-describedby="checkin-note">
          {t("home.checkIn")}
        </Button>
        <CardMuted id="checkin-note" className="mt-2 text-center">
          {t("attendance.viewOnly")}
        </CardMuted>
      </Card>
    );
  }

  const attendance = await todayAttendance(user.id);
  return (
    <Card className="mb-4">
      <CheckInCard
        checkedInAt={attendance?.checkInAt ? formatIstTime(attendance.checkInAt) : null}
        checkedOutAt={attendance?.checkOutAt ? formatIstTime(attendance.checkOutAt) : null}
        workedLabel={attendance?.workedMinutes ? minutesToHours(attendance.workedMinutes) : null}
      />
    </Card>
  );
}

function StatsSkeleton() {
  return (
    <div className="grid grid-cols-2 gap-3">
      {[0, 1, 2, 3].map((index) => (
        <Skeleton key={index} className="h-20 rounded-card" />
      ))}
    </div>
  );
}

async function Stats({ user }: { user: CurrentUser }) {
  const t = await getTranslations();
  const [scope, counts, myDocuments, pending] = await Promise.all([
    visibleUserIds(user),
    can(user, "USERS", "VIEW") ? peopleCounts(user) : Promise.resolve(null),
    prisma.document.count({ where: { userId: user.id } }),
    pendingForMe(user),
  ]);

  const teamCount = scope === "ALL" ? (counts?.total ?? 0) : Math.max(0, scope.length - 1);

  return (
    <div className="grid grid-cols-2 gap-3">
      {counts ? (
        <Card>
          <p className="lc-numeric text-2xl font-bold text-ink">{counts.total}</p>
          <CardMuted>{t("home.statUsers")}</CardMuted>
        </Card>
      ) : null}
      <Card>
        <p className="lc-numeric text-2xl font-bold text-ink">{myDocuments}</p>
        <CardMuted>{t("home.statDocuments")}</CardMuted>
      </Card>
      {user.roleCode !== "EMPLOYEE" ? (
        <Card>
          <p className="lc-numeric text-2xl font-bold text-ink">{teamCount}</p>
          <CardMuted>{t("home.statTeam")}</CardMuted>
        </Card>
      ) : null}
      <Link href="/leave" className="block">
        <Card className="h-full transition-[border-color,transform] duration-150 hover:border-brand active:scale-[0.99]">
          <p className={`lc-numeric text-2xl font-bold ${pending > 0 ? "text-brand-ink" : "text-ink"}`}>
            {pending}
          </p>
          <CardMuted>{t("home.statPending")}</CardMuted>
        </Card>
      </Link>
    </div>
  );
}

async function Charts({ user }: { user: CurrentUser }) {
  const t = await getTranslations();
  const [today, hours] = await Promise.all([
    teamToday(user),
    can(user, "ATTENDANCE", "VIEW") ? myHoursTrend(user.id) : Promise.resolve(null),
  ]);

  return (
    <>
      {today ? (
        <ReportChart
          model={teamTodayChart(today, {
            present: t("home.present"),
            onLeave: t("home.onLeave"),
            notIn: t("home.notIn"),
            people: t("home.statUsers"),
          })}
          title={t("home.teamToday")}
        />
      ) : null}

      {hours && hours.total > 0 ? (
        <ReportChart
          model={hoursChart(hours.days, t("home.hours"))}
          title={`${t("home.hours")} · ${t("home.last14")}`}
        />
      ) : null}
    </>
  );
}

async function MyTasks({ user }: { user: CurrentUser }) {
  const t = await getTranslations();
  const openTasks = can(user, "TASK", "VIEW") ? await myOpenTasks(user.id) : [];

  if (openTasks.length === 0) return <EmptyState>{t("tasks.noneAssigned")}</EmptyState>;

  return (
    <div className="flex flex-col gap-2">
      {openTasks.map((task) => (
        <TaskCard
          key={task.id}
          task={{
            id: task.id,
            title: task.title,
            priorityName: task.taskPriority.name,
            priorityColour: task.taskPriority.colour,
            assigneeName: null,
            dueDate: task.dueDate,
            isTerminal: task.taskStatus.isTerminal,
          }}
        />
      ))}
    </div>
  );
}

async function PeopleCount({ user }: { user: CurrentUser }) {
  const counts = await peopleCounts(user);
  return <CardMuted className="mt-1">{counts.total}</CardMuted>;
}
