import { Extension } from '../harmony';
import { WorkspaceExt } from '../workspace';

export default Extension.instantiate({
  name: 'Pipes', // camelCased
  dependencies: [WorkspaceExt],
  config: {}
});
