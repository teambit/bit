const fs = require('fs/promises');
const path = require('path');
const { exists, runPnpm } = require('./utils');
const {
  loadPnpmWorkspaceTree,
  readRootId,
  ScopeTreeSource,
  treeSignature,
  WorkspaceTreeSource,
  writePnpmWorkspaceTree,
} = require('./pnpm-workspace-tree');

/** what each script leaves in a package's directory, saved as the component's artifacts */
const OUTPUT_DIRS = {
  build: ['dist', 'build', 'lib'],
  test: ['coverage'],
  lint: [],
};

const TREE_DIR = '.pnpm-workspace';
/** written once the tree is installed, holding the signature of what it was written from */
const TREE_MARKER = '.bit-pnpm-workspace';

/**
 * runs a package.json script of the pnpm workspace the components belong to.
 *
 * a package's script expects the whole workspace around it - its siblings linked, the root's
 * lockfile and config - which an isolated capsule does not have. so the task writes the workspace
 * next to the capsules, the way it was snapped (see loadPnpmWorkspaceTree), installs it with pnpm
 * and runs the script across it, then copies each package's output into its capsule.
 */
class PnpmScriptTask {
  constructor(aspectId, script, source, workspaceRoot, logger) {
    this.aspectId = aspectId;
    this.script = script;
    this.source = source;
    this.workspaceRoot = workspaceRoot;
    this.logger = logger;
    this.name = taskName(script);
    this.description = `run the "${script}" script of the pnpm workspace packages`;
  }

  /** a task for the env of the context: reads the components through the workspace or the scope */
  static create(script, context) {
    const workspace = context.getAspect('teambit.workspace/workspace');
    const workspaceRoot = context.getAspect('teambit.workspace/workspace-root');
    const source = workspace
      ? new WorkspaceTreeSource(workspace, workspaceRoot)
      : new ScopeTreeSource(context.getAspect('teambit.scope/scope'));
    return new PnpmScriptTask(
      context.envId.toString(),
      script,
      source,
      workspaceRoot,
      context.createLogger(taskName(script))
    );
  }

  async execute(context) {
    const components = context.components;
    if (!components.length) return { componentsResults: [] };
    const startTime = Date.now();
    const failAll = (message) => ({
      componentsResults: components.map((component) => ({
        component,
        errors: [new Error(message)],
        startTime,
        endTime: Date.now(),
      })),
    });

    // a component never snapped has no root recorded yet, the one of the workspace is taken for it
    const rootIds = [...new Set(components.map(readRootId).filter(Boolean))];
    if (rootIds.length > 1) {
      return failAll(
        `unable to run the pnpm "${this.script}" script, the components belong to different workspace roots: ${rootIds.join(', ')}`
      );
    }
    const buildComponents = context.capsuleNetwork.graphCapsules.getAllComponents();
    let tree;
    try {
      tree = await loadPnpmWorkspaceTree(rootIds[0], buildComponents, this.source, this.workspaceRoot);
    } catch (err) {
      return failAll(`unable to rebuild the pnpm workspace: ${err.message}`);
    }
    if (tree.missing.length) {
      return failAll(`unable to rebuild the pnpm workspace, missing components: ${tree.missing.join(', ')}`);
    }

    const treeDir = path.join(context.capsuleNetwork.capsulesRootDir, TREE_DIR);
    try {
      await this.prepareTree(tree, treeDir);
      await this.pnpm(['-r', '--if-present', 'run', this.script], treeDir);
      await copyOutputsToCapsules(context, tree, treeDir, OUTPUT_DIRS[this.script]);
    } catch (err) {
      if (err.output?.trim()) this.logger.console(err.output.trim());
      return failAll(`pnpm "${this.script}" failed: ${err.message}`);
    }
    return {
      componentsResults: components.map((component) => ({
        component,
        metadata: { pnpmScript: this.script },
        startTime,
        endTime: Date.now(),
      })),
      artifacts: artifactDefinitions(this.script),
    };
  }

  /**
   * the tasks of one build run one after the other on the same tree, so the test and lint scripts
   * see the build's output and reuse its install - as they would in the real workspace. a tree
   * written from other files, or never installed, is written again.
   */
  async prepareTree(tree, treeDir) {
    const signature = treeSignature(tree);
    const markerPath = path.join(treeDir, TREE_MARKER);
    const existingSignature = await fs.readFile(markerPath, 'utf8').catch(() => undefined);
    if (existingSignature === signature) return;
    await writePnpmWorkspaceTree(tree, treeDir);
    await this.pnpm(['install', '--frozen-lockfile'], treeDir);
    await fs.writeFile(markerPath, signature);
  }

  async pnpm(args, cwd) {
    const output = await runPnpm(args, cwd);
    if (output.trim()) this.logger.console(output.trim());
  }
}

/** the builder takes alphanumeric task names only, e.g. "PnpmBuild" */
function taskName(script) {
  return `Pnpm${script[0].toUpperCase()}${script.slice(1)}`;
}

function artifactDefinitions(script) {
  const outputDirs = OUTPUT_DIRS[script];
  if (!outputDirs.length) return [];
  return [
    {
      name: `pnpm-${script}`,
      description: `the output of package.json#scripts.${script}`,
      globPatterns: outputDirs.map((dir) => `${dir}/**`),
    },
  ];
}

async function copyOutputsToCapsules(context, tree, treeDir, outputDirs) {
  if (!outputDirs.length) return;
  await Promise.all(
    [...tree.members.entries()].map(async ([rootDir, component]) => {
      const capsule = context.capsuleNetwork.graphCapsules.getCapsule(component.id);
      if (!capsule) return;
      await Promise.all(
        outputDirs.map(async (outputDir) => {
          // a capsule is reused across builds, so what an earlier build left must not pass as this one's output
          const target = path.join(capsule.path, outputDir);
          await fs.rm(target, { recursive: true, force: true });
          const source = path.join(treeDir, rootDir, outputDir);
          if (!(await exists(source))) return;
          await fs.cp(source, target, { recursive: true, force: true });
        })
      );
    })
  );
}

module.exports = { PnpmScriptTask };
