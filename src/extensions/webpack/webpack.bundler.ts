import webpack, { Configuration } from 'webpack';
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

  run(): Promise<BundlerComponentResult[]> {
    return new Promise((resolve, reject) => {
      const compiler = this.getCompiler();

      compiler.run((err, stats) => {
        if (err) return reject(err);
        const components = stats.stats.map((stat) => {
          return {
            errors: stat.compilation.errors,
            id: this.getIdByPath(stat.compilation.outputOptions.path),
            warnings: stat.compilation.warnings,
          };
        });

        return resolve(components);
      });
    });
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
