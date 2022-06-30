const baseConfig = require('./jest.base.config');

const cjsTransformer = require.resolve('./transformers/cjs-transformer.js');

const cjsTransform = { ...baseConfig.transform, '^.+\\.(js|jsx|ts|tsx)$': cjsTransformer };
const cjsConfig = { ...baseConfig, transform: cjsTransform };

module.exports = cjsConfig;
