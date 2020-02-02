import { ExtensionManifest } from '../../harmony';
import { BuildExt, Build } from '../build';
import { reactTask } from './react.task';

export const ReactExtension: ExtensionManifest = {
  name: 'react',
  dependencies: [BuildExt],
  provider: async (config: {}, [build]: [Build]) => {
    build.registerTask('react', reactTask);
  }
};
