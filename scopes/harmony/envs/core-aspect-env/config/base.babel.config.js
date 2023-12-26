const presets = [
  require.resolve('@babel/preset-react'),
  require.resolve('@babel/preset-typescript'),
];
const plugins = [
  require.resolve('babel-plugin-transform-typescript-metadata'),
  [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
  // [require.resolve('@babel/plugin-transform-runtime')],
  [require.resolve('@babel/plugin-transform-object-rest-spread')],
  [require.resolve('@babel/plugin-transform-class-properties')],
];

module.exports = {
  presets,
  plugins,
  sourceMaps: true,
};
