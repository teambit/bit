import { stringify, parse } from 'flatted';
import { expose } from '@teambit/worker';
import type jest from 'jest';

export class JestWorker {
  private onTestCompleteCb;

  onTestComplete(onTestComplete) {
    this.onTestCompleteCb = onTestComplete;
    // return this;
  }

  watch(
    jestConfigPath: string,
    testFiles: string[],
    rootPath: string,
    jestModulePath: string,
    envRootDir: string
  ): Promise<void> {
    return new Promise((resolve) => {
      // TODO: remove this after jest publish new version to npm: https://github.com/facebook/jest/pull/10804
      // eslint-disable-next-line
      console.warn = function () {};
      /* The path to the jest config file. */
      // eslint-disable-next-line import/no-dynamic-require,global-require
      const jestConfig = require(jestConfigPath);
      // eslint-disable-next-line import/no-dynamic-require,global-require
      const jestModule: typeof jest = require(jestModulePath);

      const jestConfigWithSpecs = Object.assign(jestConfig, {
        testMatch: testFiles,
      });

      const config: any = {
        // Setting the rootDir to the env root dir to make sure we can resolve all the jest presets/plugins
        // from the env context
        rootDir: envRootDir,
        // Setting the roots (where to search for spec files) to the root path (either workspace or capsule root)
        // TODO: consider change this to be an array of the components running dir.
        // TODO: aka: in the workspace it will be something like <ws>/node_modules/<comp-package-name>/node_modules/<comp-package-name>
        // TODO: see dependencyResolver.getRuntimeModulePath (this will make sure the peer deps resolved correctly)
        // TODO: (@GiladShoham - when trying to set it to this paths, jest ignores it probably because the paths contains "node_modules"
        // TODO: trying to set the https://jestjs.io/docs/27.x/configuration#testpathignorepatterns-arraystring to something else (as it contain node_modules by default)
        // TODO: didn't help)
        roots: [rootPath],
        // useStderr: true,
        // TODO: check way to enable it
        runInBand: true,
        silent: false,
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
                } catch (error: any) {}
              },
            },
          ],
        ],
      };

      const withEnv = Object.assign(jestConfigWithSpecs, config);
      // eslint-disable-next-line @typescript-eslint/no-floating-promises
      const res = jestModule.runCLI(withEnv, [jestConfigPath]);
      // eslint-disable-next-line no-console
      res.catch((err) => console.error(err));
      resolve();
    });
  }
}

expose(new JestWorker());
