import reqCwd from 'req-cwd';
import DriverNotFound from './exceptions/driver-not-found';
import { DEFAULT_LANGUAGE } from '../constants';

export default class Driver {
  lang: string;
  driver: Object;

  constructor(lang: string = DEFAULT_LANGUAGE) {
    this.lang = lang;
  }

  getDriver(silent: boolean = true): ?Object {
    if (this.driver) return this.driver;
    const langDriver = this.lang.startsWith('bit-') ? this.lang : `bit-${this.lang}`;
    try {
      this.driver = reqCwd(langDriver);
      return this.driver;
    } catch (err) {
      if (silent) return undefined;
      if (err.code !== 'MODULE_NOT_FOUND' && err.message !== 'missing path') throw err;
      throw new DriverNotFound(langDriver, this.lang);
    }
  }

  runHook(hookName: string, param: *, returnValue?: *): Promise<*> {
    const driver = this.getDriver();
    // $FlowFixMe
    if (!driver || !driver.lifecycleHooks || !driver.lifecycleHooks[hookName]) {
      return Promise.resolve(returnValue); // it's ok for a driver to not implement a hook
    }

    return driver.lifecycleHooks[hookName](param).then(() => returnValue);
  }

  static load(lang) {
    return new Driver(lang);
  }
}
