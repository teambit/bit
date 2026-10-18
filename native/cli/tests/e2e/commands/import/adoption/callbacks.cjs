const { WorkspaceAspect } = require('@teambit/workspace');
const fs = require('node:fs');
const path = require('node:path');
class AdoptionLifecycle {
  static dependencies = [WorkspaceAspect];
  static async provider([workspace]) {
    const active = name => fs.existsSync(path.join(workspace.path, name));
    if (active('adoption-provider-active')) {
      console.log('adoption configured provider started');
      fs.writeFileSync(path.join(workspace.path, 'adoption-provider-observed'), 'started\n');
      if (active('adoption-provider-edit')) {
        const id = workspace.listIds().find(id => id.fullName === 'comp1');
        const directory = workspace.componentDir(id);
        fs.writeFileSync(path.join(directory, 'index.js'),
          `module.exports=require('@${id.scope}/comp2');\n`);
        fs.writeFileSync(path.join(workspace.path, 'adoption-provider-edit-receipt.json'), JSON.stringify({ module: __filename, directory }));
        console.log('adoption configured provider changed live dependencies');
      }
    }
    workspace.registerOnComponentLoad(async component => {
      if (active('adoption-provider-active') && active('adoption-record-load-order')) {
        fs.appendFileSync(path.join(workspace.path, 'adoption-load-order.jsonl'), JSON.stringify(component.id.toString()) + '\n');
      }
      if (active('adoption-provider-active') && active('adoption-graph-load-fails') && ['comp1', 'comp2'].includes(component.id.fullName)) {
        console.log(`adoption graph seeder load ${component.id.toString()}`);
        if (component.id.fullName === 'comp1') throw new Error('adoption first graph seeder rejected');
        fs.writeFileSync(path.join(workspace.path, 'adoption-second-seeder-observed'), 'loaded\n');
      }
      if (!active('adoption-provider-active') || !active('adoption-target-load-fails')) return;
      if (component.id.fullName !== 'comp2') return;
      console.log(`adoption imported target load ${component.id.toString()}`);
      throw new Error('adoption imported target rejected');
    });
    return new AdoptionLifecycle();
  }
}
module.exports = { default: AdoptionLifecycle };
