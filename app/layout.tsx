import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import ConfirmDangerActions from "./ConfirmDangerActions";
import SiteHeader from "./SiteHeader";
import "./globals.css";
import "./soft-square-ui.css";

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
