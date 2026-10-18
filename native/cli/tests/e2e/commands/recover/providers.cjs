const { WorkspaceAspect } = require('@teambit/workspace');
const fs = require('node:fs');
const path = require('node:path');
class RecoveryProvider {
  static dependencies = [WorkspaceAspect];
  static async provider([workspace]) {
    if (fs.existsSync(path.join(workspace.path, 'recover-provider-active'))) {
      const id = await workspace.resolveComponentId('comp1');
      workspace.bitMap.addComponentConfig(
        id, 'teambit.pkg/pkg', { packageJson: { recoveryProvider: true } }, true,
      );
      await workspace.bitMap.write('recover-provider');
      // Preserve two real bitmap backup snapshots despite second-precision IDs.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      fs.mkdirSync(path.join(workspace.path, 'comp1'), { recursive: true });
      fs.writeFileSync(path.join(workspace.path, 'comp1/provider.js'), 'module.exports=42;\n');
      console.log('recovery provider mutation');
    }
    return new RecoveryProvider();
  }
}
module.exports = { default: RecoveryProvider };
