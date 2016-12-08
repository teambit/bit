const babel = require('babel-core');
const path = require('path');

function transpile(src) {
  const options = {
    presets: [path.join(__dirname, 'node_modules', 'babel-preset-latest')],
    sourceMaps: true,
    ast: false,
    minified: false,
  };

  return new Promise((resolve, reject) => {
    try {
      const { code, map } = babel.transform(src, options);
      resolve({ code, mappings: map.mappings });
    } catch (e) {
      reject(e);
    }
  });
}

module.exports = {
  transpile
};
