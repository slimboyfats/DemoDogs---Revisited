// The worker that keeps the game on the phone. The build puts `KEEP` above this: the name of this
// build and every file it is made of (build/keep.ts).
//
// - When a build is first seen, all of its files are fetched and kept, so the next visit asks the
//   line for nothing and the game opens with no line at all.
// - The kept page opens at once. The line is asked for the page behind it, and when a new build
//   has gone up the open page is told and loads again, so a deploy shows on the very next visit.
// - Everything else of the game is named after what is in it, so a kept copy is always right.
const STORE = `demodogs-${KEEP.id}`;
const PAGE = './index.html';

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const store = await caches.open(STORE);
      const old = await kept();
      // a file named after what is in it, held by an older build, is copied over, not fetched
      await Promise.all(
        KEEP.files.map(async (f) => {
          const hit = f.startsWith('./assets/') ? await old(f) : undefined;
          await store.put(f, hit ?? (await fresh(f)));
        }),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      for (const name of await caches.keys())
        if (name.startsWith('demodogs-') && name !== STORE) await caches.delete(name);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin || !url.pathname.startsWith(scope())) return;
  const path = `./${url.pathname.slice(scope().length)}`;
  if (req.mode === 'navigate' && (path === './' || path === PAGE)) {
    e.respondWith(page(e));
    return;
  }
  if (!KEEP.files.includes(path) && !path.startsWith('./assets/')) return;
  e.respondWith(
    (async () => {
      const hit = await caches.match(path);
      if (hit) return hit;
      const got = await fetch(req);
      // a file of a newer build than this worker: kept as it comes, until that build's own worker
      if (got.ok && path.startsWith('./assets/')) {
        const store = await caches.open(STORE);
        await store.put(path, got.clone());
      }
      return got;
    })(),
  );
});

function scope() {
  return new URL(self.registration.scope).pathname;
}

/** Fetch a file of this build past the browser's own cache; throws if it is not there. */
async function fresh(f) {
  const got = await fetch(new Request(f, { cache: 'no-cache' }));
  if (!got.ok) throw new Error(`${f}: ${got.status}`);
  return got;
}

/** A lookup into what older builds kept. */
async function kept() {
  const names = (await caches.keys()).filter((n) => n.startsWith('demodogs-') && n !== STORE);
  return async (f) => {
    for (const n of names) {
      const hit = await (await caches.open(n)).match(f);
      if (hit) return hit;
    }
    return undefined;
  };
}

/**
 * The page. A phone that has kept one gets it at once, and the line is asked behind it: if the
 * page there is another (a new build went up), it is kept and the open page hears of it when it asks, so it can
 * load again while it is still on the menu (src/keep.ts). A phone with none waits for the line.
 */
async function page(e) {
  const store = await caches.open(STORE);
  const had = await store.match(PAGE);
  const old = had ? await had.clone().text() : null;
  const line = (async () => {
    const got = await fetch(new Request(PAGE, { cache: 'no-cache' }));
    if (!got.ok) throw new Error(String(got.status));
    const text = await got.clone().text();
    await store.put(PAGE, got.clone());
    return { got, changed: old !== null && old !== text };
  })();
  if (!had) return (await line).got;
  // the page asks, once it is up, whether the line had a newer one (the `message` below)
  const news = line.then(
    (l) => l.changed,
    () => false,
  );
  asked.set(e.resultingClientId, news);
  e.waitUntil(news);
  return had;
}

/** By the page a kept copy was opened for: whether the line turned out to have a newer one. */
const asked = new Map();

self.addEventListener('message', (e) => {
  if (e.data?.demodogs !== 'newer?' || !e.source) return;
  const news = asked.get(e.source.id);
  asked.delete(e.source.id);
  if (!news) return;
  e.waitUntil(news.then((changed) => changed && e.source.postMessage({ demodogs: 'new-build' })));
});
