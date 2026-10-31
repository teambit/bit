const defender = require('node:module').createRequire(installation.resolve('@teambit/defender.jest-tester'));
const react = require('node:module').createRequire(installation.resolve('@teambit/react.jest.react-jest'));
const presets = [
  [react('@babel/preset-react'), { runtime: 'automatic' }],
  defender('@babel/preset-typescript'),
  defender('babel-preset-jest'),
  [defender('@babel/preset-env'), { targets: { node: 16 } }],
];
const plugins = [
  [defender('@babel/plugin-transform-modules-commonjs')],
  [defender('babel-plugin-transform-typescript-metadata')],
  [defender('@babel/plugin-proposal-decorators'), { legacy: true }],
  [defender('@babel/plugin-transform-object-rest-spread')],
  [defender('@babel/plugin-transform-class-properties')],
];
module.exports = {
  process: (source, filename) => defender('@babel/core').transform(source, {
    sourceMap: 'inline', filename, presets, plugins, babelrc: false, configFile: false,
  }) || { code: source },
};
