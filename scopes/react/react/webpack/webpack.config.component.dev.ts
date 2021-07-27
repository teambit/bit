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
            {
              loader: require.resolve('babel-loader'),
              options: {
                babelrc: false,
                configFile: false,
                plugins: [
                  // for component highlighting in preview.
                  [require.resolve('@teambit/react.babel.bit-react-transformer')],
                  [require.resolve('react-refresh/babel')],
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
              },
            },
            {
              loader: require.resolve('@teambit/mdx.modules.mdx-loader'),
            },
          ],
        },
      ],
    },
    // TODO: try to make it work. do not forget when enable this to -
    // 1. enable/uncomment - react-refresh/babel above
    // 2. make sure the react-refresh is a dependency of the react env via component.json
    // 3. pass the envId to this function from react env
    plugins: [
      new ReactRefreshWebpackPlugin({
        overlay: {
          sockPath: `_hmr/${envId}`,
          // TODO: check why webpackHotDevClient and react-error-overlay are not responding for runtime
          // errors
          entry: require.resolve('./react-hot-dev-client'),
          module: require.resolve('./refresh'),
        },
        // include: [/\.(js|jsx|tsx|ts|mdx|md)$/],
        include: path.join(workDir, 'node_modules'),
        // TODO: use a more specific exclude for our selfs
        // exclude: [/dist/, /node_modules/],
        exclude: /asdfasdfs/,
      }),
    ],
  };
}
