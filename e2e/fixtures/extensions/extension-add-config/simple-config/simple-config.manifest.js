const ComponentFactoryExt = require('bit-bin').ComponentFactoryExt;

module.exports = {
  name: 'simple config',
  dependencies: [ComponentFactoryExt],
  provider: async ([component]) => {
    console.log('simple config runs');
    console.log('got comp ext', component);
    component.registerAddConfig('simple-config', config => {
      console.log('old config', config);
    });
  }
};
