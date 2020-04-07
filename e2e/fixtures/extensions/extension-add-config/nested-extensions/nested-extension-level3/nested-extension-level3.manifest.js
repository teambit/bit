const ComponentFactoryExt = require('bit-bin').ComponentFactoryExt;

module.exports = {
  name: 'nested-extension-level3',
  dependencies: [ComponentFactoryExt],
  provider: async ([component]) => {
    console.log('nested-extension-level3 runs');
    component.registerAddConfig('nested-extension-level3', config => {
      console.log('config registration hook is running for level 3');
      return {
        'my-custom-key-l3': 'my-custom-val-l3'
      };
    });
  }
};
