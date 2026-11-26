/**
 * Keeps the game on the phone: registers the worker the build writes (build/sw.js), which stores
 * every file of the build after the first visit. The next visit then opens from the phone, and
 * with no line the game still opens. A newer build is noticed behind that and loaded at once. Built games only: the dev server has no worker.
 * `?fresh` forgets everything kept and loads the game again from the line.
 */
export function keepGame(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  const params = new URLSearchParams(location.search);
  if (params.has('fresh')) {
    void forget().then(() => {
      params.delete('fresh');
      const q = params.toString();
      location.replace(`${location.pathname}${q ? `?${q}` : ''}`);
    });
    return;
  }
  // a newer build went up while the kept one was opening: load it, unless a race is already on
  navigator.serviceWorker.addEventListener('message', (e) => {
    const data = e.data as { demodogs?: string } | null;
    if (data?.demodogs === 'new-build' && document.body.dataset.screen === 'menu')
      location.reload();
  });
  // after the page is up, so keeping the game never slows the visit that fetches it
  const go = (): void => {
    navigator.serviceWorker.controller?.postMessage({ demodogs: 'newer?' });
    // `update` asks the line for the worker each visit, so a new build is kept as soon as it is up
    navigator.serviceWorker
      .register('./sw.js', { scope: './' })
      .then((reg) => reg.update())
      .catch(() => undefined);
  };
  if (document.readyState === 'complete') go();
  else addEventListener('load', go, { once: true });
}

async function forget(): Promise<void> {
  try {
    await (await navigator.serviceWorker.getRegistration('./'))?.unregister();
    for (const name of await caches.keys())
      if (name.startsWith('demodogs-')) await caches.delete(name);
  } catch {
    /* nothing kept, or not allowed to look */
  }
}
