/* Service worker: mantiene la aplicacion utilizable sin cobertura.
 *
 * Estrategia: COPIA GUARDADA PRIMERO. Se sirve siempre lo que hay en cache y la
 * actualizacion se intenta por detras. Es lo contrario de lo habitual en la web,
 * y es a proposito: en un recinto con la red saturada o con portal cautivo, pedir
 * a la red antes que a la cache significa arriesgarse a guardar encima una pagina
 * de login o un error. Aqui la fiabilidad importa mas que la frescura.
 */
const VERSION = "campo-v6";
const FONTS = VERSION + "-fonts";
const SHELL = ["./", "./index.html", "./manifest.webmanifest"];

/* La pagina buena siempre contiene este texto. Sirve para no guardar en cache la
 * respuesta de un portal cautivo, que suele venir con codigo 200. */
const MARCA = "CIFRADO";

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

/* Solo se considera valida una respuesta propia, con codigo 200, y que en el caso
 * del HTML contenga la marca. Cualquier otra cosa se descarta sin tocar la cache. */
async function esValida(res, esHTML) {
  if (!res || !res.ok || res.type === "opaque" || res.type === "opaqueredirect") return false;
  if (res.redirected) return false;
  if (!esHTML) return true;
  try {
    return (await res.clone().text()).includes(MARCA);
  } catch (err) {
    return false;
  }
}

async function refrescarPorDetras(req, esHTML) {
  try {
    const res = await fetch(req, { cache: "no-store" });
    if (await esValida(res, esHTML)) {
      const cache = await caches.open(VERSION);
      await cache.put(req, res.clone());
    }
  } catch (err) {
    /* Sin red o con red mala: no pasa nada, se sigue usando la copia guardada. */
  }
}

async function propio(req) {
  const esHTML = req.mode === "navigate" || req.destination === "document";
  const guardada = await caches.match(req, { ignoreSearch: true });

  if (guardada) {
    /* Se responde al instante con la copia y se intenta actualizar sin bloquear. */
    refrescarPorDetras(req, esHTML);
    return guardada;
  }

  try {
    const res = await fetch(req);
    if (await esValida(res, esHTML)) {
      const cache = await caches.open(VERSION);
      await cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    /* Nunca se guardo y no hay red: para una navegacion, la portada. */
    const portada = await caches.match("./index.html", { ignoreSearch: true });
    if (portada) return portada;
    return new Response("Sin conexion y sin copia guardada.", {
      status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" }
    });
  }
}

async function tipografia(req) {
  const guardada = await caches.match(req);
  if (guardada) return guardada;
  try {
    const res = await fetch(req);
    if (res && res.ok) {
      const cache = await caches.open(FONTS);
      await cache.put(req, res.clone());
    }
    return res;
  } catch (err) {
    /* Sin la tipografia se usa la del sistema: la aplicacion sigue siendo legible. */
    return new Response("", { status: 200, headers: { "Content-Type": "text/css" } });
  }
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin) e.respondWith(propio(req));
  else if (/fonts\.(googleapis|gstatic)\.com$/.test(url.host)) e.respondWith(tipografia(req));
});
