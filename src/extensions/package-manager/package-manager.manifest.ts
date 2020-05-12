import { LoggerExt } from '../logger';
import { providePackageManager } from './package-manager.provider';

const DEFAULT_PACKAGE_MANAGER = 'librarian';

export default {
  name: '@teambit/package-manager',
  dependencies: [LoggerExt],
  config: {
    packageManager: DEFAULT_PACKAGE_MANAGER
  },
  provider: providePackageManager
};
