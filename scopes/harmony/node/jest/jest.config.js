const reactCjsConfig = require('@teambit/react/jest/jest.cjs.config');

const config = { ...reactCjsConfig, testEnvironment: require.resolve('jest-environment-node'), setupFiles: [] };

module.exports = config;
