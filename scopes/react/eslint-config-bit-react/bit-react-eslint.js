const configs = require('eslint-plugin-mdx/lib/configs');

module.exports = {
  extends: ['plugin:jest/recommended'],
  plugins: ['jest'],
  settings: {
    'mdx/code-blocks': true,
    jest: {
      version: 27,
    },
    react: {
      version: '17.0',
    },
  },
  env: {
    'jest/globals': true,
    browser: true,
    mocha: true,
    node: true,
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs'],
      extends: [require.resolve('eslint-config-airbnb-typescript'), require.resolve('eslint-config-prettier')],
      parser: require.resolve('@typescript-eslint/parser'),

      parserOptions: {
        warnOnUnsupportedTypeScriptVersion: false,
        ecmaVersion: 6,
        sourceType: 'module',
        ecmaFeatures: {
          modules: true,
          jsx: true,
        },
        // createDefaultProgram: true,
        // Should be provided by the extender eslint
        // we can't calculate the tsconfig path here
        // project: `${tsconfigPath}`,
      },

      rules: {
        '@typescript-eslint/camelcase': 'off',
        'import/no-extraneous-dependencies': 'off',
        'import/prefer-default-export': 'off',
        'react/jsx-props-no-spreading': 'off',
        'react/no-array-index-key': 'off',
        'trailing-comma': 'off',
        '@typescript-eslint/comma-dangle': 'off',
        'object-curly-newline': 'off',
        'react/react-in-jsx-scope': 'off',
        'class-methods-use-this': 'off',
        'arrow-body-style': 'off',
        'prefer-arrow-callback': 'off',
        'no-underscore-dangle': 'off',
        // Disable the rule because this causes issues in case there are multiple eslint versions
        // on the process, as it depends on some outer context.
        // this should be solve once upgrading to @typescript-eslint/eslint-plugin v6
        // see more details here -
        // https://stackoverflow.com/questions/76457373/cannot-read-properties-of-undefined-reading-gettokens-occurred-while-linting
        '@typescript-eslint/no-empty-function': 'off',
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
        // 'no-unused-vars': 'error',
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
