/* Online Pen service worker: notification handling only, no HTML caching. */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch {}
  const title = typeof data.title === "string" ? data.title.slice(0, 100) : "Онлайн-запись";
  const body = typeof data.body === "string" ? data.body.slice(0, 200) : "";
  const url = typeof data.url === "string" && data.url.startsWith("/") && !data.url.startsWith("//")
    ? data.url : "/";
  event.waitUntil(self.registration.showNotification(title, {
    body, icon: "/icon-512.png", badge: "/apple-touch-icon.png",
    tag: typeof data.tag === "string" ? data.tag.slice(0, 80) : "online-pen",
    data: { url }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const path = event.notification.data?.url || "/";
  const url = new URL(path, self.location.origin);
  if (url.origin !== self.location.origin) return;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (items) => {
    for (const tab of items) {
      if (tab.url.startsWith(self.location.origin) && "focus" in tab) {
        if ("navigate" in tab) await tab.navigate(url.href);
        return tab.focus();
      }
    }
    return clients.openWindow(url.href);
  }));
});
