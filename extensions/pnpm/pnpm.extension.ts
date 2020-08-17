import { DependencyResolverExtension } from '@teambit/dependency-resolver';
import { PnpmPackageManager } from './pnpm.package-manager';
import { PkgExtension } from '@teambit/pkg';
import { LoggerExtension } from '@teambit/logger';

export class PnpmExtension {
  static id = '@teambit/pnpm';

  static dependencies = [DependencyResolverExtension, PkgExtension, LoggerExtension];

  static async provider([depResolver, pkg, loggerExt]: [DependencyResolverExtension, PkgExtension, LoggerExtension]) {
    const logger = loggerExt.createLogger(PnpmExtension.id);
    depResolver.registerPackageManager(new PnpmPackageManager(depResolver, pkg, logger));
    return new PnpmExtension();
  }
}
