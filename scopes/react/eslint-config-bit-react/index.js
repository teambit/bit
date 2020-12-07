module.exports = {
  extends: [require.resolve('eslint-config-airbnb-typescript'), 'plugin:jest/recommended'],
  plugins: ['jest'],
  parserOptions: {
    warnOnUnsupportedTypeScriptVersion: false,
    // enable jsx.
    ecmaFeatures: {
      jsx: true,
    },
    // this is used to allow the eslint to lint component files from the workspace.
    // as they does not exist relative to the project path.
    createDefaultProgram: true,
    // resolve the env tsconfig.
    project: require.resolve('../typescript/tsconfig.json'),
  },
  settings: {
    jest: {
      version: 26,
    },
  },
  rules: {
    '@typescript-eslint/camelcase': 'off',
    'import/no-extraneous-dependencies': 'off',
    'import/prefer-default-export': 'off',
  },
  env: {
    'jest/globals': true,
  },
};
