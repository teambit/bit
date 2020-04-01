module.exports = {
  name: 'extension-provider-error',
  dependencies: [],
  provider: async () => {
    throw new Error('error in provider');
  }
};
