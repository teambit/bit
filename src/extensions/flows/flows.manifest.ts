/* eslint-disable @typescript-eslint/no-unused-vars */

import { Flows } from './flows';
import { BitCliExt, BitCli } from '../cli';
import { WorkspaceExt, Workspace } from '../workspace';
import { RunCmd } from './run';
import { ReporterExt, Reporter } from '../reporter';

type ScriptDeps = [BitCli, Workspace, Reporter];

export default {
  name: 'flows',
  dependencies: [BitCliExt, WorkspaceExt, ReporterExt],
  async provider([cli, workspace, reporter]: ScriptDeps) {
    const flows = new Flows(workspace);
    const runCMD = new RunCmd(flows, reporter);
    cli.register(runCMD);
    return flows;
  }
};
