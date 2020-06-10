import { ExtensionManifest } from '@teambit/harmony';
import { Flows } from './flows';
import { WorkspaceExt, Workspace } from '../workspace';
import { RunCmd } from './run';
import { ReporterExt, Reporter } from '../reporter';
import { LoggerExt, Logger } from '../logger';
import { PaperExtension } from '../paper';

type ScriptDeps = [PaperExtension, Workspace, Reporter, Logger];

export default {
  name: 'flows',
  dependencies: [PaperExtension, WorkspaceExt, ReporterExt, LoggerExt],
  async provider([cli, workspace, reporter, logger]: ScriptDeps) {
    const flows = new Flows(workspace);
    const runCMD = new RunCmd(flows, reporter, logger);
    cli.register(runCMD);
    return flows;
  }
} as ExtensionManifest;
