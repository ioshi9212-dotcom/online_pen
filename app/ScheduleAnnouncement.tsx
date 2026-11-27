import { prisma } from "@/lib/prisma";
import { readScheduleAnnouncement, SCHEDULE_ANNOUNCEMENT_KEY } from "@/lib/scheduleAnnouncement";

export default async function ScheduleAnnouncement() {
  const row = await prisma.setting.findUnique({ where: { key: SCHEDULE_ANNOUNCEMENT_KEY } });
  const announcement = readScheduleAnnouncement(row?.value);
  if (!announcement) return null;
  return (
    <aside className="notice schedule-announcement" aria-label="Новость о расписании">
      <strong>{announcement.title}</strong>
      <p>{announcement.body}</p>
      <a href="/my#windows">Открыть расписание →</a>
    </aside>
  );
}
