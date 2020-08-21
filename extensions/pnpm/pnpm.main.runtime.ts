import { PnpmAspect } from './pnpm.aspect';
import { MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { PnpmPackageManager } from './pnpm.package-manager';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { LoggerAspect, LoggerMain } from '@teambit/logger';

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
