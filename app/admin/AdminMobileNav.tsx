"use client";

import { usePathname, useSearchParams } from "next/navigation";

const items = [
  { label: "Главная", href: "/admin", icon: "⌂", key: "home" },
  { label: "Календарь", href: "/admin/schedule?view=calendar", icon: "□", key: "calendar" },
  { label: "Настройки", href: "/admin/settings", icon: "⚙", key: "settings" },
  { label: "База клиентов", href: "/admin/my-clients", icon: "◇", key: "clients" }
];

function activeKey(pathname: string, view: string | null) {
  if (pathname === "/admin") return "home";
  if (pathname.startsWith("/admin/my-clients") || pathname.startsWith("/admin/clients")) return "clients";
  if (pathname.startsWith("/admin/settings") || pathname.startsWith("/admin/profile") || pathname.startsWith("/admin/services")) return "settings";
  if (pathname.startsWith("/admin/schedule")) return view === "mode" ? "settings" : "calendar";
  if (pathname.startsWith("/admin/manage") || pathname.startsWith("/admin/bookings")) return "calendar";
  return "home";
}

export default function AdminMobileNav() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (pathname === "/admin/login" || pathname.startsWith("/admin/logout")) return null;

  const current = activeKey(pathname, searchParams.get("view"));

  return (
    <nav className="master-bottom-nav admin-global-bottom-nav" aria-label="Нижнее меню мастера">
      {items.map((item) => (
        <a key={item.key} className={current === item.key ? "active" : ""} href={item.href}>
          <span>{item.icon}</span>
          <b>{item.label}</b>
        </a>
      ))}
    </nav>
  );
}
