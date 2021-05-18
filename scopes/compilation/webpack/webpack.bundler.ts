import { BitError } from '@teambit/bit-error';
import { Bundler, BundlerResult, Target } from '@teambit/bundler';
import { Logger } from '@teambit/logger';
import mapSeries from 'p-map-series';
import webpack, { Compiler, Configuration } from 'webpack';

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

    private logger: Logger
  ) {}

  async run(): Promise<BundlerResult[]> {
    const compilers = this.configs.map((config) => webpack(config as any));
    const longProcessLogger = this.logger.createLongProcessLogger('bundling component preview', compilers.length);
    const componentOutput = await mapSeries(compilers, (compiler: Compiler) => {
      const components = this.getComponents(compiler.outputPath);
      longProcessLogger.logProgress(components.map((component) => component.id.toString()).join(', '));
      return new Promise((resolve) => {
        // TODO: split to multiple processes to reduce time and configure concurrent builds.
        // @see https://github.com/trivago/parallel-webpack
        return compiler.run((err, stats) => {
          if (err) {
            return resolve({
              errors: [`${err.toString()}\n${err.stack}`],
              components,
            });
          }
          if (!stats) throw new BitError('unknown build error');
          const info = stats.toJson();
          return resolve({
            errors: info.errors,
            outputPath: stats.compilation.outputOptions.path,
            components,
            warnings: info.warnings,
          });
        });
      });
    });
    longProcessLogger.end();
    return componentOutput as BundlerResult[];
  }

  private getComponents(outputPath: string) {
    const target = this.targets.find((targetCandidate) => {
      const splitPath = outputPath.split('/');
      splitPath.pop();
      const path = splitPath.join('/');
      return path === targetCandidate.outputPath;
    });

    if (!target) {
      throw new Error('could not find component id for path');
    }

    return target.components;
  }
}
