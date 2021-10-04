import { join, basename } from 'path';
import { Capsule } from '@teambit/isolator';
import { Application, AppContext, DeployContext } from '@teambit/application';
import { BuildContext } from '@teambit/builder';
import { Bundler, BundlerContext, DevServerContext } from '@teambit/bundler';
import { Port } from '@teambit/toolbox.network.get-port';
import { ReactEnv } from './react.env';

export class ReactApp implements Application {
  constructor(
    readonly name: string,
    readonly entry: string[],
    readonly portRange: number[],
    private reactEnv: ReactEnv,
    private rootPath: string,
    readonly deploy?: (context: DeployContext) => Promise<void>
  ) {}

  applicationType = 'react';

  async run(context: AppContext): Promise<number> {
    const devServerContext = this.getDevServerContext(context);
    const devServer = this.reactEnv.getDevServer(devServerContext, [
      (configMutator) => {
        // configMutator.addTopLevel('output', { publicPath: `/public/${this.name}` });
        return configMutator;
      },
    ]);
    const [from, to] = this.portRange;
    const port = await Port.getPort(from, to);
    await devServer.listen(port);
    return port;
  }

  async build(context: BuildContext, aspectId: string, appCapsule: Capsule): Promise<DeployContext> {
    const reactEnv: ReactEnv = context.env;
    const publicDir = join('applications', this.name, 'build');
    const outputPath = join(appCapsule.path, publicDir);
    const { distDir } = reactEnv.getCompiler();
    const entries = this.entry.map((entry) => require.resolve(`${appCapsule.path}/${distDir}/${basename(entry)}`));
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
    const bundler: Bundler = await reactEnv.getBundler(bundlerContext, [
      (configMutator) => {
        configMutator.addTopLevel('output', { path: join(outputPath, 'public'), publicPath: `/` });
        return configMutator;
      },
    ]);
    await bundler.run();
    const deployContext = Object.assign(context, {
      applicationType: this.applicationType,
      aspectId,
      publicDir: join(appCapsule.path, publicDir, 'public'),
    });
    return deployContext;
  }

  private getDevServerContext(context: AppContext): DevServerContext {
    return Object.assign(context, {
      entry: this.entry,
      rootPath: '',
      publicPath: `public/${this.name}`,
      title: this.name,
    });
  }
}
