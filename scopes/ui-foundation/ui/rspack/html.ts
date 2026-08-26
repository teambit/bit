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
  // The token names the service worker's caches (`bit-dev-ui-<ws>-<token>-*`) and versions its
  // registration url. It must change when the bundle changes: the worker's activate handler deletes
  // every cache with a different token, so a stale token means offline fallbacks from an older
  // build survive forever. This template renders when the bundle is built, so a timestamp taken
  // here rotates the token exactly once per build.
  const serviceWorkerBuildToken = options?.serviceWorkerBuildToken || String(Date.now());
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
          var ownedSwFound = false;
          try {
            // Only touch what this app owns: localhost origins are shared across unrelated
            // dev servers over time, so an unconditional sweep would clear their state too.
            var registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(function(reg) {
              var scriptUrl = (reg.active || reg.waiting || reg.installing || {}).scriptURL || '';
              if (scriptUrl.indexOf('/service-worker.js') === -1) return undefined;
              ownedSwFound = true;
              return reg.unregister();
            }));
          } catch {}
          try {
            // Workbox cache names are not unique per application, so name filtering alone
            // cannot distinguish this app's caches from another Workbox app that used the
            // same origin. Only sweep when this app's own service worker was present -
            // its caches are then the ones the sweep targets.
            if (ownedSwFound && 'caches' in window) {
              var cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(function(name) {
                if (name.indexOf('workbox-') !== 0) return undefined;
                return caches.delete(name);
              }));
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
            // Scope to bit's own artifacts: unrelated apps served earlier on this
            // localhost origin keep their service workers and caches. Workbox cache
            // names are not unique per application, so caches are swept only when
            // this app's own service worker registration was present.
            var ownedSwFound = false;
            var registrations = await navigator.serviceWorker.getRegistrations();
            await Promise.all(registrations.map(function(reg) {
              var scriptUrl = (reg.active || reg.waiting || reg.installing || {}).scriptURL || '';
              if (scriptUrl.indexOf('/service-worker.js') === -1) return undefined;
              ownedSwFound = true;
              return reg.unregister();
            }));
            if (ownedSwFound && 'caches' in window) {
              var cacheNames = await caches.keys();
              await Promise.all(cacheNames.map(function(name) {
                if (name.indexOf('workbox-') !== 0) return undefined;
                return caches.delete(name);
              }));
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
          // Detect stale production SWs by checking the currently *installed* SW's scriptURL.
          // A production Workbox SW won't have a ?ws= query param (dev SWs always do).
          // We can't fetch the SW URL and inspect its content — in dev mode, the server
          // serves the dev SW at that path, so the fetch would never see production content.
          try {
            var reg = await navigator.serviceWorker.getRegistration();
            if (!reg) return;
            var scriptUrl = (reg.active && reg.active.scriptURL) || (reg.waiting && reg.waiting.scriptURL) || (reg.installing && reg.installing.scriptURL) || '';
            if (!scriptUrl) return;
            var parsed = new URL(scriptUrl, window.location.origin);
            var hasWsParam = parsed.searchParams.has('ws');
            if (!hasWsParam) {
              // This is a stale production SW (no workspace param) — unregister and clear caches.
              await clearServiceWorkersAndCaches();
              // The stale SW may have served cached HTML referencing production asset paths
              // (e.g. /public/static/js/310.xxxxx.js) that don't exist on the dev server.
              // Reload once to get fresh HTML. Guard with sessionStorage to prevent loops.
              var reloadKey = '__bit_sw_stale_reload__';
              if (!window.sessionStorage.getItem(reloadKey)) {
                window.sessionStorage.setItem(reloadKey, '1');
                window.location.reload();
                return;
              }
              window.sessionStorage.removeItem(reloadKey);
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

        // Register immediately — globals (__BIT_WORKSPACE_CACHE_KEY__, __BIT_SW_BUILD_TOKEN__)
        // are set in the previous <script> block, so they're available now.
        // Running before 'load' event reduces the window where a stale SW can intercept requests.
        void registerServiceWorker();
      })();
      </script>
      `;

  // Static "boot shell" painted by the browser before the UI bundle is parsed.
  //
  // The workspace bundle is several MB of JS in dev; until it downloads, parses, evaluates and React
  // commits its first render, `<div id="root">` is empty and the user stares at a blank page
  // (measured: first contentful paint ~516ms, first grid cards ~776ms on a 208-component workspace).
  // No React-level skeleton can cover that window because React itself isn't running yet.
  //
  // So the shell below is plain HTML + inline CSS: it paints on the first frame after the HTML
  // arrives (~50ms), mirroring the real layout (64px top bar, 246px sidebar, sticky filter bar and
  // the 280px-min card grid) so the swap to live content is a cross-fade, not a jump. It removes
  // itself as soon as React commits into #root.
  const bootShellStyle = `
      <style>
      :root {
        --bit-boot-bg: #fdfdff;
        --bit-boot-surface: #ffffff;
        --bit-boot-border: #ededed;
        --bit-boot-fill: #f1f1f4;
        --bit-boot-fill-strong: #e7e7ec;
        --bit-boot-sheen: rgba(0, 0, 0, 0.04);
      }
      html[data-theme='dark'] {
        --bit-boot-bg: #060414;
        --bit-boot-surface: #100f14;
        --bit-boot-border: #3d3d3c;
        --bit-boot-fill: #1c1b1f;
        --bit-boot-fill-strong: #262438;
        --bit-boot-sheen: rgba(255, 255, 255, 0.05);
      }
      #bit-boot {
        position: fixed;
        inset: 0;
        z-index: 3;
        display: flex;
        flex-direction: column;
        background: var(--bit-boot-bg);
        opacity: 1;
        transition: opacity 140ms ease-out;
        pointer-events: none;
        overflow: hidden;
      }
      #bit-boot[data-hiding='true'] { opacity: 0; }
      #bit-boot .bit-boot-fill,
      #bit-boot .bit-boot-pill,
      #bit-boot .bit-boot-row,
      #bit-boot .bit-boot-preview,
      #bit-boot .bit-boot-badge,
      #bit-boot .bit-boot-name,
      #bit-boot .bit-boot-hash {
        background: var(--bit-boot-fill);
        border-radius: 6px;
      }
      #bit-boot .bit-boot-topbar {
        flex: none;
        height: 64px;
        box-sizing: border-box;
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 0 16px;
        border-bottom: 1px solid var(--bit-boot-border);
      }
      #bit-boot .bit-boot-corner { width: 150px; height: 26px; border-radius: 8px; }
      #bit-boot .bit-boot-tab { width: 74px; height: 14px; }
      #bit-boot .bit-boot-avatar { margin-left: auto; width: 32px; height: 32px; border-radius: 999px; }
      #bit-boot .bit-boot-body { flex: 1; display: flex; min-height: 0; }
      #bit-boot .bit-boot-sidebar {
        flex: none;
        width: 246px;
        box-sizing: border-box;
        padding: 16px 14px;
        border-right: 1px solid var(--bit-boot-border);
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      #bit-boot .bit-boot-search { height: 30px; border-radius: 8px; background: var(--bit-boot-fill); }
      #bit-boot .bit-boot-row { height: 12px; }
      #bit-boot .bit-boot-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      #bit-boot .bit-boot-filterbar {
        flex: none;
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 40px;
        border-bottom: 1px solid var(--bit-boot-border);
      }
      #bit-boot .bit-boot-pill { width: 120px; height: 32px; border-radius: 8px; }
      #bit-boot .bit-boot-toggle { margin-left: auto; width: 96px; height: 32px; border-radius: 8px; background: var(--bit-boot-fill); }
      #bit-boot .bit-boot-grid {
        flex: 1;
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
        gap: 14px;
        align-content: start;
        padding: 20px 40px 80px;
        overflow: hidden;
      }
      #bit-boot .bit-boot-card {
        border-radius: 10px;
        overflow: hidden;
        background: var(--bit-boot-surface);
        border: 1px solid var(--bit-boot-border);
      }
      #bit-boot .bit-boot-preview { position: relative; height: 180px; border-bottom: 1px solid var(--bit-boot-border); border-radius: 0; }
      #bit-boot .bit-boot-footer { display: flex; align-items: center; gap: 8px; padding: 8px 12px; }
      #bit-boot .bit-boot-badge { width: 20px; height: 20px; border-radius: 5px; flex: none; background: var(--bit-boot-fill-strong); }
      #bit-boot .bit-boot-name { flex: 1; max-width: 62%; height: 11px; border-radius: 4px; background: var(--bit-boot-fill-strong); }
      #bit-boot .bit-boot-hash { width: 42px; height: 11px; border-radius: 4px; flex: none; }
      #bit-boot .bit-boot-sheen {
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent 0%, var(--bit-boot-sheen) 50%, transparent 100%);
        background-size: 200% 100%;
        animation: bit-boot-shimmer 1.4s ease-in-out infinite;
      }
      #bit-boot[data-minimal='true'] .bit-boot-topbar,
      #bit-boot[data-minimal='true'] .bit-boot-sidebar { display: none; }
      @keyframes bit-boot-shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      @media (prefers-reduced-motion: reduce) {
        #bit-boot .bit-boot-sheen { animation: none; }
      }
      @media screen and (max-width: 1024px) {
        #bit-boot .bit-boot-sidebar { display: none; }
        #bit-boot .bit-boot-grid, #bit-boot .bit-boot-filterbar { padding-left: 16px; padding-right: 16px; }
      }
      </style>`;

  const bootShellCard = `
          <div class="bit-boot-card">
            <div class="bit-boot-preview"><div class="bit-boot-sheen"></div></div>
            <div class="bit-boot-footer">
              <span class="bit-boot-badge"></span>
              <span class="bit-boot-name"></span>
              <span class="bit-boot-hash"></span>
            </div>
          </div>`;

  const bootShellSidebarRows = [78, 92, 64, 86, 70, 96, 58, 82, 74, 90, 66, 88]
    .map((width) => `<div class="bit-boot-row" style="width:${width}%"></div>`)
    .join('');

  const bootShell = `
      <div id="bit-boot" aria-hidden="true">
        <div class="bit-boot-topbar">
          <div class="bit-boot-corner bit-boot-fill"></div>
          <div class="bit-boot-tab bit-boot-fill"></div>
          <div class="bit-boot-tab bit-boot-fill"></div>
          <div class="bit-boot-avatar bit-boot-fill"></div>
        </div>
        <div class="bit-boot-body">
          <aside class="bit-boot-sidebar">
            <div class="bit-boot-search"></div>
            ${bootShellSidebarRows}
          </aside>
          <main class="bit-boot-main">
            <div class="bit-boot-filterbar">
              <span class="bit-boot-pill"></span>
              <span class="bit-boot-pill"></span>
              <span class="bit-boot-toggle"></span>
            </div>
            <div class="bit-boot-grid">${bootShellCard.repeat(12)}</div>
          </main>
        </div>
      </div>
      <script>
      // Remove the boot shell as soon as React commits its first render into #root. Waiting two
      // animation frames past that commit lets the real tree paint underneath, so the cross-fade
      // never exposes a blank frame. The timeout is a safety net: a UI that never mounts (bundle
      // error) must not leave the user staring at a permanent fake skeleton.
      (function () {
        var shell = document.getElementById('bit-boot');
        if (!shell) return;
        try {
          if (new URL(window.location.href).searchParams.get('minimal-mode') === 'true') {
            shell.setAttribute('data-minimal', 'true');
          }
        } catch (e) {}

        var done = false;
        function dismiss() {
          if (done) return;
          done = true;
          shell.setAttribute('data-hiding', 'true');
          setTimeout(function () {
            if (shell.parentNode) shell.parentNode.removeChild(shell);
          }, 200);
        }

        var root = document.getElementById('root');
        if (!root) return dismiss();
        if (root.childElementCount > 0) return dismiss();

        var observer = new MutationObserver(function () {
          if (!root.childElementCount) return;
          observer.disconnect();
          requestAnimationFrame(function () {
            requestAnimationFrame(dismiss);
          });
        });
        observer.observe(root, { childList: true });

        setTimeout(function () {
          observer.disconnect();
          dismiss();
        }, 15000);
      })();
      </script>`;

  return () => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <script>
      // Apply persisted theme synchronously, before React mounts, to avoid
      // a light/dark FOUC on reload. Keep this tiny and self-contained.
      (function () {
        try {
          var saved = null;
          var url = new URL(window.location.href);
          var qp = url.searchParams.get('theme');
          if (qp) saved = qp;
          if (!saved) {
            try { saved = sessionStorage.getItem('workspace-theme'); } catch (e) {}
          }
          if (!saved) {
            try { saved = localStorage.getItem('workspace-theme'); } catch (e) {}
          }
          if (saved === 'dark') {
            document.documentElement.dataset.theme = 'dark';
            document.documentElement.style.backgroundColor = '#060414';
          } else if (saved === 'light') {
            document.documentElement.dataset.theme = 'light';
            document.documentElement.style.backgroundColor = '#fdfdff';
          }
        } catch (e) {}
      })();
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
      ${bootShellStyle}
    </head>
    <body>
      <div id="root"></div>
      ${bootShell}
    </body>
  </html>
  `;
}
