import ManualBookingForm from "@/app/admin/manage/ManualBookingForm";
import { isAdmin } from "@/lib/admin";
import { formatDateTime } from "@/lib/format";
import { prisma } from "@/lib/prisma";
import { bookingStatusLabel, statusClass } from "@/lib/statusLabels";
import { businessDateKey, formatInBusinessTime } from "@/lib/timezone";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function one(searchParams: SearchParams | undefined, key: string) {
  const value = searchParams?.[key];
  return Array.isArray(value) ? value[0] : value;
}

function toTimeInputValue(date: Date) {
  return formatInBusinessTime(date, { hour: "2-digit", minute: "2-digit" });
}

export default async function EditBookingPage({ params: paramsPromise, searchParams: searchParamsPromise }: { params: Promise<{ id: string }>; searchParams?: Promise<SearchParams> }) {
  const params = await paramsPromise;
  const searchParams = (await searchParamsPromise) || {};

  if (!(await isAdmin())) redirect("/admin/login");

  const [booking, clients, services] = await Promise.all([
    prisma.booking.findUnique({ where: { id: params.id }, include: { client: true, service: true } }),
    prisma.client.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
    prisma.service.findMany({ orderBy: [{ sortOrder: "asc" }, { title: "asc" }] })
  ]);

  if (!booking) redirect("/admin/bookings");

  const error = one(searchParams, "error");
  const saved = one(searchParams, "saved");
  const durationMinutes = Math.max(15, Math.round((booking.endAt.getTime() - booking.startAt.getTime()) / 60_000) || booking.service.durationMinutes || 150);
  const bookingDateKey = businessDateKey(booking.startAt);

  return (
    <div className="grid">
      <section className="card">
        <div className="actions" style={{ justifyContent: "space-between" }}>
          <div>
            <p className="eyebrow">Редактирование записи</p>
            <h1>{booking.client.lastName} {booking.client.firstName}</h1>
            <p>{formatDateTime(booking.startAt)} · {booking.service.title} · <span className={`status ${statusClass(booking.status)}`}>{bookingStatusLabel(booking.status)}</span></p>
          </div>
          <div className="actions">
            <a className="button secondary" href="/admin">Главная</a>
            <a className="button secondary" href="/admin/bookings">Все записи</a>
            <a className="button secondary" href={`/admin/my-clients/${booking.clientId}`}>Профиль клиента</a>
          </div>
        </div>
      </section>

      {saved ? <div className="notice ok-notice floating-toast">Запись сохранена.</div> : null}
      {error ? <div className="notice danger-notice floating-toast">Запись не сохранена: {error}</div> : null}

      <section className="card">
        <div className="section-head">
          <div>
            <h2>Перенести / изменить запись</h2>
            <p>Меняй дату, время, услугу, клиента, статус и комментарии. Если новое время конфликтует с другой активной записью или закрытым окном — система не даст сохранить.</p>
          </div>
        </div>

        <ManualBookingForm
          clients={clients.map((client) => ({ id: client.id, name: `${client.lastName} ${client.firstName}`, phone: client.phone }))}
          services={services.map((service) => ({ id: service.id, title: `${service.title}${service.isActive ? "" : " · выключена"}`, durationMinutes: service.durationMinutes, price: service.price }))}
          initialClientId={booking.clientId}
          initialStart={`${bookingDateKey}T${toTimeInputValue(booking.startAt)}`}
          booking={{ id: booking.id, serviceId: booking.serviceId, durationMinutes, status: booking.status, finalPrice: booking.finalPrice, clientComment: booking.clientComment, adminComment: booking.adminComment }}
        />
      </section>
    </div>
  );
}
