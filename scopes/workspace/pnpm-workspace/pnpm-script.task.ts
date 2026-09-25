import fs from 'fs/promises';
import path from 'path';
import type { ArtifactDefinition, BuildContext, BuildTask, BuiltTaskResult, ComponentResult } from '@teambit/builder';
import type { Logger } from '@teambit/logger';
import type { WorkspaceRootMain } from '@teambit/workspace-root';
import type { PnpmError } from './pnpm-utils';
import { exists, runPnpm } from './pnpm-utils';
import type { PnpmWorkspaceTree, TreeSource } from './pnpm-workspace-tree';
import { loadPnpmWorkspaceTree, treeSignature, writePnpmWorkspaceTree } from './pnpm-workspace-tree';

export type PnpmScript = 'build' | 'test' | 'lint';

/** what each script leaves in a package's directory, saved as the component's artifacts */
const OUTPUT_DIRS: Record<PnpmScript, string[]> = {
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
export class PnpmScriptTask implements BuildTask {
  readonly name: string;
  readonly description: string;

  constructor(
    readonly aspectId: string,
    private script: PnpmScript,
    private source: TreeSource,
    private workspaceRoot: WorkspaceRootMain,
    private logger: Logger
  ) {
    this.name = taskName(script);
    this.description = `run the "${script}" script of the pnpm workspace packages`;
  }

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const components = context.components;
    if (!components.length) return { componentsResults: [] };
    const startTime = Date.now();
    const failAll = (message: string): BuiltTaskResult => ({
      componentsResults: components.map(
        (component): ComponentResult => ({
          component,
          errors: [new Error(message)],
          startTime,
          endTime: Date.now(),
        })
      ),
    });

    const buildComponents = context.capsuleNetwork.graphCapsules.getAllComponents();
    let tree: PnpmWorkspaceTree;
    try {
      tree = await loadPnpmWorkspaceTree(components, buildComponents, this.source, this.workspaceRoot);
    } catch (err: any) {
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
    } catch (err: any) {
      const output = (err as PnpmError).output?.trim();
      if (output) this.logger.console(output);
      return failAll(`pnpm "${this.script}" failed: ${err.message}`);
    }
    return {
      componentsResults: components.map(
        (component): ComponentResult => ({
          component,
          metadata: { pnpmScript: this.script },
          startTime,
          endTime: Date.now(),
        })
      ),
      artifacts: artifactDefinitions(this.script),
    };
  }

  /**
   * the tasks of one build run one after the other on the same tree, so the test and lint scripts
   * see the build's output and reuse its install - as they would in the real workspace. a tree
   * written from other files, or never installed, is written again.
   */
  private async prepareTree(tree: PnpmWorkspaceTree, treeDir: string): Promise<void> {
    const signature = treeSignature(tree);
    const markerPath = path.join(treeDir, TREE_MARKER);
    const existingSignature = await fs.readFile(markerPath, 'utf8').catch(() => undefined);
    if (existingSignature === signature) return;
    await writePnpmWorkspaceTree(tree, treeDir);
    await this.pnpm(['install', '--frozen-lockfile'], treeDir);
    await fs.writeFile(markerPath, signature);
  }

  private async pnpm(args: string[], cwd: string): Promise<void> {
    const output = await runPnpm(args, cwd);
    if (output.trim()) this.logger.console(output.trim());
  }
}

/** the builder takes alphanumeric task names only, e.g. "PnpmBuild" */
function taskName(script: PnpmScript): string {
  return `Pnpm${script[0].toUpperCase()}${script.slice(1)}`;
}

function artifactDefinitions(script: PnpmScript): ArtifactDefinition[] {
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

async function copyOutputsToCapsules(
  context: BuildContext,
  tree: PnpmWorkspaceTree,
  treeDir: string,
  outputDirs: string[]
): Promise<void> {
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
