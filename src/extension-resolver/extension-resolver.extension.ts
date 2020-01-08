import { Extension } from '../harmony';
import { WorkspaceExt } from '../workspace';
import { BitExt } from '../bit';

export default Extension.instantiate({
  name: 'ExtensionResolver',
  dependencies: [BitExt],
  config: {},
  provider: async () => {}
});
