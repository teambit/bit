import { DependencyResolverExtension } from '../dependency-resolver';
import { PnpmPackageManager } from './pnpm.package-manager';
import { PkgExtension } from '../pkg';

export class PnpmExtension {
  static id = '@teambit/pnpm';

  static dependencies = [DependencyResolverExtension, PkgExtension];

  static async provider([depResolver, pkg]: [DependencyResolverExtension, PkgExtension]) {
    depResolver.registerPackageManager(new PnpmPackageManager(depResolver, pkg));
    return new PnpmExtension();
  }
}
