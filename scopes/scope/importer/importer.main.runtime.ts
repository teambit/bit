import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import ImportCmd from './import.cmd';
import { ImporterAspect } from './importer.aspect';

export class ImporterMain {
  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace]: [CLIMain, Workspace]) {
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('import');
      cli.register(new ImportCmd(workspace));
    }
    return new ImporterMain();
  }
}

ImporterAspect.addRuntime(ImporterMain);
