const ComponentFactoryExt = require('bit-bin').ComponentFactoryExt;

module.exports = {
  name: 'nested-extension-level3',
  dependencies: [ComponentFactoryExt],
  provider: async ([component]) => {
    console.log('nested-extension-level3 runs');
  }
};
