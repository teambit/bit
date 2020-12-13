// As object
module.exports = {
  extends: [require.resolve('eslint-config-airbnb-typescript'), 'plugin:jest/recommended'],
  plugins: ['jest'],
  parserOptions: {
    warnOnUnsupportedTypeScriptVersion: false,
    ecmaFeatures: {
      jsx: true,
    },
    // Should be provided by the extender eslint
    // we can't calculate the tsconfig path here
    // createDefaultProgram: true,
    // project: `${tsconfigPath}`,
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

// As func
// module.exports = (tsconfigPath) => {
//     return {
//       extends: [require.resolve('eslint-config-airbnb-typescript'), 'plugin:jest/recommended'],
//       plugins: ['jest'],
//       parserOptions: {
//         warnOnUnsupportedTypeScriptVersion: false,
//         ecmaFeatures: {
//           jsx: true,
//         },
//         createDefaultProgram: true,
//         project: `${tsconfigPath}`,
//       },
//       settings: {
//         jest: {
//           version: 26,
//         },
//       },
//       rules: {
//         '@typescript-eslint/camelcase': 'off',
//         'import/no-extraneous-dependencies': 'off',
//         'import/prefer-default-export': 'off',
//       },
//       env: {
//         'jest/globals': true,
//       },
//     };
//   };
