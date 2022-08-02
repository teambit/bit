import { join, resolve, basename } from 'path';
import { Application, AppContext, AppBuildContext, AppResult } from '@teambit/application';
import type { Bundler, DevServer, BundlerContext, DevServerContext, BundlerHtmlConfig } from '@teambit/bundler';
import { Port } from '@teambit/toolbox.network.get-port';
import type { Logger } from '@teambit/logger';
import compact from 'lodash.compact';
import { WebpackConfigTransformer } from '@teambit/webpack';
import { BitError } from '@teambit/bit-error';
import { ReactEnv } from '../../react.env';
import { prerenderPlugin } from './plugins';
import { ReactAppBuildResult } from './react-build-result';
import { ReactAppPrerenderOptions } from './react-app-options';
import { html } from '../../webpack';
import { ReactDeployContext } from '.';
import { computeResults } from './compute-results';
import { clientConfig, ssrConfig, calcOutputPath, ssrBuildConfig, buildConfig } from './webpack/webpack.app.ssr.config';
import { addDevServer, setOutput, replaceTerserPlugin } from './webpack/mutators';
import { createExpressSsr, loadSsrApp, parseAssets } from './ssr/ssr-express';

export class ReactApp implements Application {
  constructor(
    readonly name: string,
    readonly entry: string[] | ((path?: string) => Promise<string[]>),
    readonly ssr: string | (() => Promise<string>) | undefined,
    readonly portRange: [number, number],
    private reactEnv: ReactEnv,
    readonly prerender?: ReactAppPrerenderOptions,
    readonly bundler?: Bundler,
    readonly ssrBundler?: Bundler,
    readonly devServer?: DevServer,
    readonly transformers: WebpackConfigTransformer[] = [],
    readonly deploy?: (context: ReactDeployContext) => Promise<void>,
    readonly favicon?: string,
    private logger?: Logger
  ) {}
  readonly applicationType = 'react-common-js';
  readonly dir = 'public';
  readonly ssrDir = 'ssr';

  async run(context: AppContext): Promise<number> {
    const [from, to] = this.portRange;
    const port = await Port.getPort(from, to);

    if (this.devServer) {
      await this.devServer.listen(port);
      return port;
    }

    const devServerContext = await this.getDevServerContext(context);
    const devServer = this.reactEnv.getDevServer(devServerContext, [addDevServer, setOutput, ...this.transformers]);
    await devServer.listen(port);
    return port;
  }

  async runSsr(context: AppContext): Promise<AppResult> {
    const [from, to] = this.portRange;
    const port = await Port.getPort(from, to);

    // bundle client
    const clientBundle = await this.buildClient(context);
    if (clientBundle.errors.length > 0) return { errors: clientBundle.errors };
    this.logger?.info('[react.application] [ssr] client bundle - complete');

    // bundle server
    const serverBundle = await this.buildSsr(context);
    if (serverBundle.errors.length > 0) return { errors: serverBundle.errors };
    this.logger?.info('[react.application] [ssr] server bundle - complete');

    // load server-side runtime
    const app = await loadSsrApp(context.workdir, context.appName);
    this.logger?.info('[react.application] [ssr] bundle code - loaded');

    const expressApp = createExpressSsr({
      name: context.appName,
      workdir: context.workdir,
      port,
      app,
      assets: parseAssets(clientBundle.assets),
      logger: this.logger,
    });

    expressApp.listen(port);
    return { port };
  }

  private async buildClient(context: AppContext) {
    const htmlConfig: BundlerHtmlConfig[] = [
      {
        title: context.appName,
        templateContent: html(context.appName),
        minify: false,
        favicon: this.favicon,
      },
    ];

    // extend, including prototype methods
    const ctx: BundlerContext = Object.assign(Object.create(context), {
      html: htmlConfig,
      targets: [
        {
          entries: await this.getEntries(),
          components: [context.appComponent],
          outputPath: resolve(context.workdir, calcOutputPath(context.appName, 'browser')),
          hostDependencies: await this.getPeers(),
          aliasHostDependencies: true,
        },
      ],

      // @ts-ignore
      capsuleNetwork: undefined,
      previousTasksResults: [],
    });

    const bundler = await this.reactEnv.getBundler(ctx, [
      (config) => config.merge([clientConfig()]),
      ...this.transformers,
    ]);

    const bundleResult = await bundler.run();
    return bundleResult[0];
  }

  private async buildSsr(context: AppContext) {
    // extend, including prototype methods
    const ctx: BundlerContext = Object.assign(Object.create(context), {
      ...context,
      targets: [
        {
          entries: await this.getSsrEntries(),
          components: [context.appComponent],
          outputPath: resolve(context.workdir, calcOutputPath(context.appName, 'ssr')),
          hostDependencies: await this.getPeers(),
          aliasHostDependencies: true,
        },
      ],

      // @ts-ignore
      capsuleNetwork: undefined,
      previousTasksResults: [],
    });

    const bundler = await this.reactEnv.getBundler(ctx, [
      (config) => config.merge([ssrConfig()]),
      ...this.transformers,
    ]);

    const bundleResult = await bundler.run();
    return bundleResult[0];
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
    const bundleResult = await bundler.run();

    if (this.ssr) {
      const bunlder = await this.getSsrBundler(context);
      await bunlder.run();
    }

    return computeResults(bundleResult, {
      publicDir: `${this.getPublicDir(context.artifactsDir)}/${this.dir}`,
      ssrPublicDir: this.ssr ? `${this.getPublicDir(context.artifactsDir)}/${this.ssrDir}` : undefined,
    });
  }

  private getBundler(context: AppBuildContext) {
    if (this.bundler) return this.bundler;
    return this.getDefaultBundler(context);
  }

  private getSsrBundler(context: AppBuildContext) {
    if (this.ssrBundler) return this.ssrBundler;
    return this.getDefaultSsrBundler(context);
  }

  private async getDefaultBundler(context: AppBuildContext) {
    const { capsule } = context;
    const publicDir = this.getPublicDir(context.artifactsDir);
    const outputPath = join(capsule.path, publicDir);

    const bundlerContext = await this.getBuildContext(context, { outputPath });
    const transformers: WebpackConfigTransformer[] = compact([
      (configMutator) => configMutator.merge(buildConfig({ outputPath: join(outputPath, this.dir) })),
      (config) => {
        if (this.prerender) config.addPlugin(prerenderPlugin(this.prerender));
        return config;
      },
      replaceTerserPlugin({ prerender: !!this.prerender }),
      ...this.transformers,
    ]);

    const reactEnv = context.env as ReactEnv;
    const bundler: Bundler = await reactEnv.getBundler(bundlerContext, transformers);
    return bundler;
  }

  private async getDefaultSsrBundler(context: AppBuildContext) {
    const { capsule } = context;
    const publicDir = this.getPublicDir(context.artifactsDir);
    const outputPath = join(capsule.path, publicDir);

    const bundlerContext = await this.getBuildContext(context, { outputPath });
    const transformers: WebpackConfigTransformer[] = compact([
      (configMutator) => configMutator.merge(ssrBuildConfig({ outputPath: join(outputPath, this.ssrDir) })),
      replaceTerserPlugin({ prerender: !!this.prerender }),
      ...this.transformers,
    ]);

    const reactEnv = context.env as ReactEnv;
    const bundler: Bundler = await reactEnv.getBundler(bundlerContext, transformers);
    return bundler;
  }

  private async getBuildContext(context: AppBuildContext, { outputPath }: { outputPath: string }) {
    const { capsule } = context;
    const reactEnv = context.env as ReactEnv;
    const { distDir } = reactEnv.getCompiler();
    const targetEntries = await this.getEntries(`${capsule.path}/${distDir}`);
    const entries = targetEntries.map((entry) => require.resolve(`${capsule.path}/${distDir}/${basename(entry)}`));

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets: [
        {
          components: [capsule?.component],
          entries,
          outputPath,
          hostRootDir: capsule?.path,
          hostDependencies: await this.getPeers(),
          aliasHostDependencies: true,
        },
      ],
      entry: [],
      rootPath: '/',
      metaData: {
        initiator: `building app: ${context.name}`,
        envId: context.id,
      },
    });

    return bundlerContext;
  }

  private getPublicDir(artifactsDir: string) {
    return join(artifactsDir, this.applicationType, this.name);
  }

  async getEntries(path?: string): Promise<string[]> {
    if (Array.isArray(this.entry)) return this.entry;
    return this.entry(path);
  }

  async getSsrEntries(): Promise<string[]> {
    if (!this.ssr) throw new BitError('tried to build ssr without ssr entries');
    if (typeof this.ssr === 'string') return [this.ssr];
    return [await this.ssr()];
  }

  private async getDevServerContext(context: AppContext): Promise<DevServerContext> {
    const entries = await this.getEntries();
    return Object.assign(context, {
      entry: entries,
      rootPath: '',
      publicPath: `public/${this.name}`,
      title: this.name,
      favicon: this.favicon,
      hostDependencies: await this.getPeers(),
      aliasHostDependencies: true,
    });
  }

  private getPeers(): Promise<string[]> {
    return this.reactEnv.getPeerDependenciesList();
  }
}
