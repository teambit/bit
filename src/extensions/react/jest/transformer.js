const { transform } = require('@babel/core');
const jestPreset = require('babel-preset-jest');
const reactPreset = require('@babel/preset-react');
const presetEnv = require('@babel/preset-env');
const typescriptPreset = require('@babel/preset-typescript');
const babelJest = require('babel-jest');

module.exports = {
  process(src, filename) {
    const result = transform(src, {
      filename,
      presets: [presetEnv, reactPreset, typescriptPreset, jestPreset]
    });

    return result ? result.code : src;
  }
};

module.exports.x = babelJest.createTransformer({
  babelrc: false,
  presets: [
    [
      require.resolve('@babel/preset-env'),
      {
        modules: false
      }
    ],
    require.resolve('@babel/preset-react'),
    require.resolve('@babel/preset-typescript')
  ]
});
