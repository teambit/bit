import path from 'path';
import { Configuration } from 'webpack';
import { ComponentID } from '@teambit/component-id';
// Make sure the bit-react-transformer is a dependency
// TODO: remove it once we can set policy from component to component then set it via the component.json
import '@teambit/react.babel.bit-react-transformer';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
// export default function (workDir: string, envId: string): Configuration {
export default function (workDir: string, envId: string, componentsDirs: string[]): Configuration {
  return {
    module: {
      rules: [
        {
          test: /\.js$/,
          enforce: 'pre',
          // limit loader to files in the current project,
          // to skip any files linked from other projects (like Bit itself)
          include: path.join(workDir, 'node_modules'),
          // only apply to packages with componentId in their package.json (ie. bit components)
          descriptionData: { componentId: (value) => !!value },
          use: [require.resolve('source-map-loader')],
        },
        {
          test: /\.js$/,
          // limit loader to files in the current project,
          // to skip any files linked from other projects (like Bit itself)
          include: path.join(workDir, 'node_modules'),
          // only apply to packages with componentId in their package.json (ie. bit components)
          descriptionData: { componentId: ComponentID.isValidObject },
          use: [
            {
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                plugins: [
                  require.resolve('react-refresh/babel'),
                  // for component highlighting in preview.
                  [require.resolve('@teambit/react.babel.bit-react-transformer')],
                ],
                // turn off all optimizations (only slow down for node_modules)
                compact: false,
                minified: false,
              },
            },
          ],
        },
        // MDX support (move to the mdx aspect and extend from there)
        {
          test: /\.mdx?$/,
          // to skip any files linked from other projects (like Bit itself)
          include: path.join(workDir, 'node_modules'),
          // only apply to packages with componentId in their package.json (ie. bit components)
          descriptionData: { componentId: (value) => !!value },
          use: [
            {
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                presets: [require.resolve('@babel/preset-react'), require.resolve('@babel/preset-env')],
                plugins: [require.resolve('react-refresh/babel')],
              },
            },
            {
              loader: require.resolve('@teambit/mdx.modules.mdx-loader'),
            },
          ],
        },
      ],
    },
    plugins: [
      // No need here as we have `hot: true` in the dev server
      // new webpack.HotModuleReplacementPlugin({}),
      new ReactRefreshWebpackPlugin({
        overlay: {
          sockPath: `_hmr/${envId}`,
          // TODO: check why webpackHotDevClient and react-error-overlay are not responding for runtime
          // errors
          entry: require.resolve('./react-hot-dev-client'),
          module: require.resolve('./refresh'),
        },

        // // having no value for include, exclude === revert to the defaults!
        // // original/defaults values:
        // include: /\.([cm]js|[jt]sx?|flow)$/i,
        // exclude: /node_modules/,

        include: componentsDirs,
        exclude: [
          // prevent recursion:
          /react-refresh-webpack-plugin/i,
          // file type filtering was done by `include`, so need to negative-filter them out here
          // A lookbehind assertion (`?<!`) has to be fixed width
          /(?<!\.mdx)(?<!\.js)$/i,
        ],
      }),
    ],
  };
}
