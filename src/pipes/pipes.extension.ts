import { Extension } from '../harmony';
import { Workspace, WorkspaceExt } from '../workspace';
import { PaperExt, Paper } from '../paper';
import RunCmd from './run.cmd';

type PipesDeps = [];
type Config = {};

export default Extension.instantiate<Config, PipesDeps>({
  name: 'Pipes',
  dependencies: [WorkspaceExt, PaperExt],
  config: {},
  provider: async (_config: Config, []: PipesDeps) => {}
});
