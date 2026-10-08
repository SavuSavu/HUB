const VERSION = "hub-assets-v1";
const MEDIA = "hub-authorized-media-v1";
const BASE = new URL("./", self.location.href);
let jobs = [];
let controllers = [];
let running = false;
self.addEventListener("install", (event) =>
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) =>
        cache.addAll([
          BASE.href,
          new URL("index.html", BASE).href,
          new URL("catalog/index.json", BASE).href,
          new URL("catalog/sources.json", BASE).href,
        ]),
      )
      .then(() => self.skipWaiting()),
  ),
);
self.addEventListener("activate", (event) =>
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys
              .filter((k) => k.startsWith("hub-assets-") && k !== VERSION)
              .map((k) => caches.delete(k)),
          ),
        ),
    ]),
  ),
);
self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET") return;
  if (url.origin === BASE.origin && url.pathname.startsWith(BASE.pathname)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(VERSION);
        try {
          const response = await fetch(event.request);
          if (response.ok) await cache.put(event.request, response.clone());
          return response;
        } catch {
          const stored = await cache.match(event.request);
          return (
            stored ??
            (event.request.mode === "navigate"
              ? await cache.match(BASE.href)
              : undefined) ??
            new Response("Offline asset unavailable", { status: 503 })
          );
        }
      })(),
    );
  } else {
    event.respondWith(
      caches.open(MEDIA).then(async (cache) => {
        const cached = await cache.match(event.request.url);
        if (!cached) return fetch(event.request);
        const range = event.request.headers.get("range");
        if (!range) return cached;
        const match = range.match(/^bytes=(\d*)-(\d*)$/);
        if (!match) return fetch(event.request);
        const blob = await cached.blob();
        const start = match[1]
          ? Number(match[1])
          : Math.max(0, blob.size - Number(match[2]));
        const end =
          match[1] && match[2]
            ? Math.min(Number(match[2]), blob.size - 1)
            : blob.size - 1;
        if (start >= blob.size || end < start)
          return new Response(null, {
            status: 416,
            headers: { "Content-Range": `bytes */${blob.size}` },
          });
        const headers = new Headers(cached.headers);
        headers.set("Content-Range", `bytes ${start}-${end}/${blob.size}`);
        headers.set("Content-Length", String(end - start + 1));
        headers.set("Accept-Ranges", "bytes");
        return new Response(blob.slice(start, end + 1), {
          status: 206,
          headers,
        });
      }),
    );
  }
});
async function trim(cache, maxBytes) {
  let entries = await cache.keys();
  let total = 0;
  const sizes = [];
  for (const request of entries) {
    const response = await cache.match(request);
    const size = Number(response.headers.get("x-hub-size") || 0);
    total += size;
    sizes.push([request, size]);
  }
  while (total > maxBytes && sizes.length) {
    const [request, size] = sizes.shift();
    await cache.delete(request);
    total -= size;
  }
}
async function queue(data) {
  if (running) return;
  running = true;
  const maxBytes = Math.max(
    0,
    Math.min(Number(data.maxBytes) || 0, 2147483648),
  );
  const concurrency = Math.max(1, Math.min(Number(data.concurrency) || 1, 3));
  jobs = data.urls
    .filter((url) => {
      try {
        return new URL(url).protocol === "https:";
      } catch {
        return false;
      }
    })
    .slice(0, 2);
  const cache = await caches.open(MEDIA);
  await trim(cache, maxBytes);
  try {
    await Promise.all(
      Array.from({ length: concurrency }, async () => {
        while (jobs.length) {
          const url = jobs.shift();
          if (await cache.match(url)) continue;
          const controller = new AbortController();
          controllers.push(controller);
          try {
            const response = await fetch(url, {
              mode: "cors",
              credentials: "omit",
              signal: controller.signal,
            });
            const length = Number(response.headers.get("content-length"));
            if (
              !response.ok ||
              response.type === "opaque" ||
              !length ||
              length > maxBytes ||
              !/^video\//i.test(response.headers.get("content-type") || "")
            ) {
              controller.abort();
              continue;
            }
            const reader = response.body.getReader();
            const chunks = [];
            let bytes = 0;
            while (true) {
              const item = await reader.read();
              if (item.done) break;
              bytes += item.value.byteLength;
              if (bytes > maxBytes) {
                await reader.cancel();
                throw Error("Cache budget exceeded");
              }
              chunks.push(item.value);
            }
            const headers = new Headers(response.headers);
            headers.set("x-hub-size", String(bytes));
            await cache.put(url, new Response(new Blob(chunks), { headers }));
            await trim(cache, maxBytes);
          } catch {
          } finally {
            controllers = controllers.filter((c) => c !== controller);
          }
        }
      }),
    );
  } finally {
    running = false;
  }
}
self.addEventListener("message", (event) => {
  const data = event.data;
  if (data.type === "CANCEL_PREFETCH") {
    jobs = [];
    controllers.forEach((c) => c.abort());
  }
  if (data.type === "CLEAR_MEDIA") {
    jobs = [];
    controllers.forEach((c) => c.abort());
    event.waitUntil(caches.delete(MEDIA));
  }
  if (data.type === "PREFETCH") event.waitUntil(queue(data));
});
