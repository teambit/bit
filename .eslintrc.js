module.exports = {
  parser: '@typescript-eslint/parser',
  settings: {
    react: {
      version: 'detect',
    },
    'import/resolver': {
      node: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
      },
    },
  },
  parserOptions: {
    project: require.resolve('./tsconfig.json'),
    // createDefaultProgram: true,
    ecmaFeatures: {
      jsx: true, // Allows for the parsing of JSX
    },
  },
  extends: [
    'airbnb-typescript/base',
    // 'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/recommended',
    // 'plugin:eslint-comments/recommended',
    'plugin:promise/recommended',
    'plugin:react/recommended',
    // 'plugin:unicorn/recommended',
    // 'plugin:mocha/recommended',
    'prettier',
    'prettier/@typescript-eslint',
  ],
  plugins: [
    '@typescript-eslint',
    // 'eslint-comments',
    'promise',
    // 'simple-import-sort',
    // 'mocha',
    // 'unicorn'
  ],
  rules: {
    complexity: ['error', { max: 25 }],
    'no-console': ['error'],
    '@typescript-eslint/no-unused-vars': ['error', { args: 'after-used' }],
    '@typescript-eslint/no-use-before-define': [
      'error',
      { functions: false, classes: true, variables: true, typedefs: true },
    ],
    '@typescript-eslint/return-await': 'error',
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/ban-types': 'off',
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': ['error'],
    // ERRORS OF plugin:@typescript-eslint/recommended
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/camelcase': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    // END ERRORS OF plugin:@typescript-eslint/recommended

    // ERRORS OF 'plugin:promise/recommended'
    'promise/always-return': 'off',
    'promise/no-nesting': 'off',
    // END ERRORS OF 'plugin:promise/recommended'
    'import/prefer-default-export': 'off', // typescript works better without default export
    'import/export': 'off', // typescript does allow multiple export default when overloading. not sure why it's enabled here. rule source: https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/export.md
    'prefer-object-spread': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'import/no-cycle': 'off',
    'import/no-useless-path-segments': 'off',
    'no-restricted-imports': [
      'error',
      {
        name: '@teambit/ui-foundation.ui.react-router.link',
        message: 'use @teambit/base-ui.routing.link',
      },
      {
        name: '@teambit/ui-foundation.ui.react-router.nav-link',
        message: 'use @teambit/base-ui.routing.nav-link',
      },
    ],
    'lines-between-class-members': 'off',
    radix: 'off',
    'no-underscore-dangle': 'off',
    'no-param-reassign': 'off',
    'no-return-assign': [0, 'except-parens'],
    'class-methods-use-this': 'off',
    // 'simple-import-sort/sort': 'error',
    // 'sort-imports': 'off',
    // 'import/first': 'error',
    // 'import/newline-after-import': 'error',
    'import/no-duplicates': 'error',
    'prefer-destructuring': 'off',
    'import/no-extraneous-dependencies': 'off',
    'no-restricted-syntax': [2, 'ForInStatement', 'LabeledStatement', 'WithStatement'],
    'no-unused-expressions': 'off',
    'max-len': [
      2,
      120,
      2,
      {
        ignoreUrls: true,
        ignoreComments: true,
        ignoreRegExpLiterals: true,
        ignoreStrings: true,
        ignoreTemplateLiterals: true,
      },
    ],
    'max-lines': [2, 1800],
    'func-names': [0],

    // ERRORS OF plugin:react/recommended
    'react/no-unescaped-entities': 'off',
  },
  // return the no-cycle once "import type" is working
  // overrides: [
  //   {
  //     files: ['src/extensions/**/*.ts'],
  //     rules: {
  //       'import/no-cycle': ['error']
  //     }
  //   }
  // ],
  env: {
    browser: true,
    node: true,
    mocha: true,
  },
};
