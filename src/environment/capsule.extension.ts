import { Extension } from '../harmony';
import capsuleProvider from './capsule.provider';
import { WorkspaceExt } from '../workspace';

export default Extension.instantiate({
  name: 'Capsule',
  dependencies: [],
  config: {},
  provider: capsuleProvider
});
