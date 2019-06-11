// @flow
import path from 'path';
import DriverNotFound from './exceptions/driver-not-found';
import { DEFAULT_LANGUAGE } from '../constants';
import logger from '../logger/logger';
import type {
  Tree,
  ResolveModulesConfig
} from '../consumer/component/dependencies/dependency-resolver/types/dependency-tree-type';

export default class Driver {
  lang: string;
  driver: Object;

  constructor(lang: string = DEFAULT_LANGUAGE) {
    this.lang = lang;
  }

  driverName(): string {
    return this.lang.startsWith('bit-') ? this.lang : `bit-${this.lang}`;
  }

  getDriver(silent: boolean = true): ?Object {
    if (this.driver) return this.driver;
    const langDriver = this.driverName();
    try {
      this.driver = require(langDriver);
      return this.driver;
    } catch (err) {
      logger.error('failed to get the driver', err);
      if (silent) return undefined;
      if (err.code !== 'MODULE_NOT_FOUND' && err.message !== 'missing path') throw err;
      throw new DriverNotFound(langDriver, this.lang);
    }
  }

  runHook(hookName: string, param: *, returnValue?: *): Promise<*> {
    const driver = this.getDriver();
    // $FlowFixMe
    if (!driver || !driver.lifecycleHooks || !driver.lifecycleHooks[hookName]) {
      if (!driver) logger.info('unable to find a driver, the hooks will be ignored');
      else logger.info(`the driver doesn't implement ${hookName} hook`);
      return Promise.resolve(returnValue); // it's ok for a driver to not implement a hook
    }

    return driver.lifecycleHooks[hookName](param).then(() => returnValue);
  }

  // TODO: Improve flow object return type
  getDependencyTree(
    cwd: string,
    consumerPath: string,
    filePaths: string[],
    bindingPrefix: string,
    resolveModulesConfig: ResolveModulesConfig,
    cacheResolvedDependencies: Object,
    cacheProjectAst: ?Object
  ): Promise<{ tree: Tree }> {
    // This is important because without this, madge won't know to resolve files if we run the
    // CMD not from the root dir
    const fullPaths = filePaths.map(filePath => path.join(cwd, filePath));
    const driver = this.getDriver(false);
    // $FlowFixMe driver must be set
    return driver.getDependencyTree({
      baseDir: cwd,
      consumerPath,
      filePaths: fullPaths,
      bindingPrefix,
      resolveModulesConfig,
      visited: cacheResolvedDependencies,
      cacheProjectAst
    });
  }

  // TODO: Improve flow object return type
  npmLogin(token: string, npmrcPath: string, registryUrl: string): Object {
    const driver = this.getDriver(false);
    return driver.npmLogin(token, npmrcPath, registryUrl);
  }

  static load(lang?: string) {
    return new Driver(lang);
  }
}
