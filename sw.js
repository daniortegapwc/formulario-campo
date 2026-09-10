/* Service worker: deja la app disponible sin cobertura una vez abierta con conexión. */
const VERSION = "f1surv-v4";
const FONTS = VERSION + "-fonts";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== FONTS).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(v => { clearTimeout(t); resolve(v); }, err => { clearTimeout(t); reject(err); });
  });
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.origin === location.origin) {
    // Red primero (con tope de 3 s para cobertura mala), y si falla, la copia guardada.
    e.respondWith(
      withTimeout(fetch(req), 3000)
        .then(res => { const copy = res.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return res; })
        .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match("./index.html")))
    );
  } else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.host)) {
    // Fuentes: copia guardada primero; si no hay y no hay red, respuesta vacía (se usa la fuente del sistema).
    e.respondWith(
      caches.match(req).then(r => r || fetch(req)
        .then(res => { const copy = res.clone(); caches.open(FONTS).then(c => c.put(req, copy)); return res; })
        .catch(() => new Response("", { status: 200, headers: { "Content-Type": "text/css" } })))
    );
  }
});
