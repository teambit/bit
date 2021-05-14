const presets = [require.resolve('@babel/preset-env'), require.resolve('@babel/preset-react')];
const plugins = [require.resolve('@babel/plugin-proposal-class-properties')];

export const babelConfig = {
  presets,
  plugins,
  sourceMaps: true,
};
