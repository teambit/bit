module.exports = {
  extends: ['airbnb-typescript', 'plugin:jest/recommended'],
  plugins: ['jest'],
  parserOptions: {
    project: require.resolve('@teambit/react/typescript/tsconfig'),
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
