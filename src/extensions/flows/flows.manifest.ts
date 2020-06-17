import { ExtensionManifest } from '@teambit/harmony';
import { Flows } from './flows';
import { WorkspaceExt, Workspace } from '../workspace';

type ScriptDeps = [Workspace];

export default {
  name: 'flows',
  dependencies: [WorkspaceExt],
  async provider([workspace]: ScriptDeps) {
    const flows = new Flows(workspace);
    // const runCMD = new RunCmd(flows, reporter, logger);
    // cli.register(runCMD);
    return flows;
  }
} as ExtensionManifest;
