import { TranspileOptions } from '@stencil/core/compiler';
import { MainRuntime } from '@teambit/cli';
import type { CompilerMain } from '@teambit/compiler';
import { CompilerAspect } from '@teambit/compiler';
import { EnvsAspect, EnvsMain } from '@teambit/envs';
import type { WebpackMain } from '@teambit/webpack';
// import { StencilDevServer } from './stencil.dev-server';
import { WebpackAspect } from '@teambit/webpack';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';

import { StencilAspect } from './stencil.aspect';
import { StencilCompiler } from './stencil.compiler';
import { StencilEnv } from './stencil.env';
import { StencilTester } from './stencil.tester';

export class StencilMain {
  constructor(
    /**
     * workspace extension.
     */
    private workspace: Workspace
  ) {}

  createCompiler(options: TranspileOptions) {
    return new StencilCompiler(StencilAspect.id, options);
  }

  createTester() {
    return new StencilTester(StencilAspect.id, this.workspace);
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
