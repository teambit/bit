import type { Command, CommandOptions } from '@teambit/cli';
import { formatSuccessSummary, joinSections } from '@teambit/cli';
import type { PnpmWorkspaceMain } from './pnpm-workspace.main.runtime';
import type { PnpmVcsSyncResult } from './pnpm-workspace-sync';
import { formatSyncReport, PNPM_WORKSPACE_ENV, PNPM_WORKSPACE_MANIFEST } from './pnpm-workspace-sync';

type InitFlags = { defaultScope?: string; env?: string };

export class PnpmInitCmd implements Command {
  name = 'init';
  description = 'make a Bit workspace out of a pnpm workspace, and synchronize its projects';
  extendedDescription = `runs at the root of a pnpm workspace, the directory of "${PNPM_WORKSPACE_MANIFEST}". the workspace is standalone, its scope is kept in ".bit", and pnpm keeps installing it: bit writes workspace.jsonc and .bitmap only, and leaves package.json alone.
then synchronizes the projects the way "bit pnpm sync" does. run that one whenever projects are added, moved or deleted.`;
  group = 'workspace-setup';
  skipWorkspace = true;
  loader = true;
  options = [
    ['', 'default-scope <default-scope>', 'set the default scope for components in the workspace'],
    [
      '',
      'env <env-id>',
      `the env of the projects with a build, test or lint script (default: ${PNPM_WORKSPACE_ENV}). the others get the empty env`,
    ],
    ['j', 'json', 'return the synchronization result in JSON format'],
  ] as CommandOptions;

  constructor(private pnpmWorkspace: PnpmWorkspaceMain) {}

  async report(args: string[], flags: InitFlags): Promise<string> {
    const workspacePath = process.cwd();
    const result = await this.json(args, flags);
    return joinSections([
      formatSuccessSummary(`initialized a Bit workspace in ${workspacePath}`),
      await formatSyncReport(result, workspacePath),
    ]);
  }

  json(_args: string[], flags: InitFlags): Promise<PnpmVcsSyncResult> {
    return this.pnpmWorkspace.init(process.cwd(), flags);
  }
}
