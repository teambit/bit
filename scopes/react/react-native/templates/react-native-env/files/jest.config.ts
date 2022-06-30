export function jestConfigFile() {
  return `
  // Override the Jest config to ignore transpiling from specific folders
  // See the base Jest config: https://bit.cloud/teambit/react/react-native/~code/jest/jest.config.js

  // const reactNativeJestConfig = require('@teambit/react-native/jest/jest.config');
  // uncomment the line below and install the package if you want to use this function
  // const {
  //   generateNodeModulesPattern,
  // } = require('@teambit/dependencies.modules.packages-excluder');
  // const packagesToExclude = ['@react-native', 'react-native', 'react-native-button', '@my-org', 'my-package-name'];

  // module.exports = {
  //   ...reactNativeJestConfig,
  //   transformIgnorePatterns: [
  //     '<rootDir>/' + generateNodeModulesPattern({packages: packagesToExclude}),
  //   ],
  // };
  `;
}
