module.exports = function (api) {
  api.cache(true);

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
      '@babel/plugin-transform-modules-commonjs',
      {
        lazy: () => true,
      },
    ],
    'babel-plugin-transform-typescript-metadata',
    ['@babel/plugin-proposal-decorators', { legacy: true }],
    ['@babel/plugin-transform-runtime'],
    ['@babel/plugin-proposal-object-rest-spread'],
    ['@babel/plugin-proposal-class-properties'],
  ];

  return {
    presets,
    plugins,
    only: ['**/*.ts', '**/*.tsx', 'src/extensions/flows/task/container-script.js'],
    ignore: ['components/*'],
  };
};
