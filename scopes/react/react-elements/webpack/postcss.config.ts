export const postCssConfig = {
  // Necessary for external CSS imports to work
  // https://github.com/facebook/create-react-app/issues/2677
  ident: 'postcss',
  plugins: [
    // eslint-disable-next-line global-require
    require.resolve('postcss-flexbugs-fixes'),
    // eslint-disable-next-line global-require
    require('postcss-preset-env')({
      autoprefixer: {
        flexbox: 'no-2009',
      },
      stage: 3,
    }),
    // Adds PostCSS Normalize as the reset css with default options,
    // so that it honors browserslist config in package.json
    // which in turn let's users customize the target behavior as per their needs.
    require.resolve('postcss-normalize'),
  ],
};
