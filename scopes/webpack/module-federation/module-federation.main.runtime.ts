import { BuilderAspect } from '@teambit/builder/dist/builder.aspect.js';
import { MainRuntime } from '@teambit/cli';
import { WebpackAspect } from '@teambit/webpack/dist/webpack.aspect.js';
import { ScopeAspect } from '@teambit/scope/dist/scope.aspect.js';
import { ExpressAspect } from '@teambit/express/dist/express.aspect.js';
import { ModuleFederationAspect } from './module-federation.aspect';

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
