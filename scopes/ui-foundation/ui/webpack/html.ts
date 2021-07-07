/** fallback html template for the main UI, in case ssr is not active */
export default function html(title: string, withDevTools?: boolean) {
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
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>  
  `;
}
