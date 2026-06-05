import type { Metadata } from "next";
import "./globals.css";

const appName = "Онлайн-запись";

export const metadata: Metadata = {
  title: appName,
  description: "Закрытая онлайн-запись к мастеру"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
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
