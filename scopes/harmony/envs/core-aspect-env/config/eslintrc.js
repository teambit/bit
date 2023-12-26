/**
 * @see https://bit.dev/reference/eslint/eslint-config
 */
module.exports = {
  extends: [require.resolve('@teambit/react.react-env/config/eslintrc')],
  rules: {
    'jest/valid-expect': 'off',
  },
};
