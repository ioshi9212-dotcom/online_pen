import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await prisma.service.createMany({
    skipDuplicates: true,
    data: [
      { title: "Маникюр", durationMinutes: 120, price: 2000, sortOrder: 10 },
      { title: "Коррекция", durationMinutes: 150, price: 2500, sortOrder: 20 },
      { title: "Наращивание", durationMinutes: 180, price: 3200, sortOrder: 30 },
      { title: "Снятие", durationMinutes: 40, price: 500, sortOrder: 40 }
    ]
  });

  await prisma.scheduleRule.createMany({
    skipDuplicates: true,
    data: [
      { weekday: 0, startTime: "09:00", endTime: "20:00", isWorkingDay: true },
      { weekday: 1, startTime: "09:00", endTime: "20:00", isWorkingDay: false },
      { weekday: 2, startTime: "09:00", endTime: "20:00", isWorkingDay: false },
      { weekday: 3, startTime: "09:00", endTime: "20:00", isWorkingDay: true },
      { weekday: 4, startTime: "09:00", endTime: "20:00", isWorkingDay: true },
      { weekday: 5, startTime: "09:00", endTime: "20:00", isWorkingDay: false },
      { weekday: 6, startTime: "09:00", endTime: "20:00", isWorkingDay: false }
    ]
  });

  await prisma.setting.upsert({
    where: { key: "slot_step_minutes" },
    create: { key: "slot_step_minutes", value: "30" },
    update: { value: "30" }
  });

  await prisma.setting.upsert({
    where: { key: "booking_days_ahead" },
    create: { key: "booking_days_ahead", value: "30" },
    update: { value: "30" }
  });
}

main()
  .then(async () => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
