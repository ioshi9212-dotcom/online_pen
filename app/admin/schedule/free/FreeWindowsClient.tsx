"use client";

import { useMemo, useState } from "react";

type WindowItem = {
  id: string;
  time: string;
};

type WindowGroup = {
  key: string;
  title: string;
  items: WindowItem[];
};

export default function FreeWindowsClient({ initialGroups }: { initialGroups: WindowGroup[] }) {
  const [groups, setGroups] = useState(initialGroups);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const text = useMemo(() => {
    return groups
      .filter((group) => group.items.length > 0)
      .map((group) => `${group.title} - ${group.items.map((item) => item.time).join(", ")}`)
      .join("\n\n") || "Онлайн-окон пока нет.";
  }, [groups]);

  async function removeWindow(id: string) {
    setError("");
    setPendingId(id);

    const previous = groups;
    setGroups((current) => current
      .map((group) => ({ ...group, items: group.items.filter((item) => item.id !== id) }))
      .filter((group) => group.items.length > 0)
    );

    try {
        const response = await fetch("/admin/schedule/free/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id })
        });

        if (!response.ok) {
          setGroups(previous);
          setError("Не убралось. Обнови страницу и попробуй ещё раз.");
        }
    } catch {
      setGroups(previous);
      setError("Не убралось. Сеть решила поиграть в мёртвую.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <>
      {error ? <div className="notice danger-notice">{error}</div> : null}

      <div className="card">
        <h2>Скопировать список</h2>
        <textarea className="copy-area" readOnly value={text} />
      </div>

      <div className="card">
        <h2>Окна</h2>
        {groups.length === 0 ? <div className="notice">Открытых свободных онлайн-окон пока нет.</div> : null}
        <div className="grid">
          {groups.map((group) => (
            <div key={group.key} style={{ borderTop: "1px solid var(--line)", paddingTop: 16, marginTop: 4 }}>
              <h3 style={{ marginBottom: 10 }}>{group.title} - {group.items.map((item) => item.time).join(", ")}</h3>
              <div className="actions">
                {group.items.map((item) => (
                  <div key={item.id} className="slot" style={{ minWidth: 120 }}>
                    <b>{item.time}</b>
                    <button
                      type="button"
                      className="danger"
                      disabled={Boolean(pendingId)}
                      onClick={() => removeWindow(item.id)}
                    >
                      {pendingId === item.id ? "Убираю…" : "Убрать"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
