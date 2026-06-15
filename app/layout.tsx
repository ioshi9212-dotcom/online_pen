import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Онлайн-запись к мастеру маникюра"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="site-frame">
          <div className="container">
            <header className="header">
              <a className="logo" href="/">Онлайн-запись</a>
              <nav className="nav" aria-label="Основное меню">
                <a href="/price">Прайс</a>
                <a href="/#how-it-works">Как это работает</a>
                <a href="/login">Вход</a>
                <a href="/register" className="nav-cta">Записаться</a>
              </nav>
            </header>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
