import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardMuted, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/page";
import { CheckInCard } from "@/components/check-in-card";
import { todayAttendance } from "@/app/(app)/attendance/actions";
import { myOpenTasks } from "@/app/(app)/tasks/actions";
import { TaskCard } from "@/components/task-card";
import { formatIstTime, minutesToHours } from "@/lib/workday";
import { requireUser } from "@/lib/auth/guard";
import { can } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { visibleUserIds } from "@/lib/scope";
import { myHoursTrend, pendingForMe, teamToday } from "@/lib/dashboard";
import { hoursChart, teamTodayChart } from "@/lib/chart-model";
import { ReportChart } from "@/components/report-chart";

function greetingKey(hour: number) {
  if (hour < 12) return "home.greetingMorning";
  if (hour < 17) return "home.greetingAfternoon";
  return "home.greetingEvening";
}

export default async function HomePage() {
  const user = await requireUser();
  const t = await getTranslations();

  const scope = await visibleUserIds(user);
  const attendanceToday = can(user, "ATTENDANCE", "ADD") ? await todayAttendance(user.id) : null;
  const openTasks = can(user, "TASK", "VIEW") ? await myOpenTasks(user.id) : [];
  const [peopleCount, myDocuments, hours, today, pending] = await Promise.all([
    prisma.user.count({
      where: scope === "ALL" ? {} : { id: { in: scope } },
    }),
    prisma.document.count({ where: { userId: user.id } }),
    can(user, "ATTENDANCE", "VIEW") ? myHoursTrend(user.id) : null,
    teamToday(user),
    pendingForMe(user),
  ]);

  const teamCount = scope === "ALL" ? peopleCount : Math.max(0, scope.length - 1);
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
      <Card className="mb-4">
        {can(user, "ATTENDANCE", "ADD") ? (
          <CheckInCard
            checkedInAt={attendanceToday?.checkInAt ? formatIstTime(attendanceToday.checkInAt) : null}
            checkedOutAt={attendanceToday?.checkOutAt ? formatIstTime(attendanceToday.checkOutAt) : null}
            workedLabel={
              attendanceToday?.workedMinutes ? minutesToHours(attendanceToday.workedMinutes) : null
            }
          />
        ) : (
          <>
            <Button size="lg" disabled aria-describedby="checkin-note">
              {t("home.checkIn")}
            </Button>
            <CardMuted id="checkin-note" className="mt-2 text-center">
              {t("attendance.viewOnly")}
            </CardMuted>
          </>
        )}
      </Card>

      <section className="mb-4">
        <h2 className="mb-2 text-sm font-bold text-muted uppercase">{t("home.stats")}</h2>
        <div className="grid grid-cols-2 gap-3">
          {can(user, "USERS", "VIEW") ? (
            <Card>
              <p className="text-2xl font-bold text-ink">{peopleCount}</p>
              <CardMuted>{t("home.statUsers")}</CardMuted>
            </Card>
          ) : null}
          <Card>
            <p className="text-2xl font-bold text-ink">{myDocuments}</p>
            <CardMuted>{t("home.statDocuments")}</CardMuted>
          </Card>
          {user.roleCode !== "EMPLOYEE" ? (
            <Card>
              <p className="text-2xl font-bold text-ink">{teamCount}</p>
              <CardMuted>{t("home.statTeam")}</CardMuted>
            </Card>
          ) : null}
          <Link href="/leave" className="block">
            <Card className="h-full transition-[border-color,transform] duration-150 hover:border-brand active:scale-[0.99]">
              <p className={`text-2xl font-bold ${pending > 0 ? "text-brand-ink" : "text-ink"}`}>
                {pending}
              </p>
              <CardMuted>{t("home.statPending")}</CardMuted>
            </Card>
          </Link>
        </div>
      </section>

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

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-bold text-muted uppercase">{t("home.myTasks")}</h2>
          <Link
            href="/tasks"
            className="-my-1 flex min-h-11 items-center rounded-lg px-2 text-sm font-semibold text-brand-ink underline underline-offset-4 transition-transform duration-150 active:scale-95"
          >
            {t("tasks.all")}
          </Link>
        </div>
        {openTasks.length === 0 ? (
          <EmptyState>{t("tasks.noneAssigned")}</EmptyState>
        ) : (
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
        )}
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
                <CardMuted className="mt-1">{peopleCount}</CardMuted>
              </Card>
            </Link>
          ) : null}
        </div>
      </section>
    </>
  );
}
