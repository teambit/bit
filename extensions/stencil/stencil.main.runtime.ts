import { TranspileOptions } from '@stencil/core/compiler';
import { StencilAspect } from './stencil.aspect';
import { MainRuntime } from '../cli';
import { StencilCompiler } from './stencil.compiler';
import { StencilEnv } from './stencil.env';
import { CompilerAspect } from '../compiler';
import type { CompilerMain } from '../compiler';
import { StencilTester } from './stencil.tester';
import { WorkspaceAspect, Workspace } from '../workspace';
// import { StencilDevServer } from './stencil.dev-server';
import { WebpackAspect } from '../webpack';
import type { WebpackMain } from '../webpack';
import { EnvsAspect, EnvsMain } from '../environments';

export class StencilMain {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  createCompiler(options: TranspileOptions) {
    return new StencilCompiler(options);
  }

  createTester() {
    return new StencilTester(this.workspace);
  }

  createDevServer() {
    // return new StencilDevServer({}, this.workspace);
  }

  static runtime = MainRuntime;
  static dependencies = [EnvsAspect, CompilerAspect, WorkspaceAspect, WebpackAspect];

  static async provider([envs, compiler, workspace, webpack]: [EnvsMain, CompilerMain, Workspace, WebpackMain]) {
    const stencil = new StencilMain(workspace);
    envs.registerEnv(new StencilEnv(stencil, compiler, webpack));

    return stencil;
  }
}

StencilAspect.addRuntime(StencilMain);
