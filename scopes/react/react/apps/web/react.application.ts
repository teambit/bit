import { join, basename } from 'path';
import { Capsule } from '@teambit/isolator';
import { Application, AppContext, AppBuildResult, DeployContext } from '@teambit/application';
import { ArtifactDefinition, BuildContext } from '@teambit/builder';
import { Bundler, BundlerResult, BundlerContext, DevServerContext } from '@teambit/bundler';
import { Port } from '@teambit/toolbox.network.get-port';
import { WebpackConfigTransformer } from '@teambit/webpack';
import { ReactEnv } from '../../react.env';
import { prerenderSPAPlugin } from './plugins';

export class ReactApp implements Application {
  constructor(
    readonly name: string,
    readonly entry: string[],
    readonly portRange: number[],
    private reactEnv: ReactEnv,
    readonly prerenderRoutes?: string[],
    readonly bundler?: Bundler,
    readonly transformers?: WebpackConfigTransformer[],
    readonly deploy?: (context: DeployContext, capsule: Capsule) => Promise<void>
  ) {}

  readonly applicationType = 'react-common-js';
  async run(context: AppContext): Promise<number> {
    const devServerContext = this.getDevServerContext(context);
    const devServer = this.reactEnv.getDevServer(devServerContext, [
      (configMutator) => {
        configMutator.addTopLevel('devServer', {
          historyApiFallback: {
            index: '/index.html',
            disableDotRule: true,
          },
        });

        if (!configMutator.raw.output) configMutator.raw.output = {};
        configMutator.raw.output.publicPath = '/';

        return configMutator;
      },
    ]);
    const [from, to] = this.portRange;
    const port = await Port.getPort(from, to);
    await devServer.listen(port);
    return port;
  }

  async build(context: BuildContext, capsule: Capsule): Promise<AppBuildResult> {
    const bundler = await this.getBundler(context, capsule);
    const bundlerResult = await bundler.run();
    const artifacts: ArtifactDefinition[] = this.getBlobPatterns(bundlerResult);
    const deployContext: AppBuildResult = Object.assign(context, { artifacts });
    return deployContext;
  }

  private getBlobPatterns(bundlerResults: BundlerResult[]) {
    const _globs = bundlerResults.map((result) => {
      if (!result.outputPath) return undefined;
      return {
        name: 'CommonJS',
        globPatterns: [`${this.getPublicDir()}/**`],
      };
    });
    return _globs.filter((glob) => !!glob) as ArtifactDefinition[];
  }

  private getBundler(context: BuildContext, capsule: Capsule) {
    if (this.bundler) return this.bundler;
    return this.getDefaultBundler(context, capsule);
  }
  private async getDefaultBundler(context: BuildContext, capsule: Capsule) {
    const reactEnv: ReactEnv = context.env;
    const publicDir = this.getPublicDir();
    const outputPath = join(capsule.path, publicDir);
    const { distDir } = reactEnv.getCompiler();
    const entries = this.entry.map((entry) => require.resolve(`${capsule.path}/${distDir}/${basename(entry)}`));
    const staticDir = join(outputPath, 'public');

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets: [
        {
          components: [capsule?.component],
          entries,
          outputPath,
        },
      ],
      entry: [],
      rootPath: '/',
    });

    const bundler: Bundler = await reactEnv.getBundler(bundlerContext, [
      (configMutator) => {
        if (this.transformers?.length) configMutator.addPlugin(this.transformers);
        configMutator.addTopLevel('output', { path: staticDir, publicPath: `/` });
        if (this.prerenderRoutes) configMutator.addPlugin(prerenderSPAPlugin(this.prerenderRoutes, staticDir));
        return configMutator;
      },
    ]);
    return bundler;
  }

  private getPublicDir() {
    return join(this.applicationType, this.name);
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
