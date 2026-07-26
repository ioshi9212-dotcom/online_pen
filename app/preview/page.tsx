import ClientBookingPicker, { BookingServiceOption, BookingWindow } from "@/app/ClientBookingPicker";
import { addBusinessDays, businessDateTimeFromKeyAndTime, todayBusinessDateKey } from "@/lib/timezone";

export const dynamic = "force-dynamic";

const services: BookingServiceOption[] = [
  {
    id: "preview-manicure",
    title: "Маникюр",
    description: "Снятие, маникюр и покрытие",
    durationMinutes: 150,
    price: 2500
  },
  {
    id: "preview-pedicure",
    title: "Педикюр",
    description: "Обработка пальчиков и покрытие",
    durationMinutes: 150,
    price: 2800
  },
  {
    id: "preview-bundle",
    title: "Маникюр + педикюр",
    description: "Одна заявка на длинный визит. Ничего считать и бронировать дважды не нужно.",
    durationMinutes: 300,
    price: 5300,
    isBundle: true
  },
  {
    id: "preview-extension",
    title: "Наращивание",
    description: "Наращивание с однотонным покрытием",
    durationMinutes: 210,
    price: 3500
  }
];

function previewWindows(): BookingWindow[] {
  const today = todayBusinessDateKey();
  const days = [2, 4, 7, 9, 12].map((offset) => addBusinessDays(today, offset));
  const times = ["10:00", "12:30", "15:00", "17:30"];
  return days.flatMap((day, dayIndex) => times.map((time, timeIndex) => {
    const availableServiceIds = services
      .filter((service) => {
        if (time === "17:30" && service.durationMinutes > 150) return false;
        if (dayIndex === 1 && timeIndex === 1) return false;
        if (dayIndex === 2 && service.isBundle) return time === "10:00";
        return true;
      })
      .map((service) => service.id);
    return {
      id: `${day}-${time}`,
      startAt: businessDateTimeFromKeyAndTime(day, time).toISOString(),
      availableServiceIds
    };
  }));
}

export default function PreviewPage() {
  const windows = previewWindows();
  return (
    <main className="client-v2 client-booking-page preview-v2">
      <aside className="preview-v2-bar">
        <div><b>Превью новой версии</b><span>Данные демонстрационные, заявки никуда не отправляются.</span></div>
        <nav><a href="/">Старт</a><a href="/pending?phone=+7 900 123-45-67">Ожидание</a><a className="is-active" href="/preview">Запись</a></nav>
      </aside>

      <section className="client-v2-intro">
        <div>
          <span className="client-v2-kicker">Демонстрация личного кабинета</span>
          <h1>Настя, выберите удобное время</h1>
          <p>Попробуйте пройти весь путь: услуга → дата → время → отправка.</p>
        </div>
        <span className="client-v2-test-badge">Без настоящей записи</span>
      </section>

      <ClientBookingPicker
        client={{ firstName: "Настя", lastName: "Клиент", phone: "+7 900 123-45-67" }}
        services={services}
        windows={windows}
        previewMode
      />
    </main>
  );
}
