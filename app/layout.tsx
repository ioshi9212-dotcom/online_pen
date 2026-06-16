import type { Metadata } from "next";
import type { ReactNode } from "react";
import ConfirmDangerActions from "./ConfirmDangerActions";
import SiteHeader from "./SiteHeader";
import "./globals.css";
import "./plain-interface.css";
import "./button-fix.css";

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
          <SiteHeader />
          {children}
        </div>
      </body>
    </html>
  );
}
