/** fallback html template for the main UI, in case ssr is not active */
type HtmlOptions = {
  serviceWorkerMode?: 'register' | 'disable';
};

export function html(title: string, withDevTools?: boolean, options?: HtmlOptions) {
  const serviceWorkerMode = options?.serviceWorkerMode ?? 'register';
  const workspaceCacheKey = title;

  const serviceWorkerScript =
    serviceWorkerMode === 'disable'
      ? `
      <script>
      // In webpack-dev-server mode (/public/*), disable SW to avoid stale app-shell caches.
      (function() {
        if (!('serviceWorker' in navigator)) return;
        var hadController = Boolean(navigator.serviceWorker.controller);
        var RELOAD_GUARD = '__bit_sw_dev_cleanup_reload__';
        void (async function() {
          try {
            var registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(function(reg) { return reg.unregister(); }));
          } catch {}
          try {
            if ('caches' in window) {
              var cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(function(name) { return caches.delete(name); }));
            }
          } catch {}
          if (hadController && !window[RELOAD_GUARD]) {
            window[RELOAD_GUARD] = true;
            window.location.reload();
          }
        })();
      })();
      </script>
      `
      : `
      <script>
      // Register app-shell service worker so UI can still boot from cache when the local dev process is down.
      (function() {
        if (!('serviceWorker' in navigator)) return;
        var RELOAD_GUARD = '__bit_sw_controller_reload__';

        function getBuildToken() {
          try {
            var scripts = Array.prototype.slice.call(document.querySelectorAll('script[src]'));
            for (var i = 0; i < scripts.length; i += 1) {
              var src = scripts[i] && scripts[i].getAttribute('src');
              if (!src) continue;
              var match = src.match(/runtime-main\\.([a-z0-9]+)\\.js/i);
              if (match && match[1]) return match[1];
            }
          } catch {}
          return String(Date.now());
        }

        function getSwUrl() {
          var token = getBuildToken();
          return '/service-worker.js?ws=' + encodeURIComponent(window.__BIT_WORKSPACE_CACHE_KEY__ || '') + '&v=' + encodeURIComponent(token);
        }

        async function clearServiceWorkersAndCaches() {
          try {
            var registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(function(reg) { return reg.unregister(); }));
            if ('caches' in window) {
              var cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(function(name) { return caches.delete(name); }));
            }
          } catch {}
        }

        async function migrateBrokenSwIfNeeded() {
          var swUrl = getSwUrl();
          try {
            var swScript = await fetch(swUrl, { cache: 'no-store' }).then(function(res) {
              return res.ok ? res.text() : '';
            });
            // Migration for older broken SW fallback that points to "public/index.html".
            if (
              swScript.indexOf('public/index.html') !== -1 ||
              swScript.indexOf('createHandlerBoundToURL("public/index.html")') !== -1
            ) {
              await clearServiceWorkersAndCaches();
            }
          } catch {}
        }

        async function registerServiceWorker() {
          var swUrl = getSwUrl();
          try {
            await migrateBrokenSwIfNeeded();
            var reg = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
            try { await reg.update(); } catch {}
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          } catch {}
        }

        navigator.serviceWorker.addEventListener('controllerchange', function() {
          if (window[RELOAD_GUARD]) return;
          window[RELOAD_GUARD] = true;
          window.location.reload();
        });

        window.addEventListener('load', function() {
          void registerServiceWorker();
        });
      })();
      </script>
      `;

  return () => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <script>
      // Allow to use react dev-tools inside the examples
      ${
        withDevTools
          ? ''
          : 'try { window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__; } catch {}'
      }
      </script>
      <script>
      // Workspace-level cache partition key used by SW/Apollo to avoid cross-workspace cache collisions.
      window.__BIT_WORKSPACE_CACHE_KEY__ = ${JSON.stringify(workspaceCacheKey)};
      </script>
      ${serviceWorkerScript}
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>  
  `;
}
