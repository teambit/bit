/** html template for Previews (docs, compositions, etc) */
export function html(title: string) {
  return `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title}</title>
      <script>
      // Allow to use react dev-tools inside the examples
      try { window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__; } catch {}
      </script>
      <!-- minimal css resets -->
      <style> body { margin: 0; } </style>
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>
  `;
}

// <style> html { height: 100%; } body { margin: 0; height: 100%; } #root { height: 100%; } </style>
