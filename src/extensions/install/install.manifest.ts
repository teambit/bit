import { ExtensionManifest } from '@teambit/harmony';
import { provideInstaller } from './install.provider';
import { WorkspaceExt } from '../workspace';
import { PackageManagerExt } from '../package-manager';
import { ReporterExt } from '../reporter';
import { CLIExtension } from '../cli';

export default {
  name: 'Install',
  dependencies: [CLIExtension, WorkspaceExt, PackageManagerExt, ReporterExt],
  provider: provideInstaller
} as ExtensionManifest;
