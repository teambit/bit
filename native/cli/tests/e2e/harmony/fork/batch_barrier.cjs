const { WorkspaceAspect } = require('@teambit/workspace');
const { EnvsAspect } = require('@teambit/envs');
const { NodeAspect } = require('@teambit/node');
const fs = require('node:fs');
const path = require('node:path');
class ForkBatchBarrier {
  static dependencies = [WorkspaceAspect, EnvsAspect, NodeAspect];
  static async provider([workspace, envs, node]) {
    workspace.registerOnComponentAdd(async (component) => {
      if (component.id.scope === 'fixture.tools') return;
      // The actual tracker bitmap write precedes onAdd. Separate that backup
      // from the next copy's write without changing clocks or history data.
      await new Promise(resolve => setTimeout(resolve, 1100));
      fs.appendFileSync(path.join(workspace.path, 'fork-batch-observed'), component.id.toStringWithoutVersion() + '\n');
    });
    const env = node.compose([]);
    envs.registerEnv(env);
    return new ForkBatchBarrier();
  }
}
module.exports = { default: ForkBatchBarrier };
