import chalk from 'chalk';
import type { Command, CommandOptions } from '@teambit/cli';
import type { ScopeMain } from '@teambit/scope';
import { resumeExport } from './export-scope-components';
import { resumeExportCommand } from './export.commands';

export class ResumeExportCmd implements Command {
  name = resumeExportCommand.name;
  description = resumeExportCommand.description;
  extendedDescription = resumeExportCommand.extendedDescription;
  alias = resumeExportCommand.alias;
  options = resumeExportCommand.options;
  loader = resumeExportCommand.loader;
  group = resumeExportCommand.group;
  private = resumeExportCommand.private;
  remoteOp = resumeExportCommand.remoteOp;

  constructor(private scope: ScopeMain) {}

  async report([exportId, remotes]: [string, string[]]): Promise<string> {
    const exportedIds = await resumeExport(this.scope.legacyScope, exportId, remotes);
    if (!exportedIds.length) return chalk.yellow('no components were left to persist for this export-id');
    return `the following components were persisted successfully:
${exportedIds.join('\n')}`;
  }
}
