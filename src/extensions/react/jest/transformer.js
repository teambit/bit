const { transform } = require('@babel/core');
const jestPreset = require('babel-preset-jest');
const reactPreset = require('@babel/preset-react');
const presetEnv = require('@babel/preset-env');
const transformClassProps = require('@babel/plugin-proposal-class-properties');
const typescriptPreset = require('@babel/preset-typescript');

module.exports = {
  process(src, filename) {
    const result = transform(src, {
      filename,
      presets: [presetEnv, reactPreset, typescriptPreset, jestPreset],
      plugins: [transformClassProps],
    });

    return result ? result.code : src;
  },
};
