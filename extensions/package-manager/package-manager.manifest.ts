import { ReporterExt } from '@bit/bit.core.reporter';
import { providePackageManager } from './package-manager.provider';

const DEFAULT_PACKAGE_MANAGER = 'librarian';

export default {
  name: 'packageManager',
  dependencies: [ReporterExt],
  config: {
    packageManager: DEFAULT_PACKAGE_MANAGER
  },
  provider: providePackageManager
};
