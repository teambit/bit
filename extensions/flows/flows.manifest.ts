import { ExtensionManifest } from '@teambit/harmony';
import { Flows } from './flows';
import { BitCliExt, BitCli } from '@bit/bit.core.cli';
import { WorkspaceExt, Workspace } from '@bit/bit.core.workspace';
import { RunCmd } from './run';
import { ReporterExt, Reporter } from '@bit/bit.core.reporter';
import { LoggerExt, Logger } from '../logger';

type ScriptDeps = [BitCli, Workspace, Reporter, Logger];

export default {
  name: 'flows',
  dependencies: [BitCliExt, WorkspaceExt, ReporterExt, LoggerExt],
  async provider([cli, workspace, reporter, logger]: ScriptDeps) {
    const flows = new Flows(workspace);
    const runCMD = new RunCmd(flows, reporter, logger);
    cli.register(runCMD);
    return flows;
  }
} as ExtensionManifest;
