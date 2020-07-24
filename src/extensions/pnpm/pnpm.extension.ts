import { DependencyResolverExtension } from '../dependency-resolver';
import { PnpmPackageManager } from './pnpm.package-manager';

export class PnpmExtension {
  static id = '@teambit/pnpm';

  static dependencies = [DependencyResolverExtension];

  static async provider([depResolver]: [DependencyResolverExtension]) {
    depResolver.registerPackageManager(new PnpmPackageManager(depResolver));
    return new PnpmExtension();
  }
}
