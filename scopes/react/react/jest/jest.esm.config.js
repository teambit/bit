const baseConfig = require('./jest.base.config');

const esmTransformer = require.resolve('./transformers/esm-transformer.js');
const esmTransform = { ...baseConfig.transform, '^.+\\.(js|jsx|ts|tsx)$': esmTransformer };
const esmConfig = { ...baseConfig, transform: esmTransform };

module.exports = esmConfig;
