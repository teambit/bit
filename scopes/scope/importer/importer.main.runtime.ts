import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import ImportCmd from './import.cmd';
import { Importer } from './importer';
import { ImporterAspect } from './importer.aspect';

export class ImporterMain {
  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, depResolver]: [CLIMain, Workspace, DependencyResolverMain]) {
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('import');
      const importer = new Importer(workspace, depResolver);
      cli.register(new ImportCmd(importer));
    }
    return new ImporterMain();
  }
}

ImporterAspect.addRuntime(ImporterMain);
