import { BitError } from '@teambit/bit-error';
import type { Bundler, BundlerResult, Asset, Target, EntriesAssetsMap, BundlerContextMetaData } from '@teambit/bundler';
import type { Logger } from '@teambit/logger';
import { compact, isEmpty } from 'lodash';
import mapSeries from 'p-map-series';
import type { Compiler, Configuration, StatsCompilation, StatsAsset } from 'webpack';
import { sep } from 'path';
import { MemoryProfiler } from './memory-profiler';

type AssetsMap = { [assetId: string]: Asset };
export class WebpackBundler implements Bundler {
  private memoryProfiler: MemoryProfiler;

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
  ) {
    this.memoryProfiler = new MemoryProfiler(logger);
  }

  async run(): Promise<BundlerResult[]> {
    const startTime = Date.now();

    // Memory analysis before webpack bundling starts
    this.memoryProfiler.analyzeMemoryUsage('webpack-bundling-start');
    const memoryPressure = this.memoryProfiler.checkMemoryPressure();
    this.logger.console(`🧠 Memory pressure: ${memoryPressure.usagePercent}% - ${memoryPressure.recommendation}`);

    // Try to free up memory if we're already at high usage
    if (memoryPressure.usagePercent > 50) {
      this.logger.console(
        `⚡ High memory detected (${memoryPressure.usagePercent}%), attempting garbage collection...`
      );
      this.memoryProfiler.forceGarbageCollection();
      const afterGcMemory = this.memoryProfiler.checkMemoryPressure();
      this.logger.console(`🗑️ After GC: ${afterGcMemory.usagePercent}% (was ${memoryPressure.usagePercent}%)`);
    }

    // Take heap snapshot if memory pressure is high or if we're in GeneratePreview task
    const isPreviewTask = this.metaData?.initiator === 'GeneratePreview';
    if (memoryPressure.isHigh || (isPreviewTask && memoryPressure.usagePercent < 60)) {
      this.memoryProfiler.takeHeapSnapshot('before-webpack-bundling');
    }

    // Check memory right before creating webpack compilers
    this.logger.console(`📋 About to create ${this.configs.length} webpack compilers...`);
    this.memoryProfiler.analyzeMemoryUsage('before-creating-webpack-compilers', false);

    const compilers = this.configs.map((config: any) => this.webpack(config));

    // Check memory right after creating webpack compilers
    this.memoryProfiler.analyzeMemoryUsage('after-creating-webpack-compilers', false);

    const initiator = this.metaData?.initiator;
    const envId = this.metaData?.envId;
    const initiatorMessage = initiator ? `process initiated by: ${initiator}.` : '';
    const envIdMessage = envId ? `config created by env: ${envId}.` : '';

    const longProcessLogger = this.logger.createLongProcessLogger('running Webpack bundler', compilers.length);

    // Process compilers sequentially to control memory usage
    // For better memory management, webpack compilers are run one at a time
    // and cleaned up after each run to prevent memory accumulation
    const componentOutput = await mapSeries(compilers, async (compiler: Compiler, index: number) => {
      const components = this.getComponents(compiler.outputPath);
      const componentsLengthMessage = `running on ${components.length} components`;
      const fullMessage = `${initiatorMessage} ${envIdMessage} ${componentsLengthMessage}`;

      // Memory analysis before each compiler run
      const compilerLabel = `compiler-${index + 1}-of-${compilers.length}`;
      this.memoryProfiler.analyzeMemoryUsage(`before-${compilerLabel}`);
      const preCompileMemory = this.memoryProfiler.checkMemoryPressure();

      if (preCompileMemory.isHigh) {
        this.logger.console(`⚠️  HIGH MEMORY before ${compilerLabel}: ${preCompileMemory.usagePercent}%`);
        this.memoryProfiler.takeHeapSnapshot(`before-${compilerLabel}`);
      }

      this.logger.debug(
        `${fullMessage} memory usage: ${Math.round((process.memoryUsage().heapUsed / 1024 / 1024 / 1024) * 100) / 100} GB`
      );
      const ids = components.map((component) => component.id.toString()).join(', ');
      longProcessLogger.logProgress(`${fullMessage}`);
      this.logger.debug(`${fullMessage}\ncomponents ids: ${ids}`);

      // Track heap before webpack run
      const preWebpackHeap = this.memoryProfiler.getMemoryUsageDetails();

      const result = await new Promise<any>((resolve) => {
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

          // Track heap after webpack compilation
          const postWebpackHeap = this.memoryProfiler.getMemoryUsageDetails();
          const heapGrowthGB = (
            (parseInt(postWebpackHeap.v8HeapStats.totalHeapSize.replace(/[^0-9.]/g, '')) -
              parseInt(preWebpackHeap.v8HeapStats.totalHeapSize.replace(/[^0-9.]/g, ''))) /
            1000
          ).toFixed(2);

          this.logger.console(
            `📈 Heap Growth During Webpack: +${heapGrowthGB}GB (${preWebpackHeap.v8HeapStats.totalHeapSize} → ${postWebpackHeap.v8HeapStats.totalHeapSize})`
          );

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

      try {
        // Close the compiler to free up file watchers and resources
        await new Promise<void>((resolve) => {
          compiler.close(() => {
            resolve();
          });
        });
        if (compiler.cache) {
          // Force purge of webpack's internal cache
          (compiler as any).cache?.purge?.();
        }
      } catch (error) {
        this.logger.debug('Error during compiler cleanup:', error);
      }

      // Memory analysis after compiler cleanup
      const postCompileMemory = this.memoryProfiler.checkMemoryPressure();
      this.memoryProfiler.analyzeMemoryUsage(`after-${compilerLabel}`, false); // Don't save file for every compiler

      if (postCompileMemory.isHigh) {
        this.logger.console(`⚠️  HIGH MEMORY after ${compilerLabel}: ${postCompileMemory.usagePercent}%`);
        this.memoryProfiler.takeHeapSnapshot(`after-${compilerLabel}`);

        // Try to force garbage collection if available
        this.memoryProfiler.forceGarbageCollection();
      }

      return result;
    });

    longProcessLogger.end();

    // Final memory analysis after all webpack bundling
    this.memoryProfiler.analyzeMemoryUsage('webpack-bundling-end');
    const finalMemory = this.memoryProfiler.checkMemoryPressure();
    this.logger.console(`🏁 Final memory usage: ${finalMemory.usagePercent}% - ${finalMemory.recommendation}`);

    if (finalMemory.isHigh || isPreviewTask) {
      this.memoryProfiler.takeHeapSnapshot('after-webpack-bundling');
    }

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
