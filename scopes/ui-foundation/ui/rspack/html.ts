/** fallback html template for the main UI, in case ssr is not active */
export function html(title: string, withDevTools?: boolean) {
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
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>
  `;
}
