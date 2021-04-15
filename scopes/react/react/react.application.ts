import { join } from 'path';
import { Application, AppContext, DeployContext } from '@teambit/application';
import { BuildContext } from '@teambit/builder';
import { Bundler, BundlerContext, DevServerContext } from '@teambit/bundler';
import getPort from 'get-port';
import { ComponentID } from '@teambit/component';
import { ReactEnv } from './react.env';

export class ReactApp implements Application {
  constructor(
    readonly name: string,
    readonly buildEntry: string[],
    readonly runEntry: string[],
    readonly portRange: number[],
    private reactEnv: ReactEnv,
    private rootPath: string,
    readonly deploy?: (context: DeployContext) => Promise<void>
  ) {}

  applicationType = 'react';
  async run(context: AppContext): Promise<void> {
    const devServerContext = this.getDevServerContext(context);
    const devServer = this.reactEnv.getDevServer(devServerContext);
    const port = await getPort({ port: this.portRange });
    devServer.listen(port);
  }

  async build(context: BuildContext, aspectId: string): Promise<DeployContext> {
    const capsules = context.capsuleNetwork.seedersCapsules;
    const appCapsule = capsules.find((capsule) => capsule.component.id.isEqual(ComponentID.fromString(aspectId)));

    if (!appCapsule)
      return Object.assign(context, { applicationType: this.applicationType, aspectId, publicDir: null });
    const publicDir = join('applications', this.name, 'build');
    const outputPath = join(appCapsule.path, publicDir);
    const entries = this.buildEntry.map((entry) => require.resolve(`${appCapsule.path}/${entry}`));
    const bundlerContext: BundlerContext = Object.assign(context, {
      targets: [
        {
          components: [appCapsule?.component],
          entries,
          outputPath,
        },
      ],
      entry: [],
      rootPath: '/',
    });

    const bundler: Bundler = await context.env.getBundler(bundlerContext);
    await bundler.run();
    const deployContext = Object.assign(context, {
      applicationType: this.applicationType,
      aspectId,
      publicDir: join(publicDir, 'public'),
    });
    return deployContext;
  }

  private getDevServerContext(context: AppContext): DevServerContext {
    return Object.assign(context, {
      entry: this.runEntry,
      rootPath: '',
      publicPath: `public/${this.name}`,
    });
  }
}
