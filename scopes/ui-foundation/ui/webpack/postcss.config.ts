import postcssNormalize from 'postcss-normalize';
import postcssPresetEnv from 'postcss-preset-env';
// import postcssFlexbugsFixes from 'postcss-flexbugs-fixes';

const config = {
  // Necessary for external CSS imports to work
  // https://github.com/facebook/create-react-app/issues/2677
  ident: 'postcss',
  plugins: [
    // eslint-disable-next-line global-require
    require('postcss-flexbugs-fixes'),
    postcssPresetEnv({
      autoprefixer: {
        flexbox: 'no-2009',
      },
      stage: 3,
    }),
    // Adds PostCSS Normalize as the reset css with default options,
    // so that it honors browserslist config in package.json
    // which in turn let's users customize the target behavior as per their needs.
    postcssNormalize(),
  ],
};
module.exports = config;
