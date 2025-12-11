const reactCjsConfig = require('@teambit/react/jest/jest.cjs.config');

const config = { ...reactCjsConfig, testEnvironment: 'node', setupFiles: [] };

module.exports = config;
