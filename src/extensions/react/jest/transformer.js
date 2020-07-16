const { transform } = require('@babel/core');
const jestPreset = require('babel-preset-jest');
const reactPreset = require('@babel/preset-react');
const presetEnv = require('@babel/preset-env');
const typescriptPreset = require('@babel/preset-typescript');

module.exports = {
  process(src, filename) {
    const result = transform(src, {
      filename,
      presets: [presetEnv, reactPreset, typescriptPreset, jestPreset]
    });

    return result ? result.code : src;
  }
};
