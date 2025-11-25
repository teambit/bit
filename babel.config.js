module.exports = function (api) {
  api.cache(true);

  const presets = [
    '@babel/preset-react',
    '@babel/typescript',
    [
      '@babel/preset-env',
      {
        targets: {
          node: 20,
        },
        useBuiltIns: 'usage',
        corejs: 3,
      },
    ],
  ];
  const plugins = [
    [
      '@babel/plugin-transform-modules-commonjs',
      {
        lazy: () => true,
      },
    ],
    'babel-plugin-transform-typescript-metadata',
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['@babel/plugin-transform-runtime'],
    ['@babel/plugin-transform-object-rest-spread'],
    ['@babel/plugin-transform-class-properties'],
  ];

  return {
    presets,
    plugins,
    only: ['**/*.ts', '**/*.tsx'],
    ignore: ['components/*'],
  };
};
