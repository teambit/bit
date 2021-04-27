// Using object
import '@teambit/eslint-config-bit-react';

export const eslintConfig = {
  extends: [require.resolve('@teambit/eslint-config-bit-react')],
  parserOptions: {
    createDefaultProgram: true,
    // resolve the env tsconfig.
    project: require.resolve('../typescript/tsconfig.json'),
  },
};

module.exports = eslintConfig;

// Using function
// import generateEslint from '@teambit/eslint-config-bit-react';
// const config = generateEslint(require.resolve('../typescript/tsconfig.json'));
// module.exports = config;
