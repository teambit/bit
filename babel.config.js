module.exports = function (api) {
  api.cache(true);

  const presets = [
    '@babel/typescript',
    [
      '@babel/preset-env',
      {
        targets: {
          node: 8
        }
      }
    ]
  ];
  const plugins = [
    [
      '@babel/plugin-transform-modules-commonjs',
      {
        lazy: () => true
      }
    ],
    ['@babel/plugin-transform-runtime'],
    ['@babel/plugin-proposal-object-rest-spread'],
    ['@babel/plugin-proposal-class-properties'],
    [
      '@babel/plugin-transform-async-to-generator',
      {
        module: 'bluebird',
        method: 'coroutine'
      }
    ]
  ];

  return {
    presets,
    plugins,
    only: ['**/*.ts'],
    ignore: ['components/*']
  };
};
