import { StatusAspect } from './status.aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { WorkspaceAspect } from '../workspace/workspace.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';
import descriptors from './status.commands.js';
import { computeStatus } from './status-internals.js';

export class StatusMain {
  static id = StatusAspect.id;
  static dependencies = [LoggerAspect, WorkspaceAspect, CLIAspect];
  static slots = [];

  constructor(workspace) { this.workspace = workspace; }

  static async provider([logger, workspace, cli]) {
    logger.createLogger('status').info('ready');
    const sm = new StatusMain(workspace);

    cli.register({
      ...descriptors[0],
      report: async () => {
        const { modified, newComps } = computeStatus(workspace);
        const lines = ['Status:'];
        if (modified.length) {
          lines.push('  modified:');
          modified.forEach((c) => lines.push(`    • ${c}`));
        }
        if (newComps.length) {
          lines.push('  new:');
          newComps.forEach((c) => lines.push(`    • ${c}`));
        }
        if (!modified.length && !newComps.length) lines.push('  clean');
        return lines.join('\n');
      },
    });
    return sm;
  }
}
