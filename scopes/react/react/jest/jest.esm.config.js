const { esmConfig } = require('@teambit/react.jest.react-jest');
const { generateNodeModulesPattern } = require('@teambit/dependencies.modules.packages-excluder');
const packagesToExclude = ['@teambit'];

module.exports = {
  ...esmConfig,
  transformIgnorePatterns: [
    '^.+.module.(css|sass|scss)$',
    generateNodeModulesPattern({
      packages: packagesToExclude,
      excludeComponents: true,
    }),
  ],
};
