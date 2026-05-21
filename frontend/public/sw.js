/* Polla PWA — Web Push (scope: site root) */

const ADMIN_PENDING_TYPES = new Set([
  "extra_bet_pending",
  "entry_pending",
  "change_request_pending",
  "password_reset_pending",
]);

const ADMIN_PUSH_TAGS = {
  extra_bet_pending: "admin-extra",
  entry_pending: "admin-entry",
  change_request_pending: "admin-change-request",
  password_reset_pending: "admin-password-reset",
};

self.addEventListener("push", (event) => {
  let payload = { title: "Polla", body: "", url: "/notifications" };
  try {
    if (event.data) {
      payload = { ...payload, ...event.data.json() };
    }
  } catch {
    if (event.data) {
      payload.body = event.data.text();
    }
  }

  const title = payload.title || "Polla";
  const isAdminUrgent = ADMIN_PENDING_TYPES.has(payload.type);
  const options = {
    body: payload.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    data: {
      url: payload.url || "/notifications",
      notification_id: payload.notification_id || null,
      type: payload.type || null,
    },
    tag: isAdminUrgent
      ? ADMIN_PUSH_TAGS[payload.type] || "admin-pending"
      : payload.notification_id || payload.type || "polla-notification",
    renotify: true,
  };

  if (isAdminUrgent) {
    options.requireInteraction = true;
    options.vibrate = [200, 100, 200];
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification.data?.url || "/notifications";
  const target = new URL(url, self.location.origin).href;

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          client.navigate(target);
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(target);
      }
    }),
  );
});

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(clients.claim());
});
