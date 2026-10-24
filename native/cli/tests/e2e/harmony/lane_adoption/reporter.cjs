const { WorkspaceAspect } = require('@teambit/workspace');
const { DependencyResolverAspect } = require('@teambit/dependency-resolver');
const fs = require('node:fs');
const path = require('node:path');

class QuietReporter {
  static dependencies = [WorkspaceAspect, DependencyResolverAspect];
  static async provider([workspace, resolver]) {
    const active = () => fs.existsSync(path.join(workspace.path, 'quiet-reporter-active'));
    const record = value => fs.appendFileSync(
      path.join(workspace.path, 'quiet-reporter-receipt.jsonl'), JSON.stringify(value) + '\n');
    let retained;
    resolver.registerPreInstallSubscribers([(installer, args) => {
      if (!active()) return;
      retained = { installer, args, packageManagerOptions: args.packageManagerOptions };
      args.packageManagerOptions.hidePackageManagerOutput = true;
      record({ phase: 'pre', hidden: args.packageManagerOptions.hidePackageManagerOutput });
    }]);
    resolver.registerPostInstallSubscribers([(installer, args) => {
      if (!active()) return;
      record({
        phase: 'post', sameInstaller: installer === retained.installer,
        sameArgs: args === retained.args,
        samePackageOptions: args.packageManagerOptions === retained.packageManagerOptions,
        hidden: args.packageManagerOptions.hidePackageManagerOutput,
      });
    }]);
    return new QuietReporter();
  }
}
module.exports = { default: QuietReporter };
