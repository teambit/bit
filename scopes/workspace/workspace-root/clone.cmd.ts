import path from 'path';
import type { Command, CommandOptions } from '@teambit/cli';
import { formatHint, formatSuccessSummary, formatWarningSummary, joinSections } from '@teambit/cli';
import type { CloneResult } from './clone';
import type { WorkspaceRootMain } from './workspace-root.main.runtime';

type CloneCmdOptions = {
  lane?: string;
  remote?: string;
  skipDependencyInstallation?: boolean;
};

export class CloneCmd implements Command {
  name = 'clone <component-id> [dir]';
  description = 'create a workspace from its workspace-root component, with every component it lists';
  extendedDescription = `the workspace-root component is the one tracked at a workspace root ("bit add ."). it versions the workspace's own files - workspace.jsonc, .bitmap, lockfile, configs - and this command makes a workspace out of it, the way "git clone" makes a working tree out of a repository: the root files land at the root, every component the root lists is imported into the directory it records, then the dependencies are installed.
the components come at their heads on main, or on the lane given with --lane. a version on the root id pins the root files only.
runs outside a workspace. the directory must be empty or not exist, and defaults to the component name.`;
  arguments = [
    {
      name: 'component-id',
      description: 'the workspace-root component, with its scope. a version pins the root files',
    },
    {
      name: 'dir',
      description: 'where to create the workspace. defaults to the component name, must be empty or absent',
    },
  ];
  group = 'workspace-setup';
  skipWorkspace = true;
  remoteOp = true;
  loader = true;
  options = [
    [
      'l',
      'lane <lane-id>',
      'clone the workspace as it is on this lane ("scope/name"): it comes out on the lane, with the components at their heads there',
    ],
    [
      '',
      'remote <url>',
      'url of the scope hosting the components, when it is neither on bit.cloud nor in the global remotes',
    ],
    ['x', 'skip-dependency-installation', 'do not install the dependencies, and so do not compile, after the clone'],
  ] as CommandOptions;

  constructor(private workspaceRoot: WorkspaceRootMain) {}

  async report([id, dir]: [string, string], options: CloneCmdOptions): Promise<string> {
    // the clone changes the cwd to the new workspace, so the path is relative to where the user ran it
    const cwd = process.cwd();
    const result = await this.workspaceRoot.clone(id, dir, options);
    return formatCloneResult(result, path.relative(cwd, result.workspacePath) || '.');
  }
}

export function formatCloneResult(result: CloneResult, relativeDir: string): string {
  const count = result.components.length;
  const summary = formatSuccessSummary(
    `cloned ${result.rootId.toString()} into "${relativeDir}" with ${count} component${count === 1 ? '' : 's'}`
  );
  const lane = result.laneId ? formatHint(`(the workspace is on lane ${result.laneId.toString()})`) : '';
  const missingCount = result.missing.length;
  const missing = missingCount
    ? formatWarningSummary(
        `${missingCount} component${missingCount === 1 ? '' : 's'} the root lists ${missingCount === 1 ? 'is' : 'are'} not on ${missingCount === 1 ? 'its' : 'their'} remote (never exported, or exported elsewhere), so the clone is without: ${result.missing.join(', ')}`
      )
    : '';
  const installation = result.installationError
    ? formatWarningSummary(
        `the dependencies were not installed: ${result.installationError.message}\nrun "bit install" in the workspace to retry`
      )
    : '';
  const next = relativeDir === '.' ? '' : formatHint(`cd ${relativeDir}`);
  return joinSections([summary, lane, missing, installation, next]);
}
