export function buildDevServiceWorkerScript() {
  return `
/* bit dev service worker: keeps workspace UI shell available when local dev server is down */
const params = new URL(self.location.href).searchParams;
const workspaceKey = params.get('ws') || 'default';
const buildToken = params.get('v') || 'dev';
const cachePrefix = 'bit-dev-ui-' + workspaceKey + '-' + buildToken;
const navigationCacheName = cachePrefix + '-nav';
const assetCacheName = cachePrefix + '-assets';
const shellCandidates = ['/index.html', '/public/index.html', '/public/'];

function isHtmlResponse(response) {
  if (!response) return false;
  const contentType = (response.headers && response.headers.get('content-type')) || '';
  return contentType.includes('text/html');
}

function inferContentType(pathname) {
  if (/\\.js(\\?.*)?$/i.test(pathname)) return 'application/javascript; charset=utf-8';
  if (/\\.css(\\?.*)?$/i.test(pathname)) return 'text/css; charset=utf-8';
  if (/\\.json(\\?.*)?$/i.test(pathname)) return 'application/json; charset=utf-8';
  return 'text/plain; charset=utf-8';
}

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    (async () => {
      const cache = await caches.open(navigationCacheName);
      await Promise.all(
        shellCandidates.map(async (candidate) => {
          try {
            const res = await fetch(candidate, { cache: 'no-store' });
            if (res && res.ok && isHtmlResponse(res)) {
              await cache.put(candidate, res.clone());
            }
          } catch {}
        })
      );
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      await self.clients.claim();
      const names = await caches.keys();
      await Promise.all(
        names.map((name) => {
          if (!name.startsWith('bit-dev-ui-')) return Promise.resolve(false);
          if (name.startsWith(cachePrefix)) return Promise.resolve(false);
          return caches.delete(name);
        })
      );
    })()
  );
});

async function cacheShell(request, response) {
  if (!response || !response.ok || !isHtmlResponse(response)) return;
  const cache = await caches.open(navigationCacheName);
  await cache.put(request, response.clone());
  await Promise.all(
    shellCandidates.map(async (candidate) => {
      try {
        await cache.put(candidate, response.clone());
      } catch {}
    })
  );
}

async function handleNavigation(request) {
  try {
    const networkResponse = await fetch(request, { cache: 'no-store' });
    if (networkResponse && networkResponse.ok) {
      await cacheShell(request, networkResponse.clone());
      return networkResponse;
    }
  } catch {}

  const cache = await caches.open(navigationCacheName);
  const direct = await cache.match(request, { ignoreSearch: true });
  if (direct) return direct;

  for (const candidate of shellCandidates) {
    const cached = await cache.match(candidate, { ignoreSearch: true });
    if (cached) return cached;
  }

  return new Response(
    '<!doctype html><html><body><div style="font-family:sans-serif;padding:16px;">Offline mode: waiting for dev server.</div></body></html>',
    {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    }
  );
}

async function handleAsset(request) {
  try {
    const response = await fetch(request, { cache: 'no-store' });
    if (response && response.ok) {
      const cache = await caches.open(assetCacheName);
      await cache.put(request, response.clone());
      return response;
    }
    return response;
  } catch {
    const cached = await caches.match(request, { ignoreSearch: false });
    if (cached) return cached;

    const url = new URL(request.url);
    return new Response('', {
      status: 503,
      headers: { 'content-type': inferContentType(url.pathname) },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const pathname = url.pathname || '';
  if (
    pathname.startsWith('/preview/') ||
    pathname.startsWith('/_hmr/') ||
    /hot-update\\.(js|json)(\\?.*)?$/i.test(pathname) ||
    pathname.startsWith('/api/') ||
    pathname === '/graphql' ||
    pathname === '/subscriptions' ||
    pathname.includes('/sockjs-node') ||
    pathname === '/service-worker.js'
  ) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request));
    return;
  }

  if (/\\.(js|css|map|json|txt|ico|png|jpe?g|gif|svg|webp|woff2?|ttf|eot)(\\?.*)?$/i.test(pathname)) {
    event.respondWith(handleAsset(request));
  }
});

self.addEventListener('message', (event) => {
  if (event && event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
`;
}
