import { Extension } from '../harmony';
import { WorkspaceExt } from '../extensions/workspace';
import { PaperExt } from '../extensions/paper';

type PipesDeps = [];
type Config = {};

export default Extension.instantiate<Config, PipesDeps>({
  name: 'Pipes',
  dependencies: [WorkspaceExt, PaperExt],
  config: {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provider: async (_config: Config) => {}
});
