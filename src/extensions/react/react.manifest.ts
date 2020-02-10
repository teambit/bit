import { ExtensionManifest } from '../../harmony';
import { PipesExt, Pipes } from '../pipes';
import { reactTask } from './react.task';

export const ReactExtension: ExtensionManifest = {
  name: 'react',
  dependencies: [PipesExt],
  provider: async (config: {}, [pipes]: [Pipes]) => {
    // pipes.registerTask('react', reactTask);
  }
};
