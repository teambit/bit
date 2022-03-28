import { join, basename } from 'path';
import { Application, AppContext, AppBuildContext } from '@teambit/application';
import { Bundler, DevServer, BundlerContext, DevServerContext, BundlerHtmlConfig } from '@teambit/bundler';
import { Port } from '@teambit/toolbox.network.get-port';
import { remove } from 'lodash';
import TerserPlugin from 'terser-webpack-plugin';
import { WebpackConfigTransformer } from '@teambit/webpack';
import { ReactEnv } from '../../react.env';
import { prerenderSPAPlugin } from './plugins';
import { ReactAppBuildResult } from './react-build-result';
import { html } from '../../webpack';
import { ReactDeployContext } from '.';

export class ReactApp implements Application {
  constructor(
    readonly name: string,
    readonly entry: string[],
    readonly portRange: number[],
    private reactEnv: ReactEnv,
    readonly prerenderRoutes?: string[],
    readonly bundler?: Bundler,
    readonly devServer?: DevServer,
    readonly transformers?: WebpackConfigTransformer[],
    readonly deploy?: (context: ReactDeployContext) => Promise<void>,
    readonly favicon?: string
  ) {}
  readonly applicationType = 'react-common-js';
  readonly dir = 'public';
  async run(context: AppContext): Promise<number> {
    const [from, to] = this.portRange;
    const port = await Port.getPort(from, to);
    if (this.devServer) {
      await this.devServer.listen(port);
      return port;
    }
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
    await devServer.listen(port);
    return port;
  }

  async build(context: AppBuildContext): Promise<ReactAppBuildResult> {
    const htmlConfig: BundlerHtmlConfig[] = [
      {
        title: context.name,
        templateContent: html(context.name),
        minify: false,
        favicon: this.favicon,
        // filename: ''.html`,
      },
    ];
    Object.assign(context, {
      html: htmlConfig,
    });
    const bundler = await this.getBundler(context);
    await bundler.run();
    return { publicDir: `${this.getPublicDir()}/${this.dir}` };
  }

  private getBundler(context: AppBuildContext) {
    if (this.bundler) return this.bundler;
    return this.getDefaultBundler(context);
  }
  private async getDefaultBundler(context: AppBuildContext) {
    const { capsule } = context;
    const reactEnv: ReactEnv = context.env;
    const publicDir = this.getPublicDir();
    const outputPath = join(capsule.path, publicDir);
    const { distDir } = reactEnv.getCompiler();
    const entries = this.entry.map((entry) => require.resolve(`${capsule.path}/${distDir}/${basename(entry)}`));
    const staticDir = join(outputPath, this.dir);

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
      metaData: {
        initiator: `building app: ${context.name}`,
        envId: context.id,
      },
    });

    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      const config = configMutator.addTopLevel('output', { path: staticDir, publicPath: `/` });
      if (this.prerenderRoutes) config.addPlugin(prerenderSPAPlugin(this.prerenderRoutes, staticDir));
      if (config.raw.optimization?.minimizer) {
        remove(config.raw.optimization?.minimizer, (minimizer) => {
          return minimizer.constructor.name === 'TerserPlugin';
        });
        config.raw.optimization?.minimizer.push(
          new TerserPlugin({
            minify: TerserPlugin.esbuildMinify,
            // `terserOptions` options will be passed to `esbuild`
            // Link to options - https://esbuild.github.io/api/#minify
            terserOptions: {
              minify: true,
            },
          })
        );
      }
      return config;
    };
    const transformers = [defaultTransformer, ...(this.transformers ?? [])];
    const bundler: Bundler = await reactEnv.getBundler(bundlerContext, transformers);
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
      favicon: this.favicon,
    });
  }
}
