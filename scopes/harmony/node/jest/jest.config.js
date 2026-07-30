// require via the dist path: the workspace-generated package.json of @teambit/react maps
// subpath exports to .ts sources, so the root-level `jest/jest.cjs.config` is not resolvable there.
const reactCjsConfig = require('@teambit/react/dist/jest/jest.cjs.config.js');

const config = { ...reactCjsConfig, testEnvironment: 'node', setupFiles: [] };

module.exports = config;
