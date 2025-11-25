const configs = require('eslint-plugin-mdx/lib/configs');

module.exports = {
  extends: ['plugin:jest/recommended', 'plugin:react-hooks/recommended'],
  plugins: ['jest', 'import'],
  settings: {
    'mdx/code-blocks': false,
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
    es6: true,
  },
  overrides: [
    {
      files: ['*.ts', '*.tsx', '*.js', '*.jsx', '*.mjs'],
      extends: [
        'eslint:recommended',
        'plugin:@typescript-eslint/recommended',
        require.resolve('eslint-config-prettier'),
      ],
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
        '@typescript-eslint/no-unused-vars': 'warn',
        'no-nested-ternary': 'warn',
        'react/self-closing-comp': 'warn',
        'object-shorthand': 'warn',
        'react/jsx-boolean-value': 'warn',
        'react/button-has-type': 'off',
        'react/jsx-props-no-spreading': 'off',
        'react/no-array-index-key': 'off',
        'react/prop-types': 'off',
        'react/require-default-props': 'off',
        'react/react-in-jsx-scope': 'off',

        // ------------------------------------------------------------
        // MIGRATION: eslint-config-airbnb-typescript -> eslint:recommended + @typescript-eslint/recommended
        // Re-enable previously enforced Airbnb rules to reduce churn.
        // These were active under Airbnb but are not included by the new presets.
        // ------------------------------------------------------------
        '@typescript-eslint/no-implied-eval': 'error',
        'no-shadow': 'off', // must disable the base rule as it can report incorrect errors
        '@typescript-eslint/no-shadow': 'error',
        '@typescript-eslint/return-await': 'error', // default is 'in-try-catch'. (in try/catch it must use 'await', otherwise, it must not use await)

        // ------------------------------------------------------------
        // MIGRATION: Disable rules newly enabled by eslint:recommended
        // and @typescript-eslint/recommended to avoid sudden breakage.
        // Turn them back on gradually per project needs.
        // ------------------------------------------------------------
        '@typescript-eslint/ban-ts-comment': 'off',
        '@typescript-eslint/ban-types': 'off',
        '@typescript-eslint/no-var-requires': 'off',
        '@typescript-eslint/no-explicit-any': 'off',

        // ------------------------------------------------------------
        // These rules newly enabled by @typescript-eslint/recommended,
        // but probably won't break much.
        // Feel free to uncomment them to turn them off.
        // ------------------------------------------------------------
        // '@typescript-eslint/no-duplicate-enum-values': 'off',
        // '@typescript-eslint/no-extra-non-null-assertion': 'off',
        // '@typescript-eslint/no-misused-new': 'off',
        // '@typescript-eslint/no-namespace': 'off',
        // '@typescript-eslint/no-non-null-asserted-optional-chain': 'off',
        // '@typescript-eslint/no-this-alias': 'off',
        // '@typescript-eslint/no-unnecessary-type-constraint': 'off',
        // '@typescript-eslint/no-unsafe-declaration-merging': 'off',
        // '@typescript-eslint/prefer-as-const': 'off',
        // '@typescript-eslint/triple-slash-reference': 'off',
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
