const babelConfig = require('./base.babel.config');

const { presets, plugins, sourceMaps } = babelConfig;
const newPresets = presets.concat([
  [
    require.resolve('@babel/preset-env'),
    {
      modules: false,
      targets: {
        node: 20,
      },
    },
  ],
]);

const config = {
  presets: newPresets,
  plugins,
  sourceMaps,
};

module.exports = config;
