const reactJestConfig = require('@teambit/react/jest/jest.cjs.config');
// uncomment the line below and install the package if you want to use this function
// const {
//   generateNodeModulesPattern,
// } = require('@teambit/dependencies.modules.packages-excluder');
// const packagesToExclude = ['@my-org', 'my-package-name'];

module.exports = {
  ...reactJestConfig
};
