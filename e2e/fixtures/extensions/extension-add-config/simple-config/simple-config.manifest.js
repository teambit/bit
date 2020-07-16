const { getDeclarationCoreExtension } = require('bit-bin');
const PkgExtension = getDeclarationCoreExtension('@teambit/pkg');

module.exports = {
  name: 'simple config',
  dependencies: [PkgExtension],
  provider: async ([pkg]) => {
    pkg.registerPackageJsonNewProps({ 'my-custom-key': 'my-custom-val' });
  }
};
