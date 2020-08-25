import { MainRuntime } from 'bit-bin/dist/extensions/cli/cli.aspect';
import { DependencyResolverAspect } from 'bit-bin/dist/extensions/dependency-resolver';
import { ExtensionAddDependenciesAspect } from './extension-add-dependencies.aspect';

export class ExtensionAddDependenciesMain {
  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect];

  static async provider([dependencyResolver]) {
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
}
export default ExtensionAddDependenciesMain;
ExtensionAddDependenciesAspect.addRuntime(ExtensionAddDependenciesMain);
