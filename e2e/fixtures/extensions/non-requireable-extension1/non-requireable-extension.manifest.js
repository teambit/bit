throw new Error('error by purpose');

module.exports = {
  name: 'non-requireable-extension',
  dependencies: [],
  provider: async () => {
    console.log('dummy extension runs');
  }
};
