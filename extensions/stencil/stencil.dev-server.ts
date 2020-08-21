import { Config } from '@stencil/core';
import { createCompiler } from '@stencil/core/compiler';
import { DevServer } from '@teambit/bundler';
import { Workspace } from '@teambit/workspace';

export class StencilDevServer implements DevServer {
  constructor(
    readonly config: Config,

    private workspace: Workspace
  ) {}

  // TODO: remove this ts-ignore once implement server correctly
  // @ts-ignore
  async listen(port: number) {
    const stencilCompiler = await createCompiler({
      devServer: {
        reloadStrategy: 'pageReload',
        port: port || 4444,
        basePath: this.workspace.path,
      },
      outputTargets: [
        {
          type: 'dist',
        },
        {
          type: 'www',
        },
      ],
      namespace: 'test',
      tsconfig: require.resolve('./typescript/tsconfig'),
      taskQueue: 'async',
      // cwd: this.workspace.path,
      srcDir: `${this.workspace.path}/web-components`,
      // includeSrc: [this.workspace.path + '']
    });
    const watcher = await stencilCompiler.createWatcher();
    // const watcherClose = await watcher.start();
    await watcher.start();

    return {
      listen: () => {},
    };
  }
}
