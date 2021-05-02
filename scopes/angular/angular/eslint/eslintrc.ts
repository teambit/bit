// Using object
import '@teambit/eslint-config-bit-angular';

export const eslintConfig = {
  extends: [require.resolve('@teambit/eslint-config-bit-angular')],
  parserOptions: {
    createDefaultProgram: true,
    // resolve the env tsconfig.
    project: require.resolve('../typescript/tsconfig.json'),
  },
};

module.exports = eslintConfig;
