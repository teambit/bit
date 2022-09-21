import { MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { PkgAspect, PkgMain } from '@teambit/pkg';

import { PnpmAspect } from './pnpm.aspect';
import { PnpmPackageManager } from './pnpm.package-manager';

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
