/* eslint-disable global-require */

const basePresets = [
  [require('@babel/preset-react'), { runtime: 'automatic' }],
  require('@babel/preset-typescript'),
  require('babel-preset-jest'),
];

module.exports = {
  basePresets,
};
