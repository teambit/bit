import { provideInstaller } from './install.provider';
import { BitCliExt } from '../cli';
import { WorkspaceExt } from '../workspace';

export default {
  name: 'Install',
  dependencies: [BitCliExt, WorkspaceExt],
  config: {},
  provider: provideInstaller
};
