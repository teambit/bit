/**
 * this is NOT the config for your components.
 * it is only used by your IDE, for a better development experience.
 * to change your component linting, customize your env.
 * @see https://bit.dev/reference/eslint/eslint-config
 */
module.exports = {
  extends: ['@teambit/react.react-env/config/eslintrc.js'],
  parserOptions: {
    project: './tsconfig.json'
  },
}