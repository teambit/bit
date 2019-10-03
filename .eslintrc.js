module.exports = {
  extends: [
    'airbnb-typescript/base',
    'plugin:@typescript-eslint/recommended',
    'plugin:eslint-comments/recommended',
    'plugin:promise/recommended',
    'plugin:unicorn/recommended',
    'plugin:mocha/recommended',
    'prettier',
    'prettier/@typescript-eslint'
  ],
  plugins: ['@typescript-eslint', 'eslint-comments', 'promise', 'mocha', 'unicorn'],
  rules: {
    // Taken from here: https://github.com/iamturns/create-exposed-app/blob/master/.eslintrc.js
    // Too restrictive, writing ugly code to defend against a very unlikely scenario: https://eslint.org/docs/rules/no-prototype-builtins
    'no-prototype-builtins': 'off',
    // https://basarat.gitbooks.io/typescript/docs/tips/defaultIsBad.html
    'import/prefer-default-export': 'off',
    'import/no-default-export': 'error',
    // Use function hoisting to improve code readability
    'no-use-before-define': ['error', { functions: false, classes: true, variables: true }],
    // Makes no sense to allow type inferrence for expression parameters, but require typing the response
    '@typescript-eslint/explicit-function-return-type': [
      'error',
      { allowExpressions: true, allowTypedFunctionExpressions: true }
    ],
    '@typescript-eslint/no-use-before-define': [
      'error',
      { functions: false, classes: true, variables: true, typedefs: true }
    ],
    // Common abbreviations are known and readable
    'unicorn/prevent-abbreviations': 'off',
    // END taken from https://github.com/iamturns/create-exposed-app/blob/master/.eslintrc.js
    'mocha/no-mocha-arrows': 'off',
    'no-bitwise': 'off',
    'arrow-body-style': [0, 'as-needed'],
    camelcase: [0],
    'no-trailing-spaces': [0],
    'import/no-unresolved': [0],
    radix: [0],
    'no-underscore-dangle': [0],
    'no-param-reassign': [0],
    'no-return-assign': [0, 'except-parens'],
    'array-bracket-spacing': [0],
    'class-methods-use-this': [0],
    'import/no-dynamic-require': [0],
    'global-require': [0],
    'function-paren-newline': [0],
    'object-curly-newline': [0],
    'prefer-arrow-callback': [0],
    'prefer-destructuring': [0],
    'import/no-extraneous-dependencies': [0],
    'comma-dangle': [0, 'never'],
    'no-use-before-define': [0],
    'no-restricted-syntax': [2, 'ForInStatement', 'LabeledStatement', 'WithStatement'],
    'no-unused-expressions': [0],
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
