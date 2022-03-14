import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { CommunityAspect, CommunityMain } from '@teambit/community';

import ImportCmd from './import.cmd';
import { Importer } from './importer';
import { ImporterAspect } from './importer.aspect';

export class ImporterMain {
  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect, CommunityAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, depResolver, community]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    CommunityMain
  ]) {
    if (workspace && !workspace.consumer.isLegacy) {
      cli.unregister('import');
      const importer = new Importer(workspace, depResolver);
      cli.register(new ImportCmd(importer, community.getDocsDomain()));
    }
    return new ImporterMain();
  }
}

ImporterAspect.addRuntime(ImporterMain);
