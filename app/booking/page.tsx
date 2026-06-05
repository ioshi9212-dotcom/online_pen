import { createBooking } from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { formatDateOnly, formatTimeOnly, rub } from "@/lib/format";
import { overlaps, getSettingInt } from "@/lib/schedule";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function BookingPage({ searchParams }: { searchParams: { client?: string; service?: string; busy?: string } }) {
  const token = searchParams.client;
  if (!token) redirect("/login");

  const client = await prisma.client.findUnique({ where: { publicToken: token } });
  if (!client || client.status !== "APPROVED") redirect("/unavailable");

  const services = await prisma.service.findMany({ where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { title: "asc" }] });
  const selectedService = searchParams.service ? services.find((service) => service.id === searchParams.service) : services[0];

  const settings = await prisma.setting.findMany();
  const daysAhead = getSettingInt(settings, "booking_days_ahead", 30);

  const horizon = new Date();
  horizon.setDate(horizon.getDate() + daysAhead + 1);

  const [bookings, blockedSlots, onlineWindows] = await Promise.all([
    prisma.booking.findMany({
      where: { status: { in: ["PENDING", "CONFIRMED"] }, startAt: { lt: horizon } },
      select: { startAt: true, endAt: true }
    }),
    prisma.blockedSlot.findMany({
      where: { startAt: { lt: horizon } },
      select: { startAt: true, endAt: true }
    }),
    prisma.onlineWindow.findMany({
      where: { startAt: { gt: new Date(), lt: horizon } },
      orderBy: { startAt: "asc" }
    })
  ]);

  const slots = selectedService
    ? onlineWindows
        .map((window) => {
          const startAt = window.startAt;
          const endAt = new Date(startAt.getTime() + selectedService.durationMinutes * 60_000);
          return { startAt, endAt };
        })
        .filter((slot) => {
          const booked = bookings.some((booking) => overlaps(slot.startAt, slot.endAt, booking.startAt, booking.endAt));
          const blocked = blockedSlots.some((block) => overlaps(slot.startAt, slot.endAt, block.startAt, block.endAt));
          return !booked && !blocked;
        })
    : [];

  return (
    <section className="grid">
      <div className="card">
        <h1>Выбор времени</h1>
        <p>Привет, {client.firstName}. Выберите услугу и свободное окно. Заявка уйдёт мастеру на подтверждение.</p>
        {searchParams.busy ? <div className="notice">Это время уже заняли. Выберите другое окно.</div> : null}
        <div className="actions">
          {services.map((service) => (
            <a className="button secondary" href={`/booking?client=${token}&service=${service.id}`} key={service.id}>
              {service.title} · {rub(service.price)}
            </a>
          ))}
          <a className="button secondary" href={`/my?client=${token}`}>Мои записи</a>
        </div>
      </div>

      {selectedService ? (
        <div className="card">
          <h2>{selectedService.title}</h2>
          <p>{selectedService.durationMinutes} мин · {rub(selectedService.price)}</p>
          {slots.length ? (
            <div className="slots">
              {slots.slice(0, 80).map((slot) => (
                <form action={createBooking} className="slot" key={slot.startAt.toISOString()}>
                  <input type="hidden" name="clientToken" value={token} />
                  <input type="hidden" name="serviceId" value={selectedService.id} />
                  <input type="hidden" name="startAt" value={slot.startAt.toISOString()} />
                  <strong>{formatDateOnly(slot.startAt)}</strong>
                  <span className="small">{formatTimeOnly(slot.startAt)}–{formatTimeOnly(slot.endAt)}</span>
                  <textarea name="comment" placeholder="Комментарий" />
                  <button type="submit">Запросить</button>
                </form>
              ))}
            </div>
          ) : (
            <div className="notice">Пока свободных мест не отображается. Попробуйте позже или напишите мастеру.</div>
          )}
        </div>
      ) : null}
    </section>
  );
}
