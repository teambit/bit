/** fallback html template for the main UI, in case ssr is not active */
type HtmlOptions = {
  serviceWorkerMode?: 'register' | 'disable';
  workspaceCacheKey?: string;
  serviceWorkerBuildToken?: string;
  autoReloadOnSwControllerChange?: boolean;
  serviceWorkerDevSessionReset?: boolean;
};

export function html(title: string, withDevTools?: boolean, options?: HtmlOptions) {
  const serviceWorkerMode = options?.serviceWorkerMode ?? 'register';
  const workspaceCacheKey = options?.workspaceCacheKey || title;
  const serviceWorkerBuildToken = options?.serviceWorkerBuildToken || 'dev';
  const autoReloadOnSwControllerChange = options?.autoReloadOnSwControllerChange ?? false;
  const serviceWorkerDevSessionReset = options?.serviceWorkerDevSessionReset ?? false;

  const serviceWorkerScript =
    serviceWorkerMode === 'disable'
      ? `
      <script>
      // In webpack-dev-server mode (/public/*), disable SW to avoid stale app-shell caches.
      (function() {
        if (!('serviceWorker' in navigator)) return;
        var hadController = Boolean(navigator.serviceWorker.controller);
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
          // Never auto-reload here; browser should stay stable and let runtime recover.
          // A forced reload can create infinite loops when multiple local Bit instances run in parallel.
          if (hadController) {
            try { console.info('[bit-sw] cleared stale dev service worker controller'); } catch {}
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

        function getSwUrl() {
          var token = String(window.__BIT_SW_BUILD_TOKEN__ || 'dev');
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

        async function clearMismatchedWorkspaceSw() {
          try {
            var expectedWorkspaceKey = String(window.__BIT_WORKSPACE_CACHE_KEY__ || '');
            var registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(async function(reg) {
              var scriptUrl = (reg.active && reg.active.scriptURL) || (reg.waiting && reg.waiting.scriptURL) || (reg.installing && reg.installing.scriptURL) || '';
              if (!scriptUrl) return;
              try {
                var parsed = new URL(scriptUrl, window.location.origin);
                var wsParam = parsed.searchParams.get('ws') || '';
                if (wsParam && wsParam !== expectedWorkspaceKey) {
                  await reg.unregister();
                }
              } catch {}
            }));
          } catch {}
        }

        async function resetForNewDevSessionIfNeeded() {
          if (!window.__BIT_SW_DEV_SESSION_RESET__) return;
          try {
            var workspaceKey = String(window.__BIT_WORKSPACE_CACHE_KEY__ || '');
            var token = String(window.__BIT_SW_BUILD_TOKEN__ || 'dev');
            var storageKey = '__bit_sw_dev_session_token__:' + workspaceKey;
            var previousToken = window.localStorage.getItem(storageKey);
            if (previousToken === token) return;
            await clearServiceWorkersAndCaches();
            window.localStorage.setItem(storageKey, token);
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
              swScript.indexOf('createHandlerBoundToURL("public/index.html")') !== -1 ||
              swScript.indexOf("createHandlerBoundToURL('public/index.html')") !== -1
            ) {
              await clearServiceWorkersAndCaches();
            }
          } catch {}
        }

        async function registerServiceWorker() {
          var swUrl = getSwUrl();
          try {
            await resetForNewDevSessionIfNeeded();
            await clearMismatchedWorkspaceSw();
            await migrateBrokenSwIfNeeded();
            var reg = await navigator.serviceWorker.register(swUrl, { updateViaCache: 'none' });
            try { await reg.update(); } catch {}
            if (reg.waiting) {
              reg.waiting.postMessage({ type: 'SKIP_WAITING' });
            }
          } catch {}
        }

        navigator.serviceWorker.addEventListener('controllerchange', function() {
          if (!window.__BIT_SW_AUTO_RELOAD_ON_CONTROLLER_CHANGE__) return;
          if (window[RELOAD_GUARD]) return;
          window[RELOAD_GUARD] = true;
          // Do not force full page reloads from SW controller changes.
          // Keep the app running and allow in-app health/reconnect flows to recover state.
          try { console.info('[bit-sw] controller changed'); } catch {}
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
      window.__BIT_SW_BUILD_TOKEN__ = ${JSON.stringify(serviceWorkerBuildToken)};
      window.__BIT_SW_AUTO_RELOAD_ON_CONTROLLER_CHANGE__ = ${JSON.stringify(autoReloadOnSwControllerChange)};
      window.__BIT_SW_DEV_SESSION_RESET__ = ${JSON.stringify(serviceWorkerDevSessionReset)};
      // Guard against dev hot-clients forcing top-level full-page refresh loops.
      // Preview iframes can opt-in via __BIT_ALLOW_DEV_AUTO_RELOAD__ when needed.
      window.__BIT_DISABLE_DEV_AUTO_RELOAD__ = true;
      </script>
      ${serviceWorkerScript}
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>  
  `;
}
