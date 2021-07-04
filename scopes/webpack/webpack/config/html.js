module.exports = function html(title) {
  return () => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <script>
      // Allow to use react dev-tools inside the examples
      try { window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__; } catch {}
      </script>
      <!-- minimal css resets -->
      <style> html { height: 100%; } body { margin: 0; height: 100%; } #root { height: 100%; } </style>
      <style>
        body::-webkit-scrollbar {
          display: none;
        }
      </style>
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>  
  `;
};
