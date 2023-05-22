import WorkspaceAspect, { Workspace } from '@teambit/workspace';
import { Component, ComponentID } from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { compact } from 'lodash';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import CheckoutAspect, { CheckoutMain } from '@teambit/checkout';
import { StashAspect } from './stash.aspect';
import { StashCmd, StashLoadCmd, StashSaveCmd } from './stash.cmd';
import { StashData } from './stash-data';
import { StashFiles } from './stash-files';

export class StashMain {
  private stashFiles: StashFiles;
  constructor(private workspace: Workspace, private checkout: CheckoutMain) {
    this.stashFiles = new StashFiles(workspace.scope.path);
  }

  async save(options: { message?: string; pattern?: string }): Promise<ComponentID[]> {
    const compIds = options?.pattern
      ? await this.workspace.idsByPattern(options?.pattern)
      : await this.workspace.listIds();
    const comps = await this.workspace.getMany(compIds);
    const modifiedComps = compact(
      await Promise.all(
        comps.map(async (comp) => {
          if (!comp.head) return undefined; // it's new
          const isModified = await this.workspace.isModified(comp);
          if (isModified) return comp;
          return undefined;
        })
      )
    );
    if (!modifiedComps.length) return [];

    // per comp: create Version object, save it in the local scope and return the hash. don't save anything in the .bitmap
    const hashPerId = await Promise.all(
      modifiedComps.map(async (comp) => {
        const versionObj = await this.addComponentDataToRepo(comp);
        return { id: comp.id, hash: versionObj.hash() };
      })
    );
    await this.workspace.scope.legacyScope.objects.persist();
    const stashData = new StashData({ message: options?.message }, hashPerId);
    await this.stashFiles.saveStashData(stashData);

    // reset all modified components
    const modifiedCompIds = modifiedComps.map((c) => c.id);
    await this.checkout.checkout({
      ids: modifiedCompIds,
      skipNpmInstall: true,
      reset: true,
    });

    return modifiedCompIds;
  }

  async loadLatest() {
    const stashFile = await this.stashFiles.getLatestStashFile();
    if (!stashFile) {
      throw new BitError('no stashed components found');
    }
    const stashData = await this.stashFiles.getStashData(stashFile, this.workspace);
    const compIds = stashData.stashCompsData.map((c) => c.id);
    const versionPerId = stashData.stashCompsData.map((c) => c.id.changeVersion(c.hash.toString()));

    await this.checkout.checkout({
      ids: compIds,
      skipNpmInstall: true,
      versionPerId,
      skipUpdatingBitmap: true,
    });

    await this.stashFiles.deleteStashFile(stashFile);

    return compIds;
  }

  private async addComponentDataToRepo(component: Component) {
    const consumerComponent = component.state._consumer.clone() as ConsumerComponent;
    consumerComponent.setNewVersion();
    const { version, files } = await this.workspace.scope.legacyScope.sources.consumerComponentToVersion(
      consumerComponent
    );
    const repo = this.workspace.scope.legacyScope.objects;
    repo.add(version);
    files.forEach((file) => repo.add(file.file));
    return version;
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, CheckoutAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, checkout]: [CLIMain, Workspace, CheckoutMain]) {
    const stashMain = new StashMain(workspace, checkout);
    const stashCmd = new StashCmd(stashMain);
    stashCmd.commands = [new StashSaveCmd(stashMain), new StashLoadCmd(stashMain)];
    cli.register(stashCmd);
    return stashMain;
  }
}

StashAspect.addRuntime(StashMain);

export default StashMain;
