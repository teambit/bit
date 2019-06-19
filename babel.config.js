module.exports = function (api) {
  api.cache(true);

  const presets = [
    [
      '@babel/preset-env',
      {
        targets: {
          node: 10
        }
      }
    ],
    '@babel/preset-flow'
  ];
  const plugins = [
    ['@babel/plugin-transform-flow-strip-types'],
    [
      '@babel/plugin-transform-modules-commonjs',
      {
        lazy: () => true
      }
    ],
    ['@babel/plugin-transform-runtime'],
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
    only: ['**/*.js'],
    ignore: ['components/*']
  };
};
