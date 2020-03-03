import { provideInstaller } from './install.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { PackageManagerExt } from '../package-manager';

export default {
  name: 'Install',
  dependencies: [BitCliExt, WorkspaceExt, PackageManagerExt],
  provider: provideInstaller
};
