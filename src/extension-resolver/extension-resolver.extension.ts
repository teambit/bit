import { Extension } from '../harmony';
import { WorkspaceExt } from '../workspace';
import { BitExt } from '../bit';
import { extensionResolverProvider } from './extension-resolver.provider';

export default Extension.instantiate({
  name: 'ExtensionResolver',
  dependencies: [BitExt],
  config: {},
  provider: extensionResolverProvider
});
