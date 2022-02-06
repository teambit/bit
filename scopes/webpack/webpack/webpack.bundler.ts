import { BitError } from '@teambit/bit-error';
import type { Bundler, BundlerResult, Asset, Target, EntriesAssetsMap } from '@teambit/bundler';
import type { Logger } from '@teambit/logger';
import { isEmpty } from 'lodash';
import mapSeries from 'p-map-series';
import type { Compiler, Configuration, StatsCompilation } from 'webpack';

type AssetsMap = { [assetId: string]: Asset };
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
          // console.log('err webpack', err);

          if (err) {
            this.logger.error('get error from webpack compiler, full error:', err);

            return resolve({
              errors: [`${err.toString()}\n${err.stack}`],
              components,
            });
          }
          if (!stats) throw new BitError('unknown build error');
          const info = stats.toJson();

          // console.log(JSON.stringify(info, null, 2));

          const assetsMap = this.getAssets(info);
          const entriesAssetsMap = this.getEntriesAssetsMap(info, assetsMap);

          return resolve({
            assets: Object.values(assetsMap),
            assetsByChunkName: info.assetsByChunkName,
            entriesAssetsMap,
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

  private getAssets(stats: StatsCompilation): AssetsMap {
    if (!stats.assets) return {};
    return stats.assets.reduce((acc, asset) => {
      acc[asset.name] = {
        name: asset.name,
        size: asset.size,
        compressedSize: this.getCompressedSize(asset),
      };
      return acc;
    }, {});
  }

  private getEntriesAssetsMap(stats: StatsCompilation, assetsMap: AssetsMap): EntriesAssetsMap {
    const entriesMap = stats.entrypoints;
    if (!entriesMap) return {};
    Object.entries(entriesMap).forEach(([, entryVal]) => {
      let compressedAssetsSize = 0;
      let compressedAuxiliaryAssetsSize = 0;
      entryVal.assets?.forEach((asset) => {
        const compressedSize = assetsMap[asset.name].compressedSize;
        if (compressedSize) {
          // @ts-ignore
          asset.compressedSize = compressedSize;
          compressedAssetsSize += compressedSize;
        }
      });
      entryVal.auxiliaryAssets?.forEach((asset) => {
        const compressedSize = assetsMap[asset.name].compressedSize;
        if (compressedSize) {
          // @ts-ignore
          asset.compressedSize = compressedSize;
          compressedAuxiliaryAssetsSize += compressedSize;
        }
      });
      entryVal.compressedAssetsSize = compressedAssetsSize;
      entryVal.compressedAuxiliaryAssetsSize = compressedAuxiliaryAssetsSize;
    });
    return entriesMap as any as EntriesAssetsMap;
  }

  private getCompressedSize(asset): number | undefined {
    if (!asset.related || isEmpty(asset.related)) return undefined;
    const gzipped = asset.related.find((relatedAsset) => {
      return relatedAsset.type === 'gzipped';
    });
    if (!gzipped) return undefined;
    return gzipped.size;
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
