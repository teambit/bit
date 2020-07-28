import webpack, { Configuration, Compiler } from 'webpack';
import pMapSeries from 'p-map-series';
import merge from 'webpack-merge';
import configFactory from './config/webpack.config';
import { Bundler, Target, BundlerComponentResult } from '../bundler';

export class WebpackBundler implements Bundler {
  constructor(
    /**
     * targets to bundle.
     */
    private targets: Target[],

    /**
     * webpack configuration provided by the consuming env.
     */
    private envConfig: Configuration
  ) {}

  async run(): Promise<BundlerComponentResult[]> {
    const compilers = this.getConfig().map((config) => webpack(config));
    const componentOutput = await pMapSeries(compilers, (compiler: Compiler) => {
      return new Promise((resolve, reject) => {
        // TODO: split to multiple processes to reduce time and configure concurrent builds.
        // @see https://github.com/trivago/parallel-webpack
        return compiler.run((err, stats) => {
          if (err) return reject(err);
          console.log(
            'completed bundling component...',
            this.getIdByPath(stats.compilation.outputOptions.path).toString()
          );
          const info = stats.toJson();
          return resolve({
            errors: info.errors,
            id: this.getIdByPath(stats.compilation.outputOptions.path),
            warnings: info.warnings,
          });
        });
      });
    });

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

  private getConfig() {
    return this.targets.map((target) => {
      return merge(configFactory(target.entries, target.capsule.path), this.envConfig);
    });
  }

  private getCompiler() {
    return webpack(this.getConfig());
  }
}
