import { Bundler, BundlerResult, Target } from '@teambit/bundler';
import { Logger } from '@teambit/logger';
import { flatten } from 'lodash';
import mapSeries from 'p-map-series';
import webpack, { Compiler, Configuration } from 'webpack';
import merge from 'webpack-merge';

import configFactory from './config/webpack.config';

export class WebpackBundler implements Bundler {
  constructor(
    /**
     * targets to bundle.
     */
    private targets: Target[],

    /**
     * webpack configuration provided by the consuming env.
     */
    private envConfig: Configuration,

    private logger: Logger
  ) {}

  async run(): Promise<BundlerResult[]> {
    const compilers = this.getConfig().map((config) => webpack(config));
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
              errors: [err],
              components,
            });
          }
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

  private getSingleConfig() {
    const entries = flatten(this.targets.map((target) => target.entries));
    // TODO: fix when a proper API to capsule root is introduced.
    const pathArray = this.targets[0].outputPath.split('/');
    pathArray.pop();
    const rootPath = pathArray.join('/');

    return [merge(configFactory(this.unique(entries), rootPath), this.envConfig)];
  }

  private unique(items: string[]): string[] {
    const unique = {};

    items.forEach(function (i) {
      if (!unique[i]) {
        unique[i] = true;
      }
    });

    return Object.keys(unique);
  }

  private getConfig() {
    return this.targets.map((target) => {
      return merge(configFactory(target.entries, target.outputPath), this.envConfig);
    });
  }
}
