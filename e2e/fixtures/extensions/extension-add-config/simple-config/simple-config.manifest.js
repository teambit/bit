const { getDeclarationCoreExtension } = require('bit-bin');
console.log('im here');
const PkgExtension = getDeclarationCoreExtension('@teambit/pkg');

module.exports = {
  name: 'simple config',
  dependencies: [PkgExtension],
  provider: async ([pkg]) => {
    console.log('simple config runs');
    pkg.registerPackageJsonNewProps({ 'my-custom-key': 'my-custom-val' });
  }
};
