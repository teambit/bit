import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { YarnPackageManager } from './yarn.package-manager';
import { MainRuntime } from '@teambit/cli';
import { PkgAspect, PkgMain } from '@teambit/pkg';
import { YarnAspect } from './yarn.aspect';

export class YarnMain {
  static dependencies = [DependencyResolverAspect, PkgAspect];

  static runtime = MainRuntime;

  static async provider([depResolver, pkg]: [DependencyResolverMain, PkgMain]) {
    depResolver.registerPackageManager(new YarnPackageManager(depResolver, pkg));
    return new YarnMain();
  }
}

YarnAspect.addRuntime(YarnMain);
