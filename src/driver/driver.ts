import * as path from 'path';
import bitJavascript from 'bit-javascript';
import DriverNotFound from './exceptions/driver-not-found';
import { DEFAULT_LANGUAGE } from '../constants';
import logger from '../logger/logger';
import {
  Tree,
  ResolveModulesConfig
} from '../consumer/component/dependencies/dependency-resolver/types/dependency-tree-type';

export default class Driver {
  lang: string;
  // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
  driver: Record<string, any>;

  constructor(lang: string = DEFAULT_LANGUAGE) {
    this.lang = lang;
  }

  driverName(): string {
    return this.lang.startsWith('bit-') ? this.lang : `bit-${this.lang}`;
  }

  getDriver(silent = true): Record<string, any> | null | undefined {
    if (this.driver) return this.driver;
    const langDriver = this.driverName();
    if (langDriver === 'bit-javascript') {
      this.driver = bitJavascript;
    } else {
      try {
        // eslint-disable-next-line import/no-dynamic-require, global-require
        this.driver = require(langDriver);
      } catch (err) {
        logger.error('failed to get the driver', err);
        if (silent) return undefined;
        if (err.code !== 'MODULE_NOT_FOUND' && err.message !== 'missing path') throw err;
        throw new DriverNotFound(langDriver, this.lang);
      }
    }

    return this.driver;
  }

  runHook(hookName: string, param: any, returnValue?: any): Promise<any> {
    const driver = this.getDriver();
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    if (!driver || !driver.lifecycleHooks || !driver.lifecycleHooks[hookName]) {
      if (!driver) logger.info('unable to find a driver, the hooks will be ignored');
      else logger.info(`the driver doesn't implement ${hookName} hook`);
      return Promise.resolve(returnValue); // it's ok for a driver to not implement a hook
    }

    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return driver.lifecycleHooks[hookName](param).then(() => returnValue);
  }

  // TODO: Improve flow object return type
  getDependencyTree(
    cwd: string,
    consumerPath: string,
    filePaths: string[],
    bindingPrefix: string,
    resolveModulesConfig: ResolveModulesConfig,
    cacheResolvedDependencies: Record<string, any>,
    cacheProjectAst: Record<string, any> | null | undefined
  ): Promise<{ tree: Tree }> {
    // This is important because without this, madge won't know to resolve files if we run the
    // CMD not from the root dir
    const fullPaths = filePaths.map(filePath => path.join(cwd, filePath));
    const driver = this.getDriver(false);
    // $FlowFixMe driver must be set
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
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
  npmLogin(token: string, npmrcPath: string, registryUrl: string): Record<string, any> {
    const driver = this.getDriver(false);
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    return driver.npmLogin(token, npmrcPath, registryUrl);
  }

  static load(lang?: string) {
    return new Driver(lang);
  }
}
