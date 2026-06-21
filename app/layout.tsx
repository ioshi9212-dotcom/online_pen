import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import ConfirmDangerActions from "./ConfirmDangerActions";
import SiteHeader from "./SiteHeader";
import "./globals.css";
import "./plain-interface.css";
import "./button-fix.css";
import "./inline-booking.css";
import "./header-menu-fix.css";
import "./admin-home-clean.css";
import "./price-service-polish.css";
import "./public-cleanup.css";
import "./client-collapse.css";
import "./calendar-dot-force.css";
import "./admin-schedule-mobile.css";
import "./beauty-theme.css";
import "./beauty-layout-fix.css";
import "./client-booking-flow-fix.css";
import "./client-ui-mobile-fix.css";

export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Онлайн-запись к мастеру"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <ConfirmDangerActions />
        <div className="app-shell">
          <Suspense fallback={null}>
            <SiteHeader />
          </Suspense>
          {children}
        </div>
      </body>
    </html>
  );
}
