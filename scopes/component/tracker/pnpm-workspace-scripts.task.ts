import fs from 'fs-extra';
import path from 'path';
import execa from 'execa';
import type { ArtifactDefinition, BuildContext, BuildTask, BuiltTaskResult } from '@teambit/builder';
import type { Component } from '@teambit/component';
import { ComponentID } from '@teambit/component-id';
import type { Logger } from '@teambit/logger';
import type { ScopeMain } from '@teambit/scope';
import { TrackerAspect } from './tracker.aspect';
import type { PnpmVcsWorkspaceTopology } from './pnpm-vcs-sync.cmd';

export type PnpmWorkspaceScript = 'build' | 'test' | 'lint';

const OUTPUT_DIRS: Record<PnpmWorkspaceScript, string[]> = {
  build: ['dist', 'build', 'lib'],
  test: ['coverage'],
  lint: [],
};

export class PnpmWorkspaceScriptTask implements BuildTask {
  readonly name: string;
  readonly description: string;

  constructor(
    readonly aspectId: string,
    private script: PnpmWorkspaceScript,
    private logger: Logger,
    private scope: ScopeMain
  ) {
    this.name = `${script[0].toUpperCase()}${script.slice(1)}PnpmWorkspace`;
    this.description = `run pnpm workspace ${script} scripts`;
  }

  async execute(context: BuildContext): Promise<BuiltTaskResult> {
    const pnpmComponents = context.components.filter(isPnpmWorkspaceComponent);
    if (!pnpmComponents.length) return { componentsResults: [] };
    const topology = context.components.map(readWorkspaceTopology).find(Boolean);
    if (!topology) {
      return {
        componentsResults: pnpmComponents.map((component) => ({
          component,
          errors: [new Error(`unable to run pnpm workspace scripts for ${component.id}: no repository manifest found`)],
        })),
      };
    }
    const availableComponents = context.capsuleNetwork.graphCapsules.getAllComponents();
    const rootComponent = await loadTopologyComponent(topology.rootComponent, availableComponents, this.scope);
    if (!rootComponent) {
      return {
        componentsResults: pnpmComponents.map((component) => ({
          component,
          errors: [new Error(`unable to load pnpm workspace root component ${topology.rootComponent}`)],
        })),
      };
    }
    const sandboxPath = path.join(context.capsuleNetwork.capsulesRootDir, '.bit-pnpm-workspace-build');
    const materializationMarker = path.join(sandboxPath, '.bit-pnpm-workspace-materialized');
    // Build is the first adapter task in the normal pipeline. Test and lint
    // intentionally reuse its tree so they can consume build output and the
    // same install, just as sequential package scripts do in the real
    // workspace. When either task is selected alone, no marker exists and it
    // reconstructs the tree itself.
    const shouldMaterialize = this.script === 'build' || !(await fs.pathExists(materializationMarker));
    const materialized = shouldMaterialize
      ? await materializePnpmWorkspace(context, rootComponent, topology, sandboxPath, this.scope)
      : { missing: [] };
    if (materialized.missing.length) {
      const message = `unable to reconstruct the pnpm workspace; missing build components: ${materialized.missing.join(
        ', '
      )}`;
      return {
        componentsResults: pnpmComponents.map((component) => ({ component, errors: [new Error(message)] })),
      };
    }
    if (shouldMaterialize) await fs.outputFile(materializationMarker, '');

    const startTime = Date.now();
    try {
      await ensurePnpmInstall(sandboxPath, this.logger);
      const result = await execa('pnpm', ['-r', '--if-present', 'run', this.script], {
        cwd: sandboxPath,
        all: true,
      });
      if (result.all?.trim()) this.logger.console(result.all.trim());
      await copyGeneratedOutputsToCapsules(context, topology, sandboxPath, OUTPUT_DIRS[this.script]);
      const endTime = Date.now();
      return {
        componentsResults: pnpmComponents.map((component) => ({
          component,
          metadata: { pnpmWorkspaceScript: this.script },
          startTime,
          endTime,
        })),
        artifacts: artifactDefinitions(this.script),
      };
    } catch (error: any) {
      const output = error.all || error.stderr || error.stdout;
      if (output?.trim()) this.logger.console(output.trim());
      const buildError = new Error(`pnpm workspace ${this.script} failed: ${error.shortMessage || error.message}`);
      return {
        componentsResults: pnpmComponents.map((component) => ({
          component,
          errors: [buildError],
          startTime,
          endTime: Date.now(),
        })),
      };
    }
  }
}

function artifactDefinitions(script: PnpmWorkspaceScript): ArtifactDefinition[] {
  const outputDirs = OUTPUT_DIRS[script];
  if (!outputDirs.length) return [];
  return [
    {
      name: `pnpm-${script}`,
      description: `artifacts created by package.json#scripts.${script}`,
      globPatterns: outputDirs.map((dir) => `${dir}/**`),
    },
  ];
}

export function isPnpmWorkspaceComponent(component: Component): boolean {
  return Boolean(component.state.aspects.get(TrackerAspect.id)?.config?.pnpmVcs?.schemaVersion === 1);
}

function readWorkspaceTopology(component: Component): PnpmVcsWorkspaceTopology | undefined {
  const workspace = component.state.aspects.get(TrackerAspect.id)?.config?.pnpmVcs?.workspace;
  if (!workspace || workspace.schemaVersion !== 1 || !Array.isArray(workspace.components)) return undefined;
  return workspace as PnpmVcsWorkspaceTopology;
}

async function materializePnpmWorkspace(
  context: BuildContext,
  rootComponent: Component,
  topology: PnpmVcsWorkspaceTopology,
  sandboxPath: string,
  scope: ScopeMain
): Promise<{ missing: string[] }> {
  await fs.emptyDir(sandboxPath);
  await writeComponentFiles(rootComponent, sandboxPath);
  const availableComponents = context.capsuleNetwork.graphCapsules.getAllComponents();
  const missing: string[] = [];
  await Promise.all(
    topology.components.map(async ({ componentId, rootDir }) => {
      const component = await loadTopologyComponent(componentId, availableComponents, scope);
      if (!component) {
        missing.push(componentId);
        return;
      }
      await writeComponentFiles(component, path.join(sandboxPath, rootDir));
    })
  );
  return { missing: missing.sort() };
}

async function loadTopologyComponent(
  componentId: string,
  availableComponents: Component[],
  scope: ScopeMain
): Promise<Component | undefined> {
  const available = availableComponents.find((candidate) => candidate.id.toStringWithoutVersion() === componentId);
  if (available) return available;
  try {
    return await scope.get(ComponentID.fromString(componentId));
  } catch {
    return undefined;
  }
}

async function writeComponentFiles(component: Component, targetDir: string): Promise<void> {
  await Promise.all(
    component.filesystem.files.map((file) => fs.outputFile(path.join(targetDir, file.relative), file.contents))
  );
}

async function ensurePnpmInstall(sandboxPath: string, logger: Logger): Promise<void> {
  const markerPath = path.join(sandboxPath, 'node_modules', '.bit-pnpm-workspace-installed');
  if (await fs.pathExists(markerPath)) return;
  const result = await execa('pnpm', ['install', '--frozen-lockfile'], { cwd: sandboxPath, all: true });
  if (result.all?.trim()) logger.console(result.all.trim());
  await fs.outputFile(markerPath, '');
}

async function copyGeneratedOutputsToCapsules(
  context: BuildContext,
  topology: PnpmVcsWorkspaceTopology,
  sandboxPath: string,
  outputDirs: string[]
): Promise<void> {
  if (!outputDirs.length) return;
  await Promise.all(
    topology.components.map(async ({ componentId, rootDir }) => {
      const capsule = context.capsuleNetwork.graphCapsules.find(
        (candidate) => candidate.component.id.toStringWithoutVersion() === componentId
      );
      if (!capsule) return;
      await Promise.all(
        outputDirs.map(async (outputDir) => {
          const source = path.join(sandboxPath, rootDir, outputDir);
          if (!(await fs.pathExists(source))) return;
          await fs.copy(source, path.join(capsule.path, outputDir), { overwrite: true });
        })
      );
    })
  );
}
