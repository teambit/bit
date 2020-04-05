const ComponentFactoryExt = require('bit-bin').ComponentFactoryExt;

module.exports = {
  name: 'simple config',
  dependencies: [ComponentFactoryExt],
  provider: async ([component]) => {
    console.log('simple config runs');
    component.registerAddConfig('simple-config', config => {
      console.log('config registration hook is running');
    });
  }
};
