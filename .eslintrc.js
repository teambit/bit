module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json'
  },
  extends: [
    'airbnb-typescript/base',
    // 'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/recommended',
    // 'plugin:eslint-comments/recommended',
    'plugin:promise/recommended',
    // 'plugin:unicorn/recommended',
    // 'plugin:mocha/recommended',
    'prettier',
    'prettier/@typescript-eslint'
  ],
  plugins: [
    '@typescript-eslint',
    // 'eslint-comments',
    'promise'
    // 'mocha',
    // 'unicorn'
  ],
  rules: {
    '@typescript-eslint/no-use-before-define': [
      'error',
      { functions: false, classes: true, variables: true, typedefs: true }
    ],

    // ERRORS OF plugin:@typescript-eslint/recommended
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/ban-ts-ignore': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    // END ERRORS OF plugin:@typescript-eslint/recommended

    // ERRORS OF 'plugin:promise/recommended'
    'promise/always-return': 'off',
    'promise/no-nesting': 'off',
    // END ERRORS OF 'plugin:promise/recommended'

    'import/export': 'off', // typescript does allow multiple export default when overloading. not sure why it's enabled here. rule source: https://github.com/benmosher/eslint-plugin-import/blob/master/docs/rules/export.md
    'prefer-object-spread': 'off',
    'import/no-duplicates': 'off',
    '@typescript-eslint/explicit-function-return-type': 'off',
    'import/no-cycle': 'off',
    'import/no-useless-path-segments': 'off',
    'lines-between-class-members': 'off',
    radix: 'off',
    'no-underscore-dangle': 'off',
    'no-param-reassign': 'off',
    'no-return-assign': [0, 'except-parens'],
    'class-methods-use-this': 'off',
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
        ignoreTemplateLiterals: true
      }
    ],
    'max-lines': [2, 1700],
    'func-names': [0]
  },
  env: {
    node: true,
    mocha: true
  }
};
