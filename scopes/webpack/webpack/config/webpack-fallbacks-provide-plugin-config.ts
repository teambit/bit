export const fallbacksProvidePluginConfig = {
  process: require.resolve('process/browser'),
  Buffer: [require.resolve('buffer/'), 'Buffer'],
};
