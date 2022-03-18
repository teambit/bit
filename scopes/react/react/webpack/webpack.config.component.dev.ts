import path from 'path';
import { Configuration } from 'webpack';
import { ComponentID } from '@teambit/component-id';
// Make sure the bit-react-transformer is a dependency
// TODO: remove it once we can set policy from component to component then set it via the component.json
import '@teambit/react.babel.bit-react-transformer';
import ReactRefreshWebpackPlugin from '@pmmmwh/react-refresh-webpack-plugin';

const matchNothingRegex = 'a^';

// This is the production and development configuration.
// It is focused on developer experience, fast rebuilds, and a minimal bundle.
// eslint-disable-next-line complexity
// export default function (workDir: string, envId: string): Configuration {
export default function (workDir: string, envId: string): Configuration {
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
            require.resolve('@pmmmwh/react-refresh-webpack-plugin/loader'),
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
            require.resolve('@pmmmwh/react-refresh-webpack-plugin/loader'),
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
          // TODO - react-error-overlay not showing runtime errors - https://github.com/teambit/bit/issues/5452
          entry: require.resolve('./overlay/webpackHotDevClient'),
          module: require.resolve('./overlay/refreshOverlayInterop'),
        },

        // we use '@pmmmwh/react-refresh-webpack-plugin/loader' directly where relevant.
        // FYI, original defaults of the plugin are:
        // include: /\.([cm]js|[jt]sx?|flow)$/i, exclude: /node_modules/,
        include: matchNothingRegex,
      }),
    ],
  };
}
