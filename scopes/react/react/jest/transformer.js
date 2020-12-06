/* eslint-disable global-require */
const { transform } = require('@babel/core');

const presets = [
  require('@babel/preset-react'),
  require('@babel/preset-typescript'),
  require('babel-preset-jest'),
  [
    require('@babel/preset-env'),
    {
      targets: {
        node: 12,
      },
      useBuiltIns: 'usage',
      corejs: 3,
    },
  ],
];
const plugins = [
  [require('@babel/plugin-transform-modules-commonjs')],
  [require('babel-plugin-transform-typescript-metadata')],
  [require('@babel/plugin-proposal-decorators'), { legacy: true }],
  [require('@babel/plugin-transform-runtime')],
  [require('@babel/plugin-proposal-object-rest-spread')],
  [require('@babel/plugin-proposal-class-properties')],
];

module.exports = {
  process(src, filename) {
    const result = transform(src, {
      sourceMap: 'inline',
      filename,
      presets,
      plugins,
      babelrc: false,
      configFile: false,
    });

    return result ? result.code : src;
  },
};
