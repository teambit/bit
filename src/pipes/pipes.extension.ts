import { Extension } from '../harmony';
import { WorkspaceExt } from '../workspace';

export default Extension.instantiate({
  name: 'Pipes',
  dependencies: [WorkspaceExt],
  config: {
    pipes: []
  },
  provider: async () => {
    console.log('pipes is loaded');
  }
});
