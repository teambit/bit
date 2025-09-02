/**
 * @see https://bit.dev/reference/eslint/eslint-config
 */
module.exports = {
  extends: [require.resolve('@teambit/react.react-env/config/eslintrc')],
  rules: {
    '@typescript-eslint/lines-between-class-members': 'off',
    'prefer-destructuring': 'off',
    'no-param-reassign': ['error', { "props": false }],
  },
};
