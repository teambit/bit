import { ExtensionManifest } from '../../harmony';
import { ScriptsExt, Scripts } from '../scripts';
import { reactTask } from './react.task';

export const ReactExtension: ExtensionManifest = {
  name: 'react',
  dependencies: [ScriptsExt],
  provider: async (config: {}, [pipes]: [Scripts]) => {
    // pipes.register('react', reactTask);
  }
};
