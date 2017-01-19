const babel = require('babel-core');
const path = require('path');

function compile(src) {
  const options = {
    presets: [path.join(__dirname, 'node_modules', 'babel-preset-latest')],
    sourceMaps: true,
    ast: false,
    minified: false,
  };

  try {
    const { code, map } = babel.transform(src, options);
    return { code, mappings: map.mappings };
  } catch (e) {
    throw e;
  }
}

module.exports = {
  compile
};
