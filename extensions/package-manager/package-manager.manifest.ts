import { LoggerExt } from '@bit/bit.core.logger';
import { providePackageManager } from './package-manager.provider';

const DEFAULT_PACKAGE_MANAGER = 'librarian';

export default {
  name: 'packageManager',
  dependencies: [LoggerExt],
  config: {
    packageManager: DEFAULT_PACKAGE_MANAGER
  },
  provider: providePackageManager
};
