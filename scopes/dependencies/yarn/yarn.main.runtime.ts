import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { MainRuntime } from '@teambit/cli';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { LoggerAspect, LoggerMain } from '@teambit/logger';
import { YarnPackageManager } from './yarn.package-manager';
import { YarnAspect } from './yarn.aspect';

export class YarnMain {
  static dependencies = [DependencyResolverAspect, PkgAspect, LoggerAspect];

  static runtime = MainRuntime;

  static async provider([depResolver, pkg, loggerExt]: [DependencyResolverMain, PkgMain, LoggerMain]) {
    const logger = loggerExt.createLogger(YarnAspect.id);
    depResolver.registerPackageManager(new YarnPackageManager(depResolver, pkg, logger));
    return new YarnMain();
  }
}

YarnAspect.addRuntime(YarnMain);
