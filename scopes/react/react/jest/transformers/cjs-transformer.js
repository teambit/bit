/* eslint-disable import/order */
/* eslint-disable global-require */
const { generateProcessFunc } = require('./base-transformer-process');
const { basePlugins } = require('./base-transformer-plugins');
const { basePresets } = require('./base-transformer-presets');

const presets = [
  ...basePresets,
  [
    require('@babel/preset-env'),
    {
      targets: {
        node: 16,
      },
      // useBuiltIns: 'usage',
      // corejs: 3,
    },
  ],
];

const plugins = [[require('@babel/plugin-transform-modules-commonjs')], ...basePlugins];

module.exports = {
  process: generateProcessFunc(presets, plugins),
};
