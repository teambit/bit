const { WorkspaceAspect } = require('@teambit/workspace');
const fs = require('node:fs');
const path = require('node:path');
class LaneAddDelay {
  static dependencies = [WorkspaceAspect];
  static async provider([workspace]) {
    workspace.registerOnComponentAdd(async (component) => {
      if (!['comp11', 'foo', 'comp2'].includes(component.id.fullName)) return;
      // Published bitmap backups have second-resolution filenames. Keep the
      // real add-target and remove-source writes in distinct seconds, retaining
      // both full snapshots instead of allowing timing-dependent overwrites.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    workspace.registerOnComponentLoad(async (component) => {
      const file = path.join(workspace.path, 'identity-load-delay-target');
      if (!fs.existsSync(file)) return;
      if (component.id.toStringWithoutVersion() !== fs.readFileSync(file, 'utf8')) return;
      // A new identity is loaded after the first bitmap write and before writeMany.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    return new LaneAddDelay();
  }
}
module.exports = { default: LaneAddDelay };
