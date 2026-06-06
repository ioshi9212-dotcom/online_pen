import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "Онлайн-запись",
  description: "Онлайн-запись к мастеру"
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <div className="container">
          <header className="header">
            <a className="logo" href="/">онлайн-запись</a>
            <nav className="nav">
              <a href="/price">Прайс</a>
              <a href="/register">Записаться</a>
              <a href="/login">Войти</a>
            </nav>
          </header>
          {children}
        </div>
      </body>
    </html>
  );
}
