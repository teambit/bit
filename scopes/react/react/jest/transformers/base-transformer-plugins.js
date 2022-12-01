/* eslint-disable global-require */

const basePlugins = [
  [require('babel-plugin-transform-typescript-metadata')],
  [require('@babel/plugin-proposal-decorators'), { legacy: true }],
  // [require('@babel/plugin-transform-runtime')],
  [require('@babel/plugin-proposal-object-rest-spread')],
  [require('@babel/plugin-proposal-class-properties')],
];

module.exports = {
  basePlugins,
};
