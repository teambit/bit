import { MainRuntime } from '@teambit/cli';
import type { CloudMain } from '@teambit/cloud';
import { CloudAspect } from '@teambit/cloud';
import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';

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
