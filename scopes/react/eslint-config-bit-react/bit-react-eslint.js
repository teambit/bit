// As object
module.exports = {
  extends: ['plugin:jest/recommended'],
  plugins: ['jest'],
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs'],
      extends: [require.resolve('eslint-config-airbnb-typescript')],
      rules: {
        '@typescript-eslint/camelcase': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/prefer-default-export': 'off',
      },
    },
    {
      files: ['*.md', '*.mdx'],
      extends: ['plugin:mdx/recommended'],
      parserOptions: {
        // parser: '@typescript-eslint/parser',
        ecmaVersion: 6,
        sourceType: 'module',
        ecmaFeatures: {
          modules: true,
        },
        extensions: ['.md', '.mdx'],
      },
    },
  ],
  parserOptions: {
    warnOnUnsupportedTypeScriptVersion: false,
    ecmaFeatures: {
      jsx: true,
    },
    parser: require.resolve('@typescript-eslint/parser'),
    extraFileExtensions: ['.md', '.mdx'],
    // createDefaultProgram: true,
    // Should be provided by the extender eslint
    // we can't calculate the tsconfig path here
    // project: `${tsconfigPath}`,
  },
  settings: {
    jest: {
      version: 26,
    },
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
