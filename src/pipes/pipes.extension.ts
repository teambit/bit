import { Extension } from '../harmony';
import { Workspace, WorkspaceExt } from '../workspace';
import { PaperExt, Paper } from '../paper';
import RunCmd from './run.cmd';

type PipesDeps = [Workspace, Paper];
type Config = {};

export default Extension.instantiate<Config, PipesDeps>({
  name: 'Pipes',
  dependencies: [WorkspaceExt, PaperExt],
  config: {},
  provider: async (_config: Config, [_workspace, paper]: PipesDeps) => {
    console.log('~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~');
    console.log(paper);
    paper.register(new RunCmd());
    console.log('yo');
  }
});
