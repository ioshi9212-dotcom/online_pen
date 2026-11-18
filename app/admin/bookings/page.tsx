import { setBookingStatus } from "@/app/admin/actions";
import { isAdmin } from "@/lib/admin";
import { formatDateTime, rub } from "@/lib/format";
import { BOOKING_STATUS_OPTIONS, bookingStatusLabel, statusClass } from "@/lib/statusLabels";
import { prisma } from "@/lib/prisma";
import { BookingStatus, Prisma } from "@prisma/client";
import { businessDateFromKey, addBusinessDays } from "@/lib/timezone";
import { validDateKey } from "@/lib/validation";
import { redirect } from "next/navigation";
import SubmitButton from "@/app/SubmitButton";

export const dynamic = "force-dynamic";
type Search = Record<string, string | string[] | undefined>;
const value = (query: Search, key: string) => { const item = query[key]; return Array.isArray(item) ? item[0] || "" : item || ""; };
const PAGE_SIZE = 30;

export default async function AdminBookingsPage({ searchParams }: { searchParams: Promise<Search> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const query = await searchParams;
  const view = ["history", "all"].includes(value(query, "view")) ? value(query, "view") : "upcoming";
  const status = value(query, "status");
  const q = value(query, "q").trim().slice(0, 100);
  const from = value(query, "from"); const to = value(query, "to");
  const now = new Date();
  const conditions: Prisma.BookingWhereInput[] = [];
  if (view === "upcoming") conditions.push({ endAt: { gt: now }, status: { in: ["PENDING", "CONFIRMED"] } });
  if (view === "history") conditions.push({ OR: [{ endAt: { lte: now } }, { status: { notIn: ["PENDING", "CONFIRMED"] } }] });
  if (Object.values(BookingStatus).includes(status as BookingStatus)) conditions.push({ status: status as BookingStatus });
  if (q) conditions.push({ client: { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }] } });
  if (validDateKey(from)) conditions.push({ startAt: { gte: businessDateFromKey(from) } });
  if (validDateKey(to)) conditions.push({ startAt: { lt: businessDateFromKey(addBusinessDays(to, 1)) } });
  const where: Prisma.BookingWhereInput = { AND: conditions };
  const total = await prisma.booking.count({ where });
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(value(query, "page"))) || 1));
  const bookings = await prisma.booking.findMany({ where, include: { client: true, service: true }, orderBy: [{ startAt: view === "history" ? "desc" : "asc" }, { id: "asc" }], skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE });
  const url = (nextPage: number) => `/admin/bookings?${new URLSearchParams({ view, q, status, from, to, page: String(nextPage) })}`;
  function StatusForm({ id, next, title, danger = false }: { id: string; next: string; title: string; danger?: boolean }) {
    return <form action={setBookingStatus} data-confirm={danger ? `${title}?` : undefined}><input type="hidden" name="id" value={id} /><input type="hidden" name="status" value={next} /><input type="hidden" name="redirectTo" value={url(page)} /><SubmitButton className={danger ? "danger" : "secondary"}>{title}</SubmitButton></form>;
  }
  return <section className="card">
    <h1>Записи</h1><p>Будущие приёмы и история. Найдено: {total}.</p>
    <form action="/admin/bookings" className="audit-filters">
      <label>Раздел<select name="view" defaultValue={view}><option value="upcoming">Предстоящие</option><option value="history">История</option><option value="all">Все записи</option></select></label>
      <label>Клиент<input name="q" defaultValue={q} placeholder="Имя или телефон" /></label>
      <label>Статус<select name="status" defaultValue={status}><option value="">Любой</option>{BOOKING_STATUS_OPTIONS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <label>С даты<input name="from" type="date" defaultValue={from} /></label><label>По дату<input name="to" type="date" defaultValue={to} /></label><button type="submit">Показать</button>
    </form>
    {value(query, "error") ? <p className="notice danger-notice" role="alert">{value(query, "error")}</p> : null}
    {!bookings.length ? <p className="notice">По выбранным условиям записей нет.</p> : null}
    <div className="grid">{bookings.map((booking) => <article className="mini-card grid" key={booking.id}>
      <div><b>{formatDateTime(booking.startAt)}</b> · <a href={`/admin/my-clients/${booking.clientId}`}>{booking.client.lastName} {booking.client.firstName}</a></div>
      <div>{booking.service.title} · {rub(booking.finalPrice ?? booking.service.price)} · <span className={`status ${statusClass(booking.status)}`}>{bookingStatusLabel(booking.status)}</span></div>
      {booking.clientComment ? <p>{booking.clientComment}</p> : null}
      <div className="actions"><a className="button secondary" href={`/admin/bookings/${booking.id}/edit`}>Изменить</a>
        {booking.status === "PENDING" ? <><StatusForm id={booking.id} next="CONFIRMED" title="Подтвердить" /><StatusForm id={booking.id} next="REJECTED" title="Отклонить" danger /></> : null}
        {["PENDING", "CONFIRMED"].includes(booking.status) ? <>{booking.startAt > now ? <StatusForm id={booking.id} next="CANCELLED_BY_ADMIN" title="Отменить запись" danger /> : <><StatusForm id={booking.id} next="COMPLETED" title="Пришла" /><StatusForm id={booking.id} next="NO_SHOW" title="Не пришла" /></>}</> : null}
      </div>
    </article>)}</div>
    <nav className="audit-pagination" aria-label="Страницы записей">{page > 1 ? <a href={url(page - 1)}>← Назад</a> : <span />}<span>{page} из {pages}</span>{page < pages ? <a href={url(page + 1)}>Далее →</a> : <span />}</nav>
  </section>;
}
