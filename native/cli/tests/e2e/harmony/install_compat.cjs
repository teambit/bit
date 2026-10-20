const { WorkspaceAspect } = require('@teambit/workspace');
const { InstallAspect } = require('@teambit/install');
const { DependencyResolverAspect } = require('@teambit/dependency-resolver');
const fs = require('node:fs');
const path = require('node:path');

class InstallCompat {
  static dependencies = [WorkspaceAspect, InstallAspect, DependencyResolverAspect];
  static async provider([workspace, install, resolver]) {
    const seenDuringPlanning = new Set();
    workspace.registerOnComponentLoad(component => {
      if (component.id.fullName === 'comp1') seenDuringPlanning.add('comp1');
    });
    const marker = name => fs.existsSync(path.join(workspace.path, name));
    const record = phase => {
      if (marker('install-compat-active')) {
        fs.appendFileSync(path.join(workspace.path, 'install-compat-phases'), `${phase}\n`);
      }
    };
    install.registerPreInstall(async options => {
      if (!marker('install-compat-active')) return;
      record('install-pre');
      fs.writeFileSync(path.join(workspace.path, 'install-compat-planning.json'), JSON.stringify({
        seenComp1: seenDuringPlanning.has('comp1'),
      }));
      options.skipPrune = true;
      if (marker('install-compat-fail-pre')) throw new Error('fixture InstallMain pre failure');
    });
    install.registerPostInstall(async () => record('install-post'));
    let retained;
    resolver.registerPreInstallSubscribers([(installer, args) => {
      if (!marker('install-compat-active')) return;
      record('manager-pre');
      retained = { installer, args, options: args.options, packageOptions: args.packageManagerOptions };
      const original = installer.packageManager.install;
      installer.packageManager.install = async function (...values) {
        record('manager-run');
        if (marker('install-compat-fail-pm')) throw new Error('fixture package manager failure');
        return Reflect.apply(original, this, values);
      };
      args.packageManagerOptions.includeOptionalDeps = false;
      args.packageManagerOptions.throttleProgress = 60000;
      args.packageManagerOptions.hidePackageManagerOutput = true;
      args.options = { ...args.options };
      args.rootDir = path.join(workspace.path, 'ignored-subscriber-root');
    }]);
    resolver.registerPostInstallSubscribers([(installer, args) => {
      if (!marker('install-compat-active')) return;
      record('manager-post');
      fs.writeFileSync(path.join(workspace.path, 'install-compat-receiver.json'), JSON.stringify({
        sameInstaller: installer === retained.installer,
        sameArgs: args === retained.args,
        sameOptions: args.options === retained.options,
        samePackageOptions: args.packageManagerOptions === retained.packageOptions,
        optional: args.packageManagerOptions.includeOptionalDeps,
        reassignedRoot: args.rootDir.endsWith('ignored-subscriber-root'),
      }));
    }]);
    return new InstallCompat();
  }
}
module.exports = { default: InstallCompat };
