"use client";

import { usePathname } from "next/navigation";

const links = [["/admin", "Главная"], ["/admin/bookings", "Записи"], ["/admin/schedule", "Календарь"], ["/admin/my-clients", "Клиенты"], ["/admin/requests", "Заявки"], ["/admin/waitlist", "Ждуны"], ["/admin/settings", "Настройки"]];

export default function AdminNavigation() {
  const path = usePathname();
  if (path === "/admin/login") return null;
  return <header className="audit-admin-header">
    <a className="audit-admin-brand" href="/admin">Кабинет мастера</a>
    <nav aria-label="Меню мастера" className="audit-admin-navigation">{links.map(([href, title]) => <a key={href} href={href} aria-current={path === href || (href !== "/admin" && path.startsWith(href + "/")) ? "page" : undefined}>{title}</a>)}</nav>
    <a className="button audit-primary-action" href="/admin/manage">+ Записать</a>
  </header>;
}
