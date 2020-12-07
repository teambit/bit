const path = require('path');

module.exports = (workspacePath) => {
  return {
    extends: ['eslint-config-airbnb-typescript', 'plugin:jest/recommended'],
    plugins: ['jest'],
    parserOptions: {
      warnOnUnsupportedTypeScriptVersion: false,
      ecmaFeatures: {
        jsx: true,
      },
      // tsconfigRootDir: path.resolve(__dirname, '../typescript'),
      project: `${workspacePath}/tsconfig.json`,
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
};

/**
 * @gilad please set these deps.
 *
 * "eslint-plugin-import": "^2.22.0",
 * "eslint-plugin-jest": "^24.1.0",
 * "@typescript-eslint/eslint-plugin": "^4.4.1",
 * "eslint-plugin-react-hooks": "^4.0.8",
 * "eslint-plugin-react": "^7.20.3",
 * "eslint-plugin-jsx-a11y": "^6.3.1",
 */
