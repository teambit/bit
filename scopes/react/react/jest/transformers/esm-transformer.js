/* eslint-disable global-require */
/* eslint-disable import/order */

const { basePlugins } = require('./base-transformer-plugins');
const { basePresets } = require('./base-transformer-presets');
const { generateProcessFunc } = require('./base-transformer-process');

const presets = [
  ...basePresets,
  [
    require('@babel/preset-env'),
    {
      modules: false,
      targets: {
        node: 16,
      },
      useBuiltIns: 'usage',
      corejs: 3,
    },
  ],
];

const plugins = basePlugins;

module.exports = {
  process: generateProcessFunc(presets, plugins),
};
