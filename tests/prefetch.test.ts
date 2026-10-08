import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
function worker(responses: Record<string, Response>) {
  const entries = new Map<string, Response>();
  const listeners: Record<string, Function> = {};
  let fetched = 0;
  const cache = {
    keys: async () => [...entries.keys()].map((url) => new Request(url)),
    match: async (key: string | Request) =>
      entries.get(typeof key === "string" ? key : key.url)?.clone(),
    put: async (key: string | Request, response: Response) => {
      entries.set(typeof key === "string" ? key : key.url, response.clone());
    },
    delete: async (key: string | Request) =>
      entries.delete(typeof key === "string" ? key : key.url),
  };
  const self = {
    location: { href: "https://example.test/HUB/sw.js" },
    addEventListener: (type: string, cb: Function) => (listeners[type] = cb),
  };
  runInNewContext(readFileSync("public/sw.js", "utf8"), {
    self,
    URL,
    Response,
    Request,
    Headers,
    Blob,
    AbortController,
    caches: { open: async () => cache, delete: async () => entries.clear() },
    fetch: async (url: string) => {
      fetched++;
      return responses[url].clone();
    },
  });
  return {
    entries,
    get fetched() {
      return fetched;
    },
    message: async (data: unknown) => {
      let promise;
      listeners.message({
        data,
        waitUntil: (p: Promise<unknown>) => (promise = p),
      });
      await promise;
    },
  };
}
const media = (size: number) =>
  new Response(new Uint8Array(size), {
    headers: { "content-type": "video/mp4", "content-length": String(size) },
  });
describe("authorized media cache", () => {
  it("caches a permitted file and evicts the oldest within the budget", async () => {
    const a = "https://media.test/a",
      b = "https://media.test/b";
    const w = worker({ [a]: media(8), [b]: media(8) });
    await w.message({
      type: "PREFETCH",
      urls: [a, b],
      maxBytes: 10,
      concurrency: 1,
    });
    expect(w.entries.size).toBe(1);
    expect(w.entries.has(b)).toBe(true);
  });
  it("skips oversized and non-video responses", async () => {
    const a = "https://media.test/a",
      b = "https://media.test/b";
    const w = worker({
      [a]: media(20),
      [b]: new Response("x", {
        headers: { "content-length": "1", "content-type": "text/html" },
      }),
    });
    await w.message({
      type: "PREFETCH",
      urls: [a, b],
      maxBytes: 10,
      concurrency: 2,
    });
    expect(w.entries.size).toBe(0);
  });
  it("limits the queue to the next two URLs and supports clearing", async () => {
    const urls = [
      "https://media.test/a",
      "https://media.test/b",
      "https://media.test/c",
    ];
    const w = worker(Object.fromEntries(urls.map((url) => [url, media(2)])));
    await w.message({ type: "PREFETCH", urls, maxBytes: 10, concurrency: 1 });
    expect(w.fetched).toBe(2);
    await w.message({ type: "CLEAR_MEDIA" });
    expect(w.entries.size).toBe(0);
  });
});
