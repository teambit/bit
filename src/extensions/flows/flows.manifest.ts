import { ExtensionManifest } from '@teambit/harmony';
import { Flows } from './flows';
import { WorkspaceExt, Workspace } from '../workspace';
import { RunCmd } from './run';
import { ReporterExt, Reporter } from '../reporter';
import { LoggerExt, Logger } from '../logger';
import { CLIExtension } from '../cli';

type ScriptDeps = [CLIExtension, Workspace, Reporter, Logger];

export default {
  name: 'flows',
  dependencies: [CLIExtension, WorkspaceExt, ReporterExt, LoggerExt],
  async provider([cli, workspace, reporter, logger]: ScriptDeps) {
    const flows = new Flows(workspace);
    const runCMD = new RunCmd(flows, reporter, logger);
    cli.register(runCMD);
    return flows;
  }
} as ExtensionManifest;
