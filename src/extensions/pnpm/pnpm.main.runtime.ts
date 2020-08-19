import { PnpmAspect } from './pnpm.aspect';
import { MainRuntime } from '../cli/cli.aspect';
import { DependencyResolverAspect, DependencyResolverMain } from '../dependency-resolver';
import { PnpmPackageManager } from './pnpm.package-manager';
import { PkgAspect, PkgMain } from '../pkg';
import { LoggerAspect, LoggerMain } from '../logger';

export class PnpmMain {
  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect, PkgAspect, LoggerAspect];

  static async provider([depResolver, pkg, loggerExt]: [DependencyResolverMain, PkgMain, LoggerMain]) {
    const logger = loggerExt.createLogger(PnpmAspect.id);
    depResolver.registerPackageManager(new PnpmPackageManager(depResolver, pkg, logger));
    return new PnpmMain();
  }
}

PnpmAspect.addRuntime(PnpmMain);
