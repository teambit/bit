import { stringify, parse } from 'flatted';
import { expose } from '@teambit/worker';
import { runCLI } from 'jest';

export class JestWorker {
  private onTestCompleteCb;

  onTestComplete(onTestComplete) {
    this.onTestCompleteCb = onTestComplete;
    // return this;
  }

  watch(jestConfigPath: string, testFiles: string[], rootPath: string): Promise<void> {
    return new Promise((resolve) => {
      // TODO: remove this after jest publish new version to npm: https://github.com/facebook/jest/pull/10804
      // eslint-disable-next-line
      console.warn = function () {};
      // eslint-disable-next-line
      const jestConfig = require(jestConfigPath);

      const jestConfigWithSpecs = Object.assign(jestConfig, {
        testMatch: testFiles,
      });

      const config: any = {
        // useStderr: true,
        // TODO: check way to enable it
        runInBand: true,
        silent: false,
        rootDir: rootPath,
        watch: true,
        watchAll: true,
        watchPlugins: [
          [
            `${__dirname}/watch.js`,
            {
              specFiles: testFiles,
              onComplete: (results) => {
                if (!this.onTestCompleteCb) return;
                try {
                  const json = parse(stringify(results));
                  this.onTestCompleteCb(json);
                  // disable eslint because we want to catch error but not print it on worker
                  // eslint-disable-next-line
                } catch (error) {}
              },
            },
          ],
        ],
      };

      const withEnv = Object.assign(jestConfigWithSpecs, config);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      const res = runCLI(withEnv, [jestConfigPath]);
      // eslint-disable-next-line no-console
      res.catch((err) => console.error(err));
      resolve();
    });
  }
}

expose(new JestWorker());
