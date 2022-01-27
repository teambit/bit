import { BitError } from '@teambit/bit-error';
import type { Bundler, BundlerResult, Asset, Target } from '@teambit/bundler';
import type { Logger } from '@teambit/logger';
import mapSeries from 'p-map-series';
import type { Compiler, Configuration, StatsCompilation } from 'webpack';

export class WebpackBundler implements Bundler {
  constructor(
    /**
     * targets to bundle.
     */
    private targets: Target[],

    /**
     * webpack configuration.
     */
    private configs: Configuration[],

    private logger: Logger,

    private webpack
  ) {}

  async run(): Promise<BundlerResult[]> {
    const startTime = Date.now();
    const compilers = this.configs.map((config: any) => this.webpack(config));
    const longProcessLogger = this.logger.createLongProcessLogger('running Webpack bundler', compilers.length);
    const componentOutput = await mapSeries(compilers, (compiler: Compiler) => {
      const components = this.getComponents(compiler.outputPath);
      longProcessLogger.logProgress(components.map((component) => component.id.toString()).join(', '));
      return new Promise((resolve) => {
        // TODO: split to multiple processes to reduce time and configure concurrent builds.
        // @see https://github.com/trivago/parallel-webpack
        return compiler.run((err, stats) => {
          if (err) {
            this.logger.error('get error from webpack compiler, full error:', err);

            return resolve({
              errors: [`${err.toString()}\n${err.stack}`],
              components,
            });
          }
          if (!stats) throw new BitError('unknown build error');
          const info = stats.toJson();

          return resolve({
            assets: this.getAssets(info),
            assetsByChunkName: info.assetsByChunkName,
            entriesAssetsMap: info.entrypoints,
            errors: info.errors,
            outputPath: stats.compilation.outputOptions.path,
            components,
            warnings: info.warnings,
            startTime,
            endTime: Date.now(),
          });
        });
      });
    });
    longProcessLogger.end();
    return componentOutput as BundlerResult[];
  }

  private getAssets(stats: StatsCompilation): Asset[] {
    if (!stats.assets) return [];
    return stats.assets.map((asset) => {
      return {
        name: asset.name,
        size: asset.size,
      };
    });
  }

  private getComponents(outputPath: string) {
    const splitPath = outputPath.split('/');
    splitPath.pop();
    const path = splitPath.join('/');
    const target = this.targets.find((targetCandidate) => {
      return path === targetCandidate.outputPath;
    });

    if (!target) {
      throw new Error(`Could not find component id for path "${path}"`);
    }

    return target.components;
  }
}
