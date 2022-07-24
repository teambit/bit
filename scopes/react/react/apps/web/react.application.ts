import { join, resolve, basename } from 'path';
import { Application, AppContext, AppBuildContext } from '@teambit/application';
import type { Bundler, DevServer, BundlerContext, DevServerContext, BundlerHtmlConfig } from '@teambit/bundler';
import { Port } from '@teambit/toolbox.network.get-port';
import { Logger } from '@teambit/logger';
import { remove } from 'lodash';
import TerserPlugin from 'terser-webpack-plugin';
import { WebpackConfigTransformer } from '@teambit/webpack';
import { ReactEnv } from '../../react.env';
import { prerenderPlugin } from './plugins';
import { ReactAppBuildResult } from './react-build-result';
import { ReactAppPrerenderOptions } from './react-app-options';
import { html } from '../../webpack';
import { ReactDeployContext } from '.';
import { computeResults } from './compute-results';
import { clientConfig, ssrConfig, calcOutputPath } from './webpack/webpack.app.ssr.config';
import { addDevServer, setOutput } from './webpack/mutators';
import { createExpressSsr, loadSsrApp, parseAssets } from './ssr/ssr-express';

export class ReactApp implements Application {
  constructor(
    readonly name: string,
    readonly entry: string[] | (() => Promise<string[]>),
    readonly ssr: string | (() => Promise<string>) | undefined,
    readonly portRange: [number, number],
    private reactEnv: ReactEnv,
    readonly prerender?: ReactAppPrerenderOptions,
    readonly bundler?: Bundler,
    readonly devServer?: DevServer,
    readonly transformers: WebpackConfigTransformer[] = [],
    readonly deploy?: (context: ReactDeployContext) => Promise<void>,
    readonly favicon?: string,
    private logger?: Logger
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

    if (this.ssr) {
      await this.runSsr(context, port);
      return port;
    }

    const devServerContext = await this.getDevServerContext(context);
    const devServer = this.reactEnv.getDevServer(devServerContext, [addDevServer, setOutput, ...this.transformers]);
    await devServer.listen(port);
    return port;
  }

  private async runSsr(context: AppContext, port: number) {
    const clientBundle = await this.buildClient(context);
    if (clientBundle.errors.length > 0) {
      // TODO - @Gilad help
      // eslint-disable-next-line no-console
      clientBundle.errors.forEach((err) => console.error('[react.application] webpack error', err));
      process.exit();
    }

    this.logger?.info('[react.application] [ssr] client bundle - complete');
    const serverBundle = await this.buildSsr(context);
    if (clientBundle.errors.length > 0) {
      // TODO - @Gilad help
      // eslint-disable-next-line no-console
      serverBundle.errors.forEach((err) => console.error('[react.application] webpack error', err));
      process.exit();
    }
    this.logger?.info('[react.application] [ssr] server bundle - complete');

    const assets = parseAssets(clientBundle.assets);
    const app = await loadSsrApp(context.workdir, context.appName);
    this.logger?.info('[react.application] [ssr] bundle code - loaded');

    const expressApp = createExpressSsr({
      name: context.appName,
      workdir: context.workdir,
      port,
      app,
      assets,
      logger: this.logger,
    });
    expressApp.listen(port);

    return port;
  }

  private async buildClient(context: AppContext) {
    const htmlConfig: BundlerHtmlConfig[] = [
      {
        title: context.appName,
        templateContent: html(context.appName),
        minify: false,
        favicon: this.favicon,
        // filename: ''.html`,
      },
    ];

    const ctx: BundlerContext = {
      ...context,
      html: htmlConfig,
      targets: [
        {
          entries: await this.getEntries(),
          components: [context.appComponent],
          outputPath: resolve(context.workdir, calcOutputPath(context.appName, 'browser')),
          aliasHostDependencies: true,
        },
      ],

      // @ts-ignore
      capsuleNetwork: undefined,
      previousTasksResults: [],
    };

    const bundler = await this.reactEnv.getBundler(ctx, [
      (config) => config.merge([clientConfig()]),
      ...this.transformers,
    ]);

    const bundleResult = await bundler.run();
    return bundleResult[0];
  }

  private async buildSsr(context: AppContext) {
    const ctx: BundlerContext = {
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
    };

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

    return computeResults(bundleResult, { publicDir: `${this.getPublicDir(context.artifactsDir)}/${this.dir}` });
  }

  private getBundler(context: AppBuildContext) {
    if (this.bundler) return this.bundler;
    return this.getDefaultBundler(context);
  }
  private async getDefaultBundler(context: AppBuildContext) {
    const { capsule } = context;
    const reactEnv: ReactEnv = context.env;
    const publicDir = this.getPublicDir(context.artifactsDir);
    const outputPath = join(capsule.path, publicDir);
    const { distDir } = reactEnv.getCompiler();
    const targetEntries = Array.isArray(this.entry) ? this.entry : await this.entry();
    const entries = targetEntries.map((entry) => require.resolve(`${capsule.path}/${distDir}/${basename(entry)}`));
    const staticDir = join(outputPath, this.dir);

    const bundlerContext: BundlerContext = Object.assign(context, {
      targets: [
        {
          components: [capsule?.component],
          entries,
          outputPath,
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

    const defaultTransformer: WebpackConfigTransformer = (configMutator) => {
      const config = configMutator.addTopLevel('output', {
        path: staticDir,
        publicPath: `/`,
        filename: '[name].[chunkhash].js',
      });
      if (this.prerender) config.addPlugin(prerenderPlugin(this.prerender));
      if (config.raw.optimization?.minimizer) {
        remove(config.raw.optimization?.minimizer, (minimizer) => {
          return minimizer.constructor.name === 'TerserPlugin';
        });

        config.raw.optimization?.minimizer.push(this.getESBuildConfig());
      }

      return config;
    };
    const transformers = [defaultTransformer, ...this.transformers];
    const bundler: Bundler = await reactEnv.getBundler(bundlerContext, transformers);
    return bundler;
  }
  private getESBuildConfig = (isPrerendering = this.prerender) => {
    // We don't want to use esbuild in case of prerendering since the headless browser puppeteer doesn't support
    // the output of esbuild

    if (isPrerendering) {
      return new TerserPlugin({
        extractComments: false,
        terserOptions: {
          parse: {
            // We want terser to parse ecma 8 code. However, we don't want it
            // to apply any minification steps that turns valid ecma 5 code
            // into invalid ecma 5 code. This is why the 'compress' and 'output'
            // sections only apply transformations that are ecma 5 safe
            // https://github.com/facebook/create-react-app/pull/4234
            ecma: 8,
          },
          compress: {
            ecma: 5,
            warnings: false,
            // Disabled because of an issue with Uglify breaking seemingly valid code:
            // https://github.com/facebook/create-react-app/issues/2376
            // Pending further investigation:
            // https://github.com/mishoo/UglifyJS2/issues/2011
            comparisons: false,
            // Disabled because of an issue with Terser breaking valid code:
            // https://github.com/facebook/create-react-app/issues/5250
            // Pending further investigation:
            // https://github.com/terser-js/terser/issues/120
            inline: 2,
          },
          mangle: {
            safari10: true,
          },
          output: {
            ecma: 5,
            comments: false,
            // Turned on because emoji and regex is not minified properly using default
            // https://github.com/facebook/create-react-app/issues/2488
            ascii_only: true,
          },
        },
      });
    }
    return new TerserPlugin({
      minify: TerserPlugin.esbuildMinify,
      // `terserOptions` options will be passed to `esbuild`
      // Link to options - https://esbuild.github.io/api/#minify
      terserOptions: {
        minify: true,
      },
    });
  };

  private getPublicDir(artifactsDir: string) {
    return join(artifactsDir, this.applicationType, this.name);
  }

  async getEntries(): Promise<string[]> {
    if (Array.isArray(this.entry)) return this.entry;
    return this.entry();
  }

  async getSsrEntries(): Promise<string[]> {
    if (!this.ssr) throw new Error('this was handled before'); // TODO
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
