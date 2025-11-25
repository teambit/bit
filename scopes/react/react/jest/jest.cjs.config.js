const { cjsConfig } = require('@teambit/react.jest.react-jest');
const { generateNodeModulesPattern } = require('@teambit/dependencies.modules.packages-excluder');
const packagesToExclude = ['@teambit'];

module.exports = {
  ...cjsConfig,
  transformIgnorePatterns: [
    '^.+.module.(css|sass|scss)$',
    generateNodeModulesPattern({
      packages: packagesToExclude,
      excludeComponents: true,
    }),
  ],
};
