import { providePackageManager } from './package-manager.provider';

const DEFAULT_PACKAGE_MANAGER = 'librarian';

export default {
  name: 'PackageManager',
  dependencies: [],
  config: {
    packageManager: DEFAULT_PACKAGE_MANAGER
  },
  provider: providePackageManager
};
