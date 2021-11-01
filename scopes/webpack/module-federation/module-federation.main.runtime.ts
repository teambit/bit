import { BuilderAspect, BuilderMain } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import { WebpackAspect, WebpackMain } from '@teambit/webpack';
import ScopeAspect, { ScopeMain } from '@teambit/scope';
import { ModuleFederationAspect } from './module-federation.aspect';
import { ExpressAspect, ExpressMain } from '@teambit/express';

export class ModuleFederationMain {
  createMFBuildTask() {}

  static runtime = MainRuntime;
  static dependencies = [ScopeAspect, BuilderAspect, WebpackAspect, ExpressAspect];

  static async provider([scope, builder, webpack, express]: [ScopeMain, BuilderMain, WebpackMain, ExpressMain]) {
    // scope.
    return new ModuleFederationMain();
  }
}

ModuleFederationAspect.addRuntime(ModuleFederationMain);
