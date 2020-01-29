import { Extension } from '../../extensions/harmony';
import { WorkspaceExt } from '../workspace';
import { PaperExt } from '../paper';

type PipesDeps = [];
type Config = {};

export default Extension.instantiate<Config, PipesDeps>({
  name: 'Pipes',
  dependencies: [WorkspaceExt, PaperExt],
  config: {},
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  provider: async (_config: Config) => {}
});
