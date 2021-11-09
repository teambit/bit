import { BuilderAspect } from '@teambit/builder';
import { MainRuntime } from '@teambit/cli';
import { WebpackAspect } from '@teambit/webpack';
import ScopeAspect from '@teambit/scope';
import { ModuleFederationAspect } from './module-federation.aspect';
import { ExpressAspect } from '@teambit/express';

export class ModuleFederationMain {
  createMFBuildTask() {}

  static runtime = MainRuntime;
  static dependencies = [ScopeAspect, BuilderAspect, WebpackAspect, ExpressAspect];

  // static async provider([scope, builder, webpack, express]: [ScopeMain, BuilderMain, WebpackMain, ExpressMain]) {
  static async provider() {
    // scope.
    return new ModuleFederationMain();
  }
}

ModuleFederationAspect.addRuntime(ModuleFederationMain);
