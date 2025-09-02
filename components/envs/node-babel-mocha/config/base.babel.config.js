const presets = [
  require.resolve('@babel/preset-react'),
  require.resolve('@babel/preset-typescript'),
];
const plugins = [];

module.exports = {
  presets,
  plugins,
  sourceMaps: true,
};
