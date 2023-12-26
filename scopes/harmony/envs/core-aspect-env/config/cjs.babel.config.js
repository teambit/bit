const babelConfig = require('./base.babel.config');

const { presets, plugins, sourceMaps } = babelConfig;
const newPlugins = [
  [
    require.resolve('@babel/plugin-transform-modules-commonjs'),
    {
      lazy: () => true,
    },
  ],
  ...plugins,
];

const newPresets = presets.concat([
  [
    require.resolve('@babel/preset-env'),
    {
      targets: {
        node: 18,
      },
    },
  ],
]);

module.exports = {
  presets: newPresets,
  plugins: newPlugins,
  sourceMaps,
};
