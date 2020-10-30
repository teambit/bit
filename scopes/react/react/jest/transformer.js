const { transform } = require('@babel/core');

const presets = [
  require.resolve('@babel/preset-react'),
  require.resolve('@babel/preset-typescript'),
  require.resolve('babel-preset-jest'),
  [
    require.resolve('@babel/preset-env'),
    {
      targets: {
        node: 8,
      },
      useBuiltIns: 'usage',
      corejs: 3,
    },
  ],
];
const plugins = [
  [require.resolve('@babel/plugin-transform-modules-commonjs')],
  [require.resolve('babel-plugin-transform-typescript-metadata')],
  [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
  [require.resolve('@babel/plugin-transform-runtime')],
  [require.resolve('@babel/plugin-proposal-object-rest-spread')],
  [require.resolve('@babel/plugin-proposal-class-properties')],
  [require.resolve('@babel/plugin-transform-async-to-generator')],
];

module.exports = {
  process(src, filename) {
    const result = transform(src, {
      filename,
      presets,
      plugins,
      babelrc: false,
      configFile: false,
    });

    return result ? result.code : src;
  },
};
