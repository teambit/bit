const { WorkspaceAspect } = require('@teambit/workspace');
const fs = require('node:fs');
const path = require('node:path');
class RenameLoad {
  static dependencies = [WorkspaceAspect];
  static async provider([workspace]) {
    workspace.registerOnComponentAdd(async (component) => {
      if (component.id.fullName !== 'comp2') return;
      // Retain both adding-target and deprecating-source bitmap snapshots:
      // the published backup filenames have only second precision.
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });
    workspace.registerOnComponentLoad(async (component) => {
      if (!fs.existsSync(path.join(workspace.path, 'rename-load-active'))) return;
      if (component.id.fullName === 'comp2') {
        // Separate the initial rename bitmap write from the target writer backup.
        await new Promise((resolve) => setTimeout(resolve, 1100));
        console.log('rename target onLoad mutation');
        if (fs.existsSync(path.join(workspace.path, 'rename-target-load-fails'))) {
          throw new Error('fixture target onLoad rejected');
        }
        const target = component.state._consumer.files.find((source) => source.relative === 'index.js');
        target.contents = Buffer.concat([target.contents, Buffer.from('\n// target onLoad mutation\n')]);
        const companion = component.state._consumer.files.find((source) => source.relative === 'companion.js');
        if (companion) companion.contents = Buffer.concat([companion.contents, Buffer.from('\n// companion onLoad mutation\n')]);
        return;
      }
      if (component.id.fullName === 'dependent') {
        const dependent = component.state._consumer.files.find((source) => source.relative === 'index.js');
        dependent.contents = Buffer.concat([dependent.contents, Buffer.from('\n// dependent onLoad mutation\n')]);
        const companion = component.state._consumer.files.find((source) => source.relative === 'companion.js');
        if (companion) companion.contents = Buffer.concat([companion.contents, Buffer.from('\n// companion onLoad mutation\n')]);
        console.log('rename dependent onLoad mutation');
        return;
      }
      if (component.id.fullName !== 'comp1') return;
      const file = component.state._consumer.files.find((source) => source.relative === 'index.js');
      const disk = fs.readFileSync(file.path);
      if (disk.includes(Buffer.from('// source onLoad mutation'))) {
        throw new Error('onLoad unexpectedly wrote the original source to disk');
      }
      file.contents = Buffer.concat([file.contents, Buffer.from('\n// source onLoad mutation\n')]);
      console.log('rename source onLoad mutation');
    });
    return new RenameLoad();
  }
}
module.exports = { default: RenameLoad };
