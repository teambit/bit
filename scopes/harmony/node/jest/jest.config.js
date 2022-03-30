const { jestCjsConfig } = require('@teambit/react');

const config = { ...jestCjsConfig, testEnvironment: require.resolve('jest-environment-node'), setupFiles: [] };

module.exports = config;
