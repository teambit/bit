import { TranspileOptions } from '@stencil/core/compiler';
import { StencilCompiler } from './stencil.compiler';
import { Environments } from '../environments';
import { StencilEnv } from './stencil.env';
import { CompilerExtension } from '../compiler';
import { StencilTester } from './stencil.tester';
import { WorkspaceExt, Workspace } from '../workspace';
// import { StencilDevServer } from './stencil.dev-server';
import { WebpackExtension } from '../webpack';

export class StencilExtension {
  static id = '@teambit/stencil';

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

  static dependencies = [Environments, CompilerExtension, WorkspaceExt, WebpackExtension];

  static async provider([envs, compiler, workspace, webpack]: [
    Environments,
    CompilerExtension,
    Workspace,
    WebpackExtension
  ]) {
    const stencil = new StencilExtension(workspace);
    envs.registerEnv(new StencilEnv(stencil, compiler, webpack));

    return stencil;
  }
}
