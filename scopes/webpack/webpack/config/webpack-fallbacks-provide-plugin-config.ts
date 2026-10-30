/**
 * @deprecated `@teambit/webpack.webpack-bundler` ships its own copy of this and no longer reads
 * it from here. Kept only for backward-compatible `from '@teambit/webpack'` imports.
 */
export const fallbacksProvidePluginConfig = {
  process: require.resolve('process/browser'),
  Buffer: [require.resolve('buffer/'), 'Buffer'],
};
