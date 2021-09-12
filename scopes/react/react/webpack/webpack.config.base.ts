import { Configuration, IgnorePlugin } from 'webpack';
import { cssLoaders } from '@teambit/webpack.modules.style-loaders';
import { postCssConfig } from './postcss.config';
// Make sure the bit-react-transformer is a dependency
// TODO: remove it once we can set policy from component to component then set it via the component.json
import '@teambit/react.babel.bit-react-transformer';
// Make sure the mdx-loader is a dependency
import '@teambit/mdx.modules.mdx-loader';

const moduleFileExtensions = [
  'web.mjs',
  'mjs',
  'web.js',
  'js',
  'web.ts',
  'ts',
  'web.tsx',
  'tsx',
  'json',
  'web.jsx',
  'jsx',
  'mdx',
  'md',
];

const imageInlineSizeLimit = parseInt(process.env.IMAGE_INLINE_SIZE_LIMIT || '10000');

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
export default function (isEnvProduction = false): Configuration {
  // Variable used for enabling profiling in Production
  // passed into alias object. Uses a flag if passed into the build command
  const isEnvProductionProfile = process.argv.includes('--profile');

  const { styleLoaders, stylePlugins } = cssLoaders({
    postcssOptions: postCssConfig,
    styleInjector: isEnvProduction ? 'mini-css-extract-plugin' : 'style-loader',
  });

  // We will provide `paths.publicUrlOrPath` to our app
  // as %PUBLIC_URL% in `index.html` and `process.env.PUBLIC_URL` in JavaScript.
  // Omit trailing slash as %PUBLIC_URL%/xyz looks better than %PUBLIC_URL%xyz.
  // Get environment variables to inject into our app.
  // const env = getClientEnvironment(publicUrlOrPath.slice(0, -1));

  return {
    resolve: {
      // These are the reasonable defaults supported by the Node ecosystem.
      // We also include JSX as a common component filename extension to support
      // some tools, although we do not recommend using it, see:
      // https://github.com/facebook/create-react-app/issues/290
      // `web` extension prefixes have been added for better support
      // for React Native Web.
      extensions: moduleFileExtensions.map((ext) => `.${ext}`),

      alias: {
        'react/jsx-dev-runtime': require.resolve('react/jsx-dev-runtime.js'),
        'react/jsx-runtime': require.resolve('react/jsx-runtime.js'),
        // Support React Native Web
        // https://www.smashingmagazine.com/2016/08/a-glimpse-into-the-future-with-react-native-for-web/
        // TODO: @uri please remember to remove after publishing evangelist and base-ui
        react: require.resolve('react'),
        '@teambit/mdx.ui.mdx-scope-context': require.resolve('@teambit/mdx.ui.mdx-scope-context'),
        'react-dom/server': require.resolve('react-dom/server'),
        'react-dom': require.resolve('react-dom'),
        '@mdx-js/react': require.resolve('@mdx-js/react'),

        // Allows for better profiling with ReactDevTools
        ...(isEnvProductionProfile && {
          'react-dom$': 'react-dom/profiling',
          'scheduler/tracing': 'scheduler/tracing-profiling',
        }),
      },
    },
    module: {
      strictExportPresence: true,
      rules: [
        {
          test: /\.m?js/,
          resolve: {
            fullySpecified: false,
          },
        },
        {
          // "oneOf" will traverse all following loaders until one will
          // match the requirements. When no loader matches it will fall
          // back to the "file" loader at the end of the loader list.
          oneOf: [
            // load styles, including scss, less
            ...styleLoaders,

            // MDX support (move to the mdx aspect and extend from there)
            {
              test: /\.mdx?$/,
              exclude: [/node_modules/],
              use: [
                {
                  loader: require.resolve('babel-loader'),
                  options: {
                    babelrc: false,
                    configFile: false,
                    presets: [require.resolve('@babel/preset-react'), require.resolve('@babel/preset-env')],
                  },
                },
                {
                  loader: require.resolve('@teambit/mdx.modules.mdx-loader'),
                },
              ],
            },
            {
              test: [/\.bmp$/, /\.gif$/, /\.jpe?g$/, /\.png$/],
              type: 'asset',
              parser: {
                dataUrlCondition: {
                  maxSize: imageInlineSizeLimit,
                },
              },
            },
            {
              // loads svg as both inlineUrl and react component, like:
              // import starUrl, { ReactComponent as StarIcon } from './star.svg';
              // (remove when there is native support for both opitons from webpack5 / svgr)
              test: /\.svg$/,
              oneOf: [
                {
                  dependency: { not: ['url'] }, // exclude new URL calls
                  use: [
                    {
                      loader: require.resolve('@svgr/webpack'),
                      options: { titleProp: true, ref: true },
                    },
                    require.resolve('new-url-loader'),
                  ],
                },
                {
                  type: 'asset', // export a data URI or emit a separate file
                },
              ],
            },
            // "file" loader makes sure those assets get served by WebpackDevServer.
            // When you `import` an asset, you get its (virtual) filename.
            // In production, they would get copied to the `build` folder.
            // This loader doesn't use a "test" so it will catch all modules
            // that fall through the other loaders.
            {
              // Exclude `js` files to keep "css" loader working as it injects
              // its runtime that would otherwise be processed through "file" loader.
              // Also exclude `html` and `json` extensions so they get processed
              // by webpacks internal loaders.
              exclude: [/\.(js|mjs|jsx|ts|tsx)$/, /\.html$/, /\.mdx?/, /\.json$/, /\.css$/],
              type: 'asset',
            },
            // ** STOP ** Are you adding a new loader?
            // Make sure to add the new loader(s) before the "type:asset" loader.
          ],
        },
      ],
    },
    // @ts-ignore
    plugins: [
      ...stylePlugins,
      // Moment.js is an extremely popular library that bundles large locale files
      // by default due to how webpack interprets its code. This is a practical
      // solution that requires the user to opt into importing specific locales.
      // https://github.com/jmblog/how-to-optimize-momentjs-with-webpack
      // You can remove this if you don't use Moment.js:
      new IgnorePlugin({
        resourceRegExp: /^\.\/locale$/,
        contextRegExp: /moment$/,
      }),
    ].filter(Boolean),
    // Turn off performance processing because we utilize
    // our own hints via the FileSizeReporter
    performance: false,
  };
}
