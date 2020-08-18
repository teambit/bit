import { Flows } from './flows';
import { WorkspaceExt, Workspace } from '../workspace';
import { FlowsAspect } from './flows.aspect';
import { MainRuntime } from '../cli/cli.aspect';

type ScriptDeps = [Workspace];

export const FlowsMain = {
  name: 'flows',
  runtime: MainRuntime,
  dependencies: [WorkspaceExt],
  async provider([workspace]: ScriptDeps) {
    const flows = new Flows(workspace);
    // const runCMD = new RunCmd(flows, reporter, logger);
    // cli.register(runCMD);
    return flows;
  },
};

FlowsAspect.addRuntime(FlowsMain);
