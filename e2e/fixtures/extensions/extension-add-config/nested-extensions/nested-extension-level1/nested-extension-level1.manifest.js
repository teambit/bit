const ComponentFactoryExt = require('bit-bin').ComponentFactoryExt;

module.exports = {
  name: 'nested-extension-level1',
  dependencies: [ComponentFactoryExt],
  provider: async ([component]) => {
    console.log('nested-extension-level1 runs');
    component.registerAddConfig('nested-extension-level1', config => {
      console.log('config registration hook is running for level 1');
      return {
        'my-custom-key-l1': 'my-custom-val-l1',
        extensions: {
          'nested-extension-level2': {
            'config-key-for-l2': 'config-val-for-l2'
          }
        }
      };
    });
  }
};
