// self-contained jest config (previously extended @teambit/node's config, which extended
// @teambit/react's - both are no longer core aspects). @teambit/react.jest.react-jest is a
// babel-transform preset package, it doesn't depend on the react runtime.
const { cjsConfig } = require('@teambit/react.jest.react-jest');
const { generateNodeModulesPattern } = require('@teambit/dependencies.modules.packages-excluder');

const packagesToExclude = ['@teambit'];

module.exports = {
  ...cjsConfig,
  testEnvironment: 'node',
  setupFiles: [],
  transformIgnorePatterns: [
    '^.+.module.(css|sass|scss)$',
    generateNodeModulesPattern({
      packages: packagesToExclude,
      excludeComponents: true,
    }),
  ],
};
