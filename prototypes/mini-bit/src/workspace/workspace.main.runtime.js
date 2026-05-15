import { WorkspaceAspect } from './workspace.aspect.js';
import { LoggerAspect } from '../logger/logger.aspect.js';
import { ScopeAspect } from '../scope/scope.aspect.js';
import { CLIAspect } from '../cli/cli.aspect.js';
import descriptors from './workspace.commands.js';
import { readBitmap } from './workspace-internals.js';

export class WorkspaceMain {
  static id = WorkspaceAspect.id;
  static dependencies = [LoggerAspect, ScopeAspect, CLIAspect];
  static slots = [];

  constructor(scope) { this.scope = scope; }

  static async provider([logger, scope, cli]) {
    const log = logger.createLogger('workspace');
    log.info('ready');
    const ws = new WorkspaceMain(scope);

    cli.register({
      ...descriptors[0],
      report: async () => {
        const map = ws.components();
        return ['Components:', ...Object.keys(map).map((n) => `  - ${n}`)].join('\n');
      },
    });
    return ws;
  }

  components() { return readBitmap(); }
}
