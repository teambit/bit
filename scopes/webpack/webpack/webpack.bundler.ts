import { BitError } from '@teambit/bit-error';
import type { Bundler, BundlerResult, Asset, Target, EntriesAssetsMap, BundlerContextMetaData } from '@teambit/bundler';
import type { Logger } from '@teambit/logger';
import { compact, isEmpty } from 'lodash';
import mapSeries from 'p-map-series';
import type { Compiler, Configuration, StatsCompilation, StatsAsset } from 'webpack';
import { sep } from 'path';

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

    private webpack,

    private metaData?: BundlerContextMetaData | undefined
  ) {}

  async run(): Promise<BundlerResult[]> {
    const startTime = Date.now();
    const compilers = this.configs.map((config: any) => this.webpack(config));
    const initiator = this.metaData?.initiator;
    const envId = this.metaData?.envId;
    const initiatorMessage = initiator ? `process initiated by: ${initiator}.` : '';
    const envIdMessage = envId ? `config created by env: ${envId}.` : '';

    const longProcessLogger = this.logger.createLongProcessLogger('running Webpack bundler', compilers.length);
    const componentOutput = await mapSeries(compilers, (compiler: Compiler) => {
      const components = this.getComponents(compiler.outputPath);
      const componentsLengthMessage = `running on ${components.length} components`;
      const fullMessage = `${initiatorMessage} ${envIdMessage} ${componentsLengthMessage}`;
      const ids = components.map((component) => component.id.toString()).join(', ');
      longProcessLogger.logProgress(`${fullMessage}`);
      this.logger.debug(`${fullMessage}\ncomponents ids: ${ids}`);
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
          // const info = stats.toJson();

          const info = stats.toJson({
            all: false,
            entrypoints: true,
            warnings: true,
            errors: true,
            assets: true,
            chunkGroupAuxiliary: true,
            relatedAssets: true,
            cachedAssets: true,
          });
          const assetsMap = this.getAssets(info);
          const entriesAssetsMap = this.getEntriesAssetsMap(info, assetsMap);

          return resolve({
            assets: Object.values(assetsMap),
            assetsByChunkName: info.assetsByChunkName,
            entriesAssetsMap,
            errors: this.getErrors(info),
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

  private getErrors(stats: StatsCompilation): Error[] {
    if (!stats.errors) return [];
    const fieldsToShow = ['message', 'moduleId', 'moduleName', 'moduleIdentifier', 'loc'];
    return stats.errors.map((webpackError) => {
      const lines = fieldsToShow.map((fieldName) => {
        if (webpackError[fieldName]) {
          return `${fieldName}: ${webpackError[fieldName]}`;
        }
        return undefined;
      });
      const errorMessage = compact(lines).join('\n');
      return new BitError(errorMessage);
    });
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
    if (!entriesMap || !Object.keys(assetsMap).length) return {};
    Object.entries(entriesMap).forEach(([, entryVal]) => {
      let compressedAssetsSize = 0;
      let compressedAuxiliaryAssetsSize = 0;
      entryVal.assets?.forEach((asset) => {
        const compressedSize = assetsMap[asset.name]?.compressedSize;
        if (compressedSize) {
          // @ts-ignore
          asset.compressedSize = compressedSize;
          compressedAssetsSize += compressedSize;
        }
      });
      entryVal.auxiliaryAssets?.forEach((asset) => {
        const compressedSize = assetsMap[asset.name]?.compressedSize;
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

  private getCompressedSize(asset: StatsAsset): number | undefined {
    if (!asset.related || isEmpty(asset.related)) return undefined;
    const gzipped = asset.related.find((relatedAsset) => {
      return relatedAsset.type === 'gzipped';
    });
    if (!gzipped) return undefined;
    return gzipped.size;
  }

  private getComponents(outputPath: string) {
    const path = outputPath.substring(0, outputPath.lastIndexOf(sep));
    const target = this.targets.find((targetCandidate) => path === targetCandidate.outputPath);

    if (!target) throw new Error(`Could not find component id for path "${path}"`);
    return target.components;
  }
}
