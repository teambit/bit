import path from 'path';
import DriverNotFound from './exceptions/driver-not-found';
import { DEFAULT_LANGUAGE } from '../constants';
import logger from '../logger/logger';
import { pathNormalizeToLinux } from '../utils';
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

  convertDependenciesTreeToLinux(depTree: Object):  Promise<Object> {
    Object.keys(depTree.tree).forEach(key => {
      const normalizedKey = pathNormalizeToLinux(key);
      const treeElement =depTree.tree[key];
      treeElement.files =  treeElement.files ?  treeElement.files.map(treeFile => pathNormalizeToLinux(treeFile)) : [];
      depTree.tree[normalizedKey] = treeElement;
      if (key !== normalizedKey) delete depTree.tree[key];

    });
    return depTree;
  }
  // TODO: Improve flow object return type
  getDependencyTree(cwd: string, consumerPath: string, filePath: string): Promise<Object> {
    // This is important because without this, madge won't know to resolve files if we run the
    // CMD not from the root dir
    const fullPath = path.join(cwd, filePath);
    const driver = this.getDriver(false);
    return driver.getDependencyTree(cwd, consumerPath, fullPath).then(dependenciesTree => {
      return this.convertDependenciesTreeToLinux(dependenciesTree);
    });
  }

  static load(lang) {
    return new Driver(lang);
  }
}
