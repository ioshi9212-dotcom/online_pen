import { isAdmin } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { closeWaitlistEntry } from "@/app/admin/actions";
import { formatDateTime } from "@/lib/format";
import { redirect } from "next/navigation";
import SubmitButton from "@/app/SubmitButton";

export const dynamic = "force-dynamic";
export default async function WaitlistPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  if (!(await isAdmin())) redirect("/admin/login");
  const query = await searchParams;
  const total = await prisma.waitlistEntry.count({ where: { status: "ACTIVE" } });
  const pages = Math.max(1, Math.ceil(total / 30));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.page)) || 1));
  const entries = await prisma.waitlistEntry.findMany({ where: { status: "ACTIVE" }, include: { client: true }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], skip: (page - 1) * 30, take: 30 });
  return <section className="card"><h1>Лист ожидания</h1><p>Всего: {total}. Сначала показаны те, кто ждёт дольше.</p>
    {!entries.length ? <p className="notice">Лист ожидания пуст.</p> : null}
    <div className="grid">{entries.map((entry) => <article key={entry.id} className="mini-card grid"><a href={`/admin/my-clients/${entry.clientId}`}>{entry.client.lastName} {entry.client.firstName}</a><span>{entry.client.phone}</span><p>{entry.mode === "DATES" ? "Пожелания по датам: " + entry.desiredDates.replace(/[\[\]"]/g, "").replace(/,/g, ", ") : "Ближайшее свободное время"}</p>{entry.note ? <p>{entry.note}</p> : null}<small>Добавлено: {formatDateTime(entry.createdAt)}</small><div className="actions"><a className="button" href={`/admin/manage?clientId=${entry.clientId}`}>Записать</a><form action={closeWaitlistEntry} data-confirm="Закрыть пожелание в листе ожидания?"><input type="hidden" name="id" value={entry.id} /><input type="hidden" name="redirectTo" value={`/admin/waitlist?page=${page}`} /><SubmitButton className="secondary">Убрать из ожидания</SubmitButton></form></div></article>)}</div>
    <nav className="audit-pagination" aria-label="Страницы ожидания">{page > 1 ? <a href={`/admin/waitlist?page=${page-1}`}>← Назад</a> : <span />}<span>{page} из {pages}</span>{page < pages ? <a href={`/admin/waitlist?page=${page+1}`}>Далее →</a> : <span />}</nav>
  </section>;
}
