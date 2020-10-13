const presets = [
  '@babel/preset-react',
  '@babel/typescript',
  [
    '@babel/preset-env',
    {
      targets: {
        node: 8,
      },
      useBuiltIns: 'usage',
      corejs: 3,
    },
  ],
];
const plugins = [
  [
    require.resolve('@babel/plugin-transform-modules-commonjs'),
    {
      lazy: (requirePath) => {
        return !requirePath.includes('.ui') && !requirePath.includes('.preview');
      },
    },
  ],
  require.resolve('babel-plugin-transform-typescript-metadata'),
  [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
  [require.resolve('@babel/plugin-transform-runtime')],
  [require.resolve('@babel/plugin-proposal-object-rest-spread')],
  [require.resolve('@babel/plugin-proposal-class-properties')],
  [require.resolve('@babel/plugin-transform-async-to-generator')],
];

const only = ['**/*.ts', '**/*.tsx'];

export const babelConfig = {
  presets,
  plugins,
  only,
  sourceMaps: true,
};
