const { transform } = require('@babel/core');

const presets = [
  require.resolve('@babel/preset-react'),
  require.resolve('@babel/preset-typescript'),
  [
    require.resolve('@babel/preset-env'),
    {
      targets: {
        node: 8,
      },
      useBuiltIns: 'usage',
      corejs: 3,
    },
  ],
];

// @todo: it is needed? on bit-bin it works regardless, but on bad-jokes it fails with an error:
// Error: [BABEL] /Users/davidfirst/Library/Caches/Bit/capsules/5e3640683e6a965d934a01a4cb6b74c7d1d5edd1/teambit.bad-jokes_ui-primitives_button/dist/button.spec.jsx: .plugins is not a valid Plugin property

// const plugins = [
//   [require.resolve('@babel/plugin-transform-modules-commonjs')],
//   require.resolve('babel-plugin-transform-typescript-metadata'),
//   [require.resolve('@babel/plugin-proposal-decorators'), { legacy: true }],
//   [require.resolve('@babel/plugin-transform-runtime')],
//   [require.resolve('@babel/plugin-proposal-object-rest-spread')],
//   [require.resolve('@babel/plugin-proposal-class-properties')],
//   [require.resolve('@babel/plugin-transform-async-to-generator')],
//   [require.resolve('babel-preset-jest')],
// ];

module.exports = {
  process(src, filename) {
    const result = transform(src, {
      filename,
      presets,
      // plugins,
    });

    return result ? result.code : src;
  },
};
