// Service worker del CRM: muestra las notificaciones push (mensajes del chat y tareas) aunque el
// CRM no esté abierto, y al tocarlas abre (o enfoca) la página indicada.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let aviso = {};
  try {
    aviso = event.data ? event.data.json() : {};
  } catch {
    aviso = { titulo: "CRM", cuerpo: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(aviso.titulo || "CRM", {
      body: aviso.cuerpo || "",
      icon: "/marca/plataforma.png",
      badge: "/marca/plataforma.png",
      tag: aviso.etiqueta,
      // Una notificación que reemplaza a otra con la misma etiqueta vuelve a sonar.
      renotify: Boolean(aviso.etiqueta),
      data: { url: aviso.url || "/" },
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const destino = new URL(event.notification.data?.url || "/", self.location.origin);
  event.waitUntil(
    (async () => {
      const ventanas = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      const abierta = ventanas.find((v) => new URL(v.url).origin === destino.origin);
      if (abierta) {
        // Con el CRM abierto se enfoca y se le pide abrir el chat o ir a la página.
        abierta.postMessage({ tipo: "notificacion", url: destino.pathname + destino.search });
        return abierta.focus();
      }
      return self.clients.openWindow(destino.href);
    })()
  );
});
