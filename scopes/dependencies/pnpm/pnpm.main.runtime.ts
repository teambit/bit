import { MainRuntime } from '@teambit/cli';
import { CloudAspect, CloudMain } from '@teambit/cloud';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { LoggerAspect, LoggerMain } from '@teambit/logger';

import { PnpmAspect } from './pnpm.aspect';
import { PnpmPackageManager } from './pnpm.package-manager';

export class PnpmMain {
  static runtime = MainRuntime;
  static dependencies = [DependencyResolverAspect, LoggerAspect, CloudAspect];

  static async provider([depResolver, loggerExt, cloud]: [DependencyResolverMain, LoggerMain, CloudMain]) {
    const logger = loggerExt.createLogger(PnpmAspect.id);
    const packageManager = new PnpmPackageManager(depResolver, logger, cloud);
    depResolver.registerPackageManager(packageManager);
    return new PnpmMain(packageManager);
  }

  constructor(private packageManager: PnpmPackageManager) {}

  getPackageManager(): PnpmPackageManager {
    return this.packageManager;
  }
}

PnpmAspect.addRuntime(PnpmMain);
