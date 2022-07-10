import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { DependencyResolverAspect, DependencyResolverMain } from '@teambit/dependency-resolver';
import { ImportOptions, ImportResult } from '@teambit/legacy/dist/consumer/component-ops/import-components';
import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { CommunityAspect } from '@teambit/community';
import type { CommunityMain } from '@teambit/community';

import ImportCmd from './import.cmd';
import { Importer } from './importer';
import { ImporterAspect } from './importer.aspect';

export class ImporterMain {
  constructor(private importer: Importer) {}

  async import(importOptions: ImportOptions, packageManagerArgs: string[]): Promise<ImportResult> {
    return this.importer.import(importOptions, packageManagerArgs);
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, DependencyResolverAspect, CommunityAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, depResolver, community]: [
    CLIMain,
    Workspace,
    DependencyResolverMain,
    CommunityMain
  ]) {
    const importer = new Importer(workspace, depResolver);
    if (workspace && !workspace.consumer.isLegacy) {
      cli.register(new ImportCmd(importer, community.getDocsDomain()));
    }
    return new ImporterMain(importer);
  }
}

ImporterAspect.addRuntime(ImporterMain);
