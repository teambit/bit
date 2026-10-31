const { WorkspaceAspect } = require('@teambit/workspace');
const fs = require('node:fs');
const path = require('node:path');
class ForkLifecycle {
  static dependencies = [WorkspaceAspect];
  static async provider([workspace]) {
    workspace.registerOnComponentLoad(async (component) => {
      if (!fs.existsSync(path.join(workspace.path, 'fork-active'))) return;
      if (component.id.fullName === 'comp2') {
        console.log(`fork target load ${component.id.toString()}`);
        return;
      }
      if (component.id.fullName !== 'comp1') return;
      console.log(`fork source load ${component.id.toString()}`);
      const file = component.state._consumer.files.find(file => file.relative === 'index.js');
      file.contents = Buffer.concat([file.contents, Buffer.from('\n// fork source in-memory mutation\n')]);
    });
    workspace.registerOnComponentAdd(async (component) => {
      if (!fs.existsSync(path.join(workspace.path, 'fork-active'))) return;
      if (component.id.fullName !== 'comp2') return;
      console.log(`fork target added ${component.id.toString()}`);
      fs.writeFileSync(path.join(workspace.path, 'fork-added'), 'observed\n');
      if (fs.existsSync(path.join(workspace.path, 'fork-add-fails'))) throw new Error('fixture fork onAdd rejected');
    });
    return new ForkLifecycle();
  }
}
module.exports = { default: ForkLifecycle };
