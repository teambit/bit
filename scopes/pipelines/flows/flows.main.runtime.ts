import { MainRuntime } from '@teambit/cli';
import { Workspace, WorkspaceAspect } from '@teambit/workspace';

import { Flows } from './flows';
import { FlowsAspect } from './flows.aspect';

type ScriptDeps = [Workspace];

export const FlowsMain = {
  name: 'flows',
  runtime: MainRuntime,
  dependencies: [WorkspaceAspect],
  async provider([workspace]: ScriptDeps) {
    const flows = new Flows(workspace);
    // const runCMD = new RunCmd(flows, reporter, logger);
    // cli.register(runCMD);
    return flows;
  },
};

FlowsAspect.addRuntime(FlowsMain);
