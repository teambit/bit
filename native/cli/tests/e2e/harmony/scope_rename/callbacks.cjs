const { EnvsAspect } = require('@teambit/envs');
const { NodeAspect } = require('@teambit/node');
const { WorkspaceAspect } = require('@teambit/workspace');
const fs = require('node:fs');
const path = require('node:path');
class ScopeLifecycle {
  static dependencies = [WorkspaceAspect, EnvsAspect, NodeAspect];
  static async provider([workspace, envs, node]) {
    if (fs.existsSync(path.join(workspace.path,'scope-lifecycle-active'))) fs.writeFileSync(path.join(workspace.path,'scope-provider-started'),'started\n');
    workspace.registerOnComponentLoad(async (component) => {
      if (!fs.existsSync(path.join(workspace.path, 'scope-lifecycle-active'))) return;
      if (!['comp1', 'comp2'].includes(component.id.fullName)) return;
      console.log(`scope lifecycle load ${component.id.toString()}`);
      if (component.id.fullName === 'comp1' && component.id.scope !== 'replacement.scope' && fs.existsSync(path.join(workspace.path, 'scope-mutate-later-source'))) {
        fs.writeFileSync(path.join(workspace.path, 'comp2', 'added-after-first-load.txt'), 'new source file\n');
      }
      if (component.id.fullName === 'comp2' && component.id.scope !== 'replacement.scope' && fs.existsSync(path.join(workspace.path, 'comp2', 'added-after-first-load.txt'))) {
        console.log('scope lifecycle later source observed');
      }
      if (component.id.fullName === 'comp2' && component.id.scope !== 'replacement.scope' && fs.existsSync(path.join(workspace.path, 'scope-second-load-fails'))) {
        throw new Error('fixture second scoped load rejected');
      }
      if (component.id.fullName === 'comp2' && component.id.scope !== 'replacement.scope' && fs.existsSync(path.join(workspace.path,'scope-added-comp1'))) {
        // Separate deprecating comp1 from adding comp2 at the actual source reload boundary.
        await new Promise(resolve => setTimeout(resolve,1100));
      }
    });
    workspace.registerOnComponentAdd(async (component) => {
      if (!fs.existsSync(path.join(workspace.path, 'scope-lifecycle-active'))) return;
      console.log(`scope lifecycle added ${component.id.toString()}`);
      await new Promise(resolve => setTimeout(resolve, 1100));
      fs.writeFileSync(path.join(workspace.path, `scope-added-${component.id.fullName}`), 'observed\n');
      if (component.id.fullName === 'comp2' && fs.existsSync(path.join(workspace.path, 'scope-second-add-fails'))) {
        throw new Error('fixture second scoped addition rejected');
      }
    });
    const env=node.compose([]);env.getDependencies=()=>({});envs.registerEnv(env);
    return new ScopeLifecycle();
  }
}
module.exports = { default: ScopeLifecycle };
