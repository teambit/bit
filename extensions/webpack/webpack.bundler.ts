import { Bundler, BundlerComponentResult, Target } from '@teambit/bundler';
import { Logger } from '@teambit/logger';
import { flatten } from 'lodash';
import pMapSeries from 'p-map-series';
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

  async run(): Promise<BundlerComponentResult[]> {
    const compilers = this.getConfig().map((config) => webpack(config));
    const longProcessLogger = this.logger.createLongProcessLogger('bundling component preview', compilers.length);
    const componentOutput = await pMapSeries(compilers, (compiler: Compiler) => {
      const componentId = this.getIdByPath(compiler.outputPath);
      longProcessLogger.logProgress(componentId.toString());
      return new Promise((resolve, reject) => {
        // TODO: split to multiple processes to reduce time and configure concurrent builds.
        // @see https://github.com/trivago/parallel-webpack
        return compiler.run((err, stats) => {
          if (err) return reject(err);
          const info = stats.toJson();
          return resolve({
            errors: info.errors,
            id: this.getIdByPath(stats.compilation.outputOptions.path),
            warnings: info.warnings,
          });
        });
      });
    });
    longProcessLogger.end();
    return componentOutput;
  }

  private getIdByPath(outputPath: string) {
    const target = this.targets.find((targetCandidate) => {
      const splitPath = outputPath.split('/');
      splitPath.pop();
      const path = splitPath.join('/');
      return path === targetCandidate.capsule.path;
    });

    if (!target) {
      throw new Error();
    }

    return target?.capsule.component.id;
  }

  private getSingleConfig() {
    const entries = flatten(this.targets.map((target) => target.entries));
    // TODO: fix when a proper API to capsule root is introduced.
    const pathArray = this.targets[0].capsule.path.split('/');
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
      return merge(configFactory(target.entries, target.capsule.path), this.envConfig);
    });
  }

  private getCompiler() {
    return webpack(this.getConfig());
  }
}
