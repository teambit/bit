import chalk from 'chalk';
import { Command, CommandOptions } from '@teambit/cli';
import { ScopeMain } from '@teambit/scope';

export class ResumeExportCmd implements Command {
  name = 'resume-export <export-id> <remotes...>';
  shortDescription = 'EXPERIMENTAL. resume failed export';
  description = `resume failed export to persist the pending objects on the given remotes.
the <export-id> is the id the client got in the error message during the failure.
alternatively, exporting to any one of the failed scopes, throws server-is-busy error with the export-id`;
  alias = '';
  options = [] as CommandOptions;
  loader = true;
  migration = true;
  group = 'collaborate';
  remoteOp = true;

  constructor(private scope: ScopeMain) {}

  async report([exportId, remotes]: [string, string[]]): Promise<string> {
    const exportedIds = await this.scope.resumeExport(exportId, remotes);
    if (!exportedIds.length) return chalk.yellow('no components were left to persist for this export-id');
    return `the following components were persisted successfully:
${exportedIds.join('\n')}`;
  }
}
