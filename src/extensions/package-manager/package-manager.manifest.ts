import { LoggerExt } from '../logger';
import { providePackageManager } from './package-manager.provider';
import { DEFAULT_PACKAGE_MANAGER } from '../../constants';

export default {
  name: '@teambit/package-manager',
  dependencies: [LoggerExt],
  config: {
    packageManager: DEFAULT_PACKAGE_MANAGER
  },
  provider: providePackageManager
};
