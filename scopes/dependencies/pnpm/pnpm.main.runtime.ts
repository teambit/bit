import { MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { LoggerAspect, LoggerMain } from '@teambit/logger';

import { PnpmAspect } from './pnpm.aspect';
import { PnpmPackageManager } from './pnpm.package-manager';

export class PnpmMain {
  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect, LoggerAspect];

  static async provider([depResolver, loggerExt]: [DependencyResolverMain, LoggerMain]) {
    const logger = loggerExt.createLogger(PnpmAspect.id);
    depResolver.registerPackageManager(new PnpmPackageManager(depResolver, logger));
    return new PnpmMain();
  }
}

PnpmAspect.addRuntime(PnpmMain);
