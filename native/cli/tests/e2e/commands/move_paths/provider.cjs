const { WorkspaceAspect } = require('@teambit/workspace');
const fs = require('node:fs');
const path = require('node:path');
class IdentityProvider {
  static dependencies = [WorkspaceAspect];
  static async provider([workspace]) {
    workspace.registerOnComponentLoad(async (component) => {
      if (component.id.fullName === 'comp2') {
        // Keep the two new-rename bitmap backups in distinct real seconds.
        await new Promise((resolve) => setTimeout(resolve, 1100));
      }
    });
    if (fs.existsSync(path.join(workspace.path, 'identity-provider-active'))) {
      const id = await workspace.resolveComponentId('comp1');
      workspace.bitMap.addComponentConfig(
        id, 'teambit.component/deprecation', { deprecate: false }, true,
      );
      workspace.bitMap.addComponentConfig(
        id, 'teambit.pkg/pkg', { packageJson: { identityProvider: 'retained' } }, true,
      );
      await workspace.bitMap.write('identity-provider');
      // Bitmap backup filenames have second precision. Separate the real provider
      // write from the subsequent command write, retaining both exact snapshots.
      await new Promise((resolve) => setTimeout(resolve, 1100));
      fs.writeFileSync(path.join(workspace.path, 'comp1/provider-created.js'), 'module.exports=42;\n');
      console.log('identity provider mutation');
    }
    return new IdentityProvider();
  }
}
module.exports = { default: IdentityProvider };
