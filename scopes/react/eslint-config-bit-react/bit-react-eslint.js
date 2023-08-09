const configs = require('eslint-plugin-mdx/lib/configs');

module.exports = {
  extends: ['plugin:jest/recommended'],
  plugins: ['jest'],
  settings: {
    'mdx/code-blocks': true,
    jest: {
      version: 26,
    },
  },
  env: {
    'jest/globals': true,
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs'],
      extends: [require.resolve('eslint-config-airbnb-typescript'), require.resolve('eslint-config-prettier')],
      rules: {
        '@typescript-eslint/camelcase': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/prefer-default-export': 'off',
        'react/jsx-props-no-spreading': 'off',
        'trailing-comma': 'off',
        '@typescript-eslint/comma-dangle': 'off',
        'object-curly-newline': 'off',
        'react/react-in-jsx-scope': 'off',
        'class-methods-use-this': 'off',
        'arrow-body-style': 'off',
        'prefer-arrow-callback': 'off',
        'no-underscore-dangle': 'off',
      },
    },
    {
      files: ['*.md', '*.mdx'],
      extends: ['plugin:mdx/recommended', 'plugin:react/recommended'],
      ...configs.overrides,
      rules: {
        ...configs.overrides.rules,
        'react/jsx-uses-vars': 'error',
        'react/jsx-uses-react': 'error',
        'no-unused-vars': 'error',
      },
      // parser: 'eslint-mdx',
      parserOptions: {
        extraFileExtensions: ['.md', '.mdx'],
        ecmaVersion: 6,
        sourceType: 'module',
        ecmaFeatures: {
          modules: true,
          jsx: true,
        },
        extensions: ['.md', '.mdx'],
      },
    },
    {
      files: '**/*.{md,mdx}/**',
      ...configs.codeBlocks,
    },
  ],
};
