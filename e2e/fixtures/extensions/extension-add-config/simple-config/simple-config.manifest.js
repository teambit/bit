const { getCoreExtension } = require('bit-bin');
const PkgExtension = getCoreExtension('@teambit/pkg');

module.exports = {
  name: 'simple config',
  dependencies: [PkgExtension],
  provider: async ([pkg]) => {
    console.log('simple config runs');
    pkg.registerPackageJsonNewProps({ 'my-custom-key': 'my-custom-val' });
  }
};
