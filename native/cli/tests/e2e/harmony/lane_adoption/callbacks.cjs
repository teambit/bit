const { WorkspaceAspect } = require('@teambit/workspace');
const { DependencyResolverAspect } = require('@teambit/dependency-resolver');
const { EnvsAspect } = require('@teambit/envs');
const { NodeAspect } = require('@teambit/node');
const fs = require('node:fs');
const path = require('node:path');
class LaneAdoptionLifecycle {
  static dependencies = [WorkspaceAspect, DependencyResolverAspect, EnvsAspect, NodeAspect];
  static async provider([workspace, resolver, envs, node]) {
    const active = () => fs.existsSync(path.join(workspace.path, 'lane-adoption-provider-active'));
    const receipt = phase => {
      if (!active() || !fs.existsSync(path.join(workspace.path, 'lane-adoption-record-phases'))) return;
      const filename = path.join(workspace.path, '.bitmap');
      const bitmap = workspace.consumer.bitMap.constructor.loadFromContentWithoutLoadingFiles(
        fs.readFileSync(filename), filename, workspace.path, workspace.defaultScope);
      const component = bitmap.components.find(row => row.id.fullName === 'comp1');
      const provider = workspace.consumer.bitMap.components.find(row => row.id.fullName === 'env/lane-adoption');
      fs.appendFileSync(path.join(workspace.path, 'lane-adoption-phases.jsonl'), JSON.stringify({
        phase, diskLane: bitmap.laneId ? bitmap.laneId.toString() : null,
        consumerLane: workspace.consumer.getCurrentLaneId().name,
        version: component && component.id.version,
        providerFiles: provider ? provider.files.map(file => file.relativePath) : null
      }) + '\n');
    };
    if (active()) {
      console.log('lane adoption configured provider started');
      fs.appendFileSync(path.join(workspace.path, 'workspace.jsonc'), '\n// lane adoption provider config mutation\n');
      fs.writeFileSync(path.join(workspace.path, 'lane-adoption-provider-receipt.json'),
        JSON.stringify({module: __filename, workspace: workspace.path}));
    }
    if (!fs.existsSync(path.join(workspace.path, 'lane-adoption-disable-onload'))) {
      workspace.registerOnComponentLoad(component => {
        if (component.id.fullName === 'comp1') {
          receipt('onLoad');
          if (active() && fs.existsSync(path.join(workspace.path, 'lane-adoption-mutate-later-source'))
              && !fs.existsSync(path.join(workspace.path, 'lane-adoption-later-source-mutated'))) {
            const laterSource = path.join(workspace.path, 'comp2/index.js');
            fs.writeFileSync(laterSource, "require('react'); // earlier onLoad changed later source\n" + fs.readFileSync(laterSource));
            fs.writeFileSync(path.join(workspace.path, 'lane-adoption-later-source-mutated'), 'comp1');
          }
          if (active() && fs.existsSync(path.join(workspace.path, 'lane-history-fail-load'))) {
            throw new Error('lane history actual onLoad failure');
          }
        }
      });
    }
    let retainedInstall;
    const throttleInstall = () => active() && fs.existsSync(path.join(workspace.path, 'lane-adoption-throttle-progress'));
    const throttleReceipt = (phase, args) => {
      if (!throttleInstall()) return;
      fs.appendFileSync(path.join(workspace.path, 'lane-adoption-throttle-receipts.jsonl'),
        JSON.stringify({phase, throttleProgress: args.packageManagerOptions.throttleProgress,
          ...(args.packageManagerOptions.hidePackageManagerOutput ? {hidePackageManagerOutput: true} : {})}) + '\n');
    };
    const mutableInstall = () => active() && fs.existsSync(path.join(workspace.path, 'lane-adoption-mutate-install'));
    resolver.registerPreInstallSubscribers([(installer, args) => {
      receipt('preInstall');
      if (throttleInstall()) args.packageManagerOptions.throttleProgress = 60000;
      if (active() && fs.existsSync(path.join(workspace.path, 'lane-adoption-hide-pm-output'))) {
        args.packageManagerOptions.hidePackageManagerOutput = true;
      }
      throttleReceipt('pre', args);
      if (!mutableInstall()) return;
      retainedInstall = {installer, args, options: args.options, packageOptions: args.packageManagerOptions, root: args.rootDir};
      retainedInstall.packageOptions.includeOptionalDeps = false;
      const linked = args.options.linkedDependencies || (args.options.linkedDependencies = {});
      const rootLinks = linked[args.rootDir] || (linked[args.rootDir] = {});
      const protocol = fs.existsSync(path.join(workspace.path, 'lane-adoption-invalid-local-package')) ? 'file:' : 'link:';
      rootLinks['@fixture/subscriber-linked'] = protocol + path.join(workspace.path, 'subscriber-linked');
      args.rootDir = path.join(workspace.path, 'subscriber-ignored-root');
      args.packageManagerOptions = {...retainedInstall.packageOptions, includeOptionalDeps: true};
    }]);
    resolver.registerPostInstallSubscribers([(installer, args) => {
      receipt('postInstall');
      throttleReceipt('post', args);
      if (!mutableInstall()) return;
      fs.appendFileSync(path.join(workspace.path, 'lane-adoption-subscriber-receipts.jsonl'), JSON.stringify({
        sameInstaller: installer === retainedInstall.installer,
        sameArgs: args === retainedInstall.args,
        sameOptions: args.options === retainedInstall.options,
        samePackageOptions: args.packageManagerOptions === retainedInstall.packageOptions,
        originalOptional: retainedInstall.packageOptions.includeOptionalDeps,
        reassignedOptional: args.packageManagerOptions.includeOptionalDeps,
        argsRoot: args.rootDir, installerRoot: installer.rootDir, formalRoot: retainedInstall.root,
        linked: args.options.linkedDependencies[retainedInstall.root]['@fixture/subscriber-linked']
      }) + '\n');
    }]);
    const env = node.compose([]);
    env.getDependencies = () => ({});
    const getCompiler = env.getCompiler.bind(env);
    const wrapped = new WeakSet();
    env.getCompiler = (...args) => {
      if (fs.existsSync(path.join(workspace.path, 'lane-adoption-record-compiler'))) receipt('getCompiler');
      const compiler = getCompiler(...args);
      if (!wrapped.has(compiler)) {
        const transpile = compiler.transpileFile;
        compiler.transpileFile = function (...args) {
          receipt('compile');
          return Reflect.apply(transpile, this, args);
        };
        wrapped.add(compiler);
      }
      return compiler;
    };
    envs.registerEnv(env);
    return new LaneAdoptionLifecycle();
  }
}
module.exports = {default: LaneAdoptionLifecycle};
