module.exports = function html(title, components) {
  return ({ htmlWebpackPlugin }) => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      <script>
      // Allow to use react devtools inside the examples
      window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = window.parent.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      </script>
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>  
  `;
};
