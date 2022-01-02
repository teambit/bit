import AspectLoaderAspect, { AspectLoaderMain } from '@teambit/aspect-loader';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import ImportCmd from './import.cmd';
import { Importer } from './importer';
import { ImporterAspect } from './importer.aspect';

export class ImporterMain {
  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect, AspectLoaderAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, depResolver, aspectLoader]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    AspectLoaderMain
  ]) {
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('import');
      const importer = new Importer(workspace, depResolver, aspectLoader);
      cli.register(new ImportCmd(importer));
    }
    return new ImporterMain();
  }
}

ImporterAspect.addRuntime(ImporterMain);
