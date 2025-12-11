import type { DependencyResolverMain } from '@teambit/dependency-resolver';
import { DependencyResolverAspect } from '@teambit/dependency-resolver';
import { MainRuntime } from '@teambit/cli';
import type { LoggerMain } from '@teambit/logger';
import { LoggerAspect } from '@teambit/logger';
import { YarnPackageManager } from './yarn.package-manager';
import { YarnAspect } from './yarn.aspect';

export class YarnMain {
  static dependencies = [DependencyResolverAspect, LoggerAspect];

  static runtime = MainRuntime;

  static async provider([depResolver, loggerExt]: [DependencyResolverMain, LoggerMain]) {
    const logger = loggerExt.createLogger(YarnAspect.id);
    depResolver.registerPackageManager(new YarnPackageManager(depResolver, logger));
    return new YarnMain();
  }
}

YarnAspect.addRuntime(YarnMain);
