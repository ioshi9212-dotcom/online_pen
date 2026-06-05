import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: process.env.NEXT_PUBLIC_APP_NAME || "Online Pen",
  description: "Закрытая онлайн-запись мастера"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const appName = process.env.NEXT_PUBLIC_APP_NAME || "Online Pen";

  return (
    <html lang="ru">
      <body>
        <main className="container">
          <header className="header">
            <a className="logo" href="/">{appName}</a>
            <nav className="nav">
              <a href="/price">Прайс</a>
              <a href="/login">Вход клиента</a>
              <a href="/register">Регистрация</a>
              <a href="/admin">Админка</a>
            </nav>
          </header>
          {children}
        </main>
      </body>
    </html>
  );
}
