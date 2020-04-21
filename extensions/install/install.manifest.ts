import { provideInstaller } from './install.provider';
import { BitCliExt } from '@bit/bit.core.cli';
import { WorkspaceExt } from '@bit/bit.core.workspace';
import { PackageManagerExt } from '@bit/bit.core.package-manager';
import { ReporterExt } from '@bit/bit.core.reporter';

export default {
  name: 'Install',
  dependencies: [BitCliExt, WorkspaceExt, PackageManagerExt, ReporterExt],
  provider: provideInstaller
};
