const { jestConfig } = require('@teambit/node');

module.exports = {
  ...jestConfig,
  // transformIgnorePatterns: [
  //   '^.+\.module\.(css|sass|scss)$',
  //   generateNodeModulesPattern({ packages: packagesToExclude }),
  // ],
};
