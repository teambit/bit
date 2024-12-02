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
import { getBasicLog } from '@teambit/harmony.modules.get-basic-log';
import { RemoveAspect, RemoveMain } from '@teambit/remove';

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
    private snapping: SnappingMain,
    private remove: RemoveMain
  ) {
    this.stashFiles = new StashFiles(workspace);
  }

  async save(options: { message?: string; pattern?: string; includeNew?: boolean }): Promise<ComponentID[]> {
    const compIds = options?.pattern ? await this.workspace.idsByPattern(options?.pattern) : this.workspace.listIds();
    const comps = await this.workspace.getMany(compIds);
    const newComps: Component[] = [];
    const modifiedComps = compact(
      await Promise.all(
        comps.map(async (comp) => {
          if (!comp.head) {
            // it's a new component
            if (options.includeNew) newComps.push(comp);
            return undefined;
          }
          const isModified = await this.workspace.isModified(comp);
          if (isModified) return comp;
          return undefined;
        })
      )
    );
    const allComps = [...modifiedComps, ...newComps];
    if (!allComps.length) return [];

    // per comp: create Version object, save it in the local scope and return the hash. don't save anything in the .bitmap
    const consumeComponents = allComps.map((comp) => comp.state._consumer);
    await this.snapping._addFlattenedDependenciesToComponents(consumeComponents);
    const hashPerId = await Promise.all(
      allComps.map(async (comp) => {
        const versionObj = await this.addComponentDataToRepo(comp);
        return {
          id: comp.id,
          hash: versionObj.hash().toString(),
          bitmapEntry: this.workspace.bitMap.getBitmapEntry(comp.id).toPlainObject(),
          isNew: !comp.id.hasVersion(),
        };
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
    // remove new components from the workspace
    const newCompIds = newComps.map((c) => c.id);
    if (newComps.length) {
      await this.remove.removeLocallyByIds(newCompIds);
    }

    return [...modifiedCompIds, ...newCompIds];
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
    const stashModifiedCompsData = stashData.stashCompsData.filter((c) => !c.isNew);
    const stashNewCompsData = stashData.stashCompsData.filter((c) => c.isNew);
    const compIds = stashModifiedCompsData.map((c) => c.id);
    const versionPerId = stashModifiedCompsData.map((c) => c.id.changeVersion(c.hash.toString()));
    const stashedBitmapEntries = stashNewCompsData.map((s) => ({
      ...s.bitmapEntry,
      id: s.id.changeVersion(s.hash.toString()),
    }));

    await this.checkout.checkout({
      ...checkoutProps,
      ids: compIds,
      skipNpmInstall: true,
      versionPerId,
      skipUpdatingBitmap: true,
      promptMergeOptions: true,
      loadStash: true,
      stashedBitmapEntries,
    });

    await this.stashFiles.deleteStashFile(stashFile);

    return [...compIds, ...stashNewCompsData.map((c) => c.id)];
  }

  private async addComponentDataToRepo(component: Component) {
    const previousVersion = component.getSnapHash();
    const consumerComponent = component.state._consumer.clone() as ConsumerComponent;
    consumerComponent.setNewVersion();
    if (!consumerComponent.log) {
      consumerComponent.log = await getBasicLog();
    }
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
  static dependencies = [CLIAspect, WorkspaceAspect, CheckoutAspect, SnappingAspect, RemoveAspect];
  static runtime = MainRuntime;
  static async provider([cli, workspace, checkout, snapping, remove]: [
    CLIMain,
    Workspace,
    CheckoutMain,
    SnappingMain,
    RemoveMain,
  ]) {
    const stashMain = new StashMain(workspace, checkout, snapping, remove);
    const stashCmd = new StashCmd(stashMain);
    stashCmd.commands = [new StashSaveCmd(stashMain), new StashLoadCmd(stashMain), new StashListCmd(stashMain)];
    cli.register(stashCmd);
    return stashMain;
  }
}

StashAspect.addRuntime(StashMain);

export default StashMain;
