/* eslint-disable @typescript-eslint/no-unused-vars */

import { Flows } from './flows';
import { BitCliExt, BitCli } from '../cli';
import { WorkspaceExt, Workspace } from '../workspace';
import { RunCmd } from './run.cmd';

type ScriptDeps = [BitCli, Workspace];

export default {
  name: 'flows',
  dependencies: [BitCliExt, WorkspaceExt],
  async provider([cli, workspace]: ScriptDeps) {
    const flows = new Flows(workspace);
    const runCMD = new RunCmd(flows);
    cli.register(runCMD);
    return flows;
  }
};
