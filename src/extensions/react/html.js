module.exports = function html(title, components) {
  return ({ htmlWebpackPlugin }) => `
  <!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>${title}</title>
      
    </head>
    <body>
      <div id="root"></div>
    </body>
  </html>  
  `;
};
