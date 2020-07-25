import { DependencyResolverExtension } from '../dependency-resolver';
import { PnpmPackageManager } from './pnpm.package-manager';
import { PkgExtension } from '../pkg';
import { Logger, LoggerExt } from '../logger';

export class PnpmExtension {
  static id = '@teambit/pnpm';

  static dependencies = [DependencyResolverExtension, PkgExtension, LoggerExt];

  static async provider([depResolver, pkg, logger]: [DependencyResolverExtension, PkgExtension, Logger]) {
    depResolver.registerPackageManager(
      new PnpmPackageManager(depResolver, pkg, logger.createLogPublisher(PnpmExtension.id))
    );

    return new PnpmExtension();
  }
}
