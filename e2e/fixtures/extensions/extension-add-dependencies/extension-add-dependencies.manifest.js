const { getDeclarationCoreExtension } = require('bit-bin');
const DependencyResolverExtension = getDeclarationCoreExtension('@teambit/dependency-resolver');

module.exports = {
  name: 'extension-add-dependencies',
  dependencies: [DependencyResolverExtension],
  provider: async ([dependencyResolver]) => {
    dependencyResolver.registerDependenciesPolicies({
      dependencies: {
        'lodash.get': '1.0.0'
      },
      devDependencies: {
        'lodash.words': '1.0.0'
      },
      peerDependencies: {
        'lodash.set': '1.0.0'
      }
    });
  }
};
