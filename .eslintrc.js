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
    ecmaFeatures: {
      jsx: true,
    },
  },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:promise/recommended',
    'plugin:react/recommended',
    'plugin:import/recommended',
    'prettier',
  ],
  plugins: ['@typescript-eslint', 'promise'],
  ignorePatterns: ['.eslintrc.js'],
  rules: {
    complexity: ['error', { max: 25 }],
    'no-console': ['error'],
    'no-return-assign': [0, 'except-parens'],
    'no-restricted-syntax': ['error', 'ForInStatement', 'LabeledStatement', 'WithStatement'],
    'max-len': [
      'error',
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
    'max-lines': ['error', 2000],

    // ERRORS OF plugin:@typescript-eslint/recommended
    '@typescript-eslint/ban-ts-comment': 'off',
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/return-await': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { args: 'after-used' }],
    '@typescript-eslint/no-use-before-define': [
      'error',
      { functions: false, classes: true, variables: true, typedefs: true },
    ],
    '@typescript-eslint/no-misused-promises': 'error',
    '@typescript-eslint/no-floating-promises': 'error',
    '@typescript-eslint/consistent-type-imports': [
      'warn',
      {
        prefer: 'type-imports',
        fixStyle: 'separate-type-imports',
      },
    ],
    '@typescript-eslint/no-shadow': ['error'],

    // ERRORS OF 'plugin:promise/recommended'
    'promise/always-return': 'off',
    'promise/no-nesting': 'off',

    // ERRORS OF 'plugin:import/recommended'
    'import/no-duplicates': 'error',

    // ERRORS OF plugin:react/recommended
    'react/prop-types': 'off',
  },
  env: {
    browser: true,
    node: true,
    mocha: true,
  },
};
