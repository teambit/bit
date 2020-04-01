throw new Error('error by purpose');

module.exports = {
  name: 'dummy-extension',
  dependencies: [],
  provider: async () => {
    console.log('dummy extension runs');
  }
};
