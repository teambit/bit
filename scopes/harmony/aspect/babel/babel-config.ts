const presets = [
  require.resolve('@babel/preset-react'),
  require.resolve('@babel/preset-typescript'),
  [
    require.resolve('@babel/preset-env'),
    {
      targets: {
        node: 16,
      },
      // useBuiltIns: 'usage',
      // corejs: 3,
    },
  ],
];
const plugins = [
  [
    require.resolve('@babel/plugin-transform-modules-commonjs'),
    {
      lazy: () => true,
    },
  ],
  require.resolve('babel-plugin-transform-typescript-metadata'),
  [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
  // [require.resolve('@babel/plugin-transform-runtime')],
  [require.resolve('@babel/plugin-transform-object-rest-spread')],
  [require.resolve('@babel/plugin-transform-class-properties')],
];

export const babelConfig = {
  presets,
  plugins,
  sourceMaps: true,
};
