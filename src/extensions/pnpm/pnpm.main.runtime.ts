import { PnpmAspect } from './pnpm.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { DependencyResolverExtension, DependencyResolverAspect, DependencyResolverMain } from '../dependency-resolver';
import { PnpmPackageManager } from './pnpm.package-manager';
import { PkgExtension, PkgAspect } from '../pkg';
import { LoggerExtension, LoggerAspect } from '../logger';

export class PnpmMain {
  static id = '@teambit/pnpm';

  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect, PkgAspect, LoggerAspect];

  static async provider([depResolver, pkg, loggerExt]: [DependencyResolverMain, PkgExtension, LoggerExtension]) {
    const logger = loggerExt.createLogger(PnpmMain.id);
    depResolver.registerPackageManager(new PnpmPackageManager(depResolver, pkg, logger));
    return new PnpmMain();
  }
}

PnpmAspect.addRuntime(PnpmMain);
