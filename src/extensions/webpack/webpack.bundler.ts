import { MultiCompiler } from 'webpack';
import { Bundler, Bundle } from '../bundler';

export class WebpackBundler implements Bundler {
  constructor(
    /**
     * webpack compiler.
     */
    private webpackCompiler: MultiCompiler
  ) {}

  run(): Promise<Bundle> {
    return new Promise((resolve, reject) => {
      this.webpackCompiler.run((err, stats) => {
        console.log(err, stats);
        if (err) return reject(err);
        resolve(stats);
      });
    });
  }
}
