import type { ReactNode } from "react";
import { Suspense } from "react";
import AdminMobileNav from "./AdminMobileNav";
import AdminSaveToast from "./AdminSaveToast";
import AdminNavigation from "./AdminNavigation";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <AdminNavigation />
      <div className="admin-route-frame">{children}</div>
      <Suspense fallback={null}>
        <AdminSaveToast />
        <AdminMobileNav />
      </Suspense>
    </>
  );
}
