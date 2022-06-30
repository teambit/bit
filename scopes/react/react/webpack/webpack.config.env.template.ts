import { Configuration } from 'webpack';

export function templateWebpackConfigFactory(): Configuration {
  return {
    name: 'react.env-template',
    output: {
      filename: '[name].[chunkhash].js',
      // might run into this error, when running multiple chunks created by different webpack builds:
      //    "Uncaught TypeError: __webpack_require__.n is not a function"
      // this is because each build creates its own runtime, and they compete on the same global name.
      // setting a separate global name for the template ensures it will not conflict with preview chunks loaded in runtime
      chunkLoadingGlobal: '__loadChunks_EnvTemplate',
    },
  };
}
