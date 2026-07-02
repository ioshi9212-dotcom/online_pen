import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Suspense } from "react";
import ConfirmDangerActions from "./ConfirmDangerActions";
import SiteHeader from "./SiteHeader";
import "./globals.css";
import "./soft-square-ui.css";

export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Онлайн-запись к мастеру",
  applicationName: "Онлайн-запись",
  manifest: "/site.webmanifest",
  themeColor: "#F3A9BE",
  appleWebApp: {
    capable: true,
    title: "Запись",
    statusBarStyle: "default"
  },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-512.png", sizes: "512x512", type: "image/png" }],
    shortcut: [{ url: "/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
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
