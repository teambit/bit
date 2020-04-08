import { provideInstaller } from './install.provider';
import { BitCli } from '../cli';
import { WorkspaceExt } from '../workspace';
import { PackageManagerExt } from '../package-manager';
import { ReporterExt } from '../reporter';

export default {
  name: 'Install',
  dependencies: [BitCli, WorkspaceExt, PackageManagerExt, ReporterExt],
  provider: provideInstaller
};
