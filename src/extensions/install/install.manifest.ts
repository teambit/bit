import { ExtensionManifest } from '@teambit/harmony';
import { provideInstaller } from './install.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';
import { PackageManagerExt } from '../package-manager';
import { ReporterExt } from '../reporter';

export default {
  name: 'Install',
  dependencies: [BitCliExt, WorkspaceExt, PackageManagerExt, ReporterExt],
  provider: provideInstaller
} as ExtensionManifest;
