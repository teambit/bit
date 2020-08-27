import { Config } from '@stencil/core';
import { TranspileOptions } from '@stencil/core/compiler';
import { MainRuntime } from '@teambit/cli';
import type { CompilerMain } from '@teambit/compiler';
import { Compiler, CompilerAspect } from '@teambit/compiler';
import { EnvsAspect, EnvsMain } from '@teambit/environments';
import type { WebpackMain } from '@teambit/webpack';
// import { StencilDevServer } from './stencil.dev-server';
import { WebpackAspect } from '@teambit/webpack';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';

import { TypeScriptCompilerOptions } from '../typescript/compiler-options';
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

  /**
   *  return extiontion icon
   */
  icon() {
    return 'https://static.bit.dev/extensions-icons/stencil.png';
  }

  createCompiler(
    options: TranspileOptions,
    stencilConfigOptions: Config,
    tsConfigOptions: TypeScriptCompilerOptions
  ): Compiler {
    return new StencilCompiler(options, stencilConfigOptions, tsConfigOptions);
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
