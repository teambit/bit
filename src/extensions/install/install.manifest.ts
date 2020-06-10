import { ExtensionManifest } from '@teambit/harmony';
import { provideInstaller } from './install.provider';
import { WorkspaceExt } from '../workspace';
import { PackageManagerExt } from '../package-manager';
import { ReporterExt } from '../reporter';
import { PaperExtension } from '../paper';

export default {
  name: 'Install',
  dependencies: [PaperExtension, WorkspaceExt, PackageManagerExt, ReporterExt],
  provider: provideInstaller
} as ExtensionManifest;
