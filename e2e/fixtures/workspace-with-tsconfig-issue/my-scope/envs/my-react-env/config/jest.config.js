/**
 * @see https://bit.dev/reference/jest/jest-config
 */
const { jestConfig } = require('@teambit/react.react-env');

const {
  generateNodeModulesPattern,
} = require('@teambit/dependencies.modules.packages-excluder');
const packagesToExclude = ['a-package-to-exclude'];

/**
 * by default, jest excludes all node_modules from the transform (compilation) process.
 * the following config excludes all node_modules, except for Bit components, style modules, and the packages that are listed.
 */
module.exports = {
  ...jestConfig,
  transformIgnorePatterns: [
    '^.+.module.(css|sass|scss)$',
    generateNodeModulesPattern({
      packages: packagesToExclude,
      excludeComponents: true,
    }),
  ],
};
