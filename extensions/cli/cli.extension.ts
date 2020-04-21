import { ExtensionManifest } from '@teambit/harmony';
import { CLIProvider } from './cli.provider';
import { PaperExt } from '../paper';

export const BitCliExt: ExtensionManifest = {
  name: 'BitCli',
  dependencies: [PaperExt],
  provider: CLIProvider
};
