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
    const packageManager = new PnpmPackageManager(depResolver, logger);
    depResolver.registerPackageManager(packageManager);
    return new PnpmMain(packageManager);
  }

  constructor(private packageManager: PnpmPackageManager) {}

  getPackageManager(): PnpmPackageManager {
    return this.packageManager;
  }
}

PnpmAspect.addRuntime(PnpmMain);
