const ComponentFactoryExt = require('bit-bin').ComponentFactoryExt;

module.exports = {
  name: 'nested-extension-level2',
  dependencies: [ComponentFactoryExt],
  provider: async ([component]) => {
    console.log('nested-extension-level2 runs');
    component.registerAddConfig('nested-extension-level2', config => {
      console.log('config registration hook is running for level 2');
      return {
        'my-custom-key-2': 'my-custom-val-2',
        extensions: {
          'nested-extension-level3': {
            'config-key-for-l3': 'config-val-for-l3'
          }
        }
      };
    });
  }
};
