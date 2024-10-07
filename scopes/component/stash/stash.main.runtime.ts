import { WorkspaceAspect, Workspace } from '@teambit/workspace';
import { SnappingAspect, SnappingMain } from '@teambit/snapping';
import { Component, ComponentID } from '@teambit/component';
import { BitError } from '@teambit/bit-error';
import ConsumerComponent from '@teambit/legacy/dist/consumer/component';
import { compact } from 'lodash';
import { CLIAspect, CLIMain, MainRuntime } from '@teambit/cli';
import { Ref } from '@teambit/legacy/dist/scope/objects';
import { CheckoutAspect, CheckoutMain, CheckoutProps } from '@teambit/checkout';
import { StashAspect } from './stash.aspect';
import { StashCmd, StashListCmd, StashLoadCmd, StashSaveCmd } from './stash.cmd';
import { StashData } from './stash-data';
import { StashFiles } from './stash-files';

type ListResult = {
  id: string;
  message?: string;
  components: string[];
};

export class StashMain {
  private stashFiles: StashFiles;
  constructor(
    private workspace: Workspace,
    private checkout: CheckoutMain,
    private snapping: SnappingMain
  ) {
    this.stashFiles = new StashFiles(workspace);
  }

  async save(options: { message?: string; pattern?: string }): Promise<ComponentID[]> {
    const compIds = options?.pattern ? await this.workspace.idsByPattern(options?.pattern) : this.workspace.listIds();
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
    const consumeComponents = modifiedComps.map((comp) => comp.state._consumer);
    await this.snapping._addFlattenedDependenciesToComponents(consumeComponents);
    const hashPerId = await Promise.all(
      modifiedComps.map(async (comp) => {
        const versionObj = await this.addComponentDataToRepo(comp);
        return { id: comp.id, hash: versionObj.hash().toString() };
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

  async list(): Promise<ListResult[]> {
    const stashFiles = await this.stashFiles.getStashFiles();
    return Promise.all(
      stashFiles.map(async (file) => {
        const stashData = await this.stashFiles.getStashData(file);
        return {
          id: file.replace('.json', ''),
          message: stashData.metadata.message,
          components: stashData.stashCompsData.map((c) => c.id.toString()),
        };
      })
    );
  }

  async loadLatest(checkoutProps: CheckoutProps = {}, stashId?: string) {
    const stashFile = stashId ? `${stashId}.json` : await this.stashFiles.getLatestStashFile();
    if (!stashFile) {
      throw new BitError('no stashed components found');
    }
    const stashData = await this.stashFiles.getStashData(stashFile);
    const compIds = stashData.stashCompsData.map((c) => c.id);
    const versionPerId = stashData.stashCompsData.map((c) => c.id.changeVersion(c.hash.toString()));

    await this.checkout.checkout({
      ...checkoutProps,
      ids: compIds,
      skipNpmInstall: true,
      versionPerId,
      skipUpdatingBitmap: true,
      promptMergeOptions: true,
      loadStash: true,
    });

    await this.stashFiles.deleteStashFile(stashFile);

    return compIds;
  }

  private async addComponentDataToRepo(component: Component) {
    const previousVersion = component.getSnapHash();
    const consumerComponent = component.state._consumer.clone() as ConsumerComponent;
    consumerComponent.setNewVersion();
    const { version, files } =
      await this.workspace.scope.legacyScope.sources.consumerComponentToVersion(consumerComponent);
    if (previousVersion) {
      // set the parent, we need it for the "stash-load" to function as the "base" version for the three-way-merge.
      const modelComponent = consumerComponent.modelComponent;
      if (!modelComponent) throw new Error(`unable to find ModelComponent for ${consumerComponent.id.toString()}`);
      const parent = Ref.from(previousVersion);
      version.addAsOnlyParent(parent);
    }

    const repo = this.workspace.scope.legacyScope.objects;
    repo.add(version);
    files.forEach((file) => repo.add(file.file));
    return version;
  }

  static slots = [];
  static dependencies = [CLIAspect, WorkspaceAspect, CheckoutAspect, SnappingAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, checkout, snapping]: [CLIMain, Workspace, CheckoutMain, SnappingMain]) {
    const stashMain = new StashMain(workspace, checkout, snapping);
    const stashCmd = new StashCmd(stashMain);
    stashCmd.commands = [new StashSaveCmd(stashMain), new StashLoadCmd(stashMain), new StashListCmd(stashMain)];
    cli.register(stashCmd);
    return stashMain;
  }
}

StashAspect.addRuntime(StashMain);

export default StashMain;
