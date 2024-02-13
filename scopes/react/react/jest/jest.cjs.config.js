const baseConfig = require('./jest.base.config');

const cjsTransformer = require.resolve('./transformers/cjs-transformer');

const cjsTransform = { ...baseConfig.transform, '^.+\\.(js|jsx|ts|tsx|cjs)$': cjsTransformer };
const cjsConfig = { ...baseConfig, transform: cjsTransform };

module.exports = cjsConfig;
