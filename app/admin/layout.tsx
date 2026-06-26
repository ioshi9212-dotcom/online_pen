import type { ReactNode } from "react";
import { Suspense } from "react";
import AdminMobileNav from "./AdminMobileNav";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <div className="admin-route-frame">{children}</div>
      <Suspense fallback={null}>
        <AdminMobileNav />
      </Suspense>
    </>
  );
}
