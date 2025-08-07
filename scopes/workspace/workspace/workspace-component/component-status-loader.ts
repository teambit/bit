import mapSeries from 'p-map-series';
import type { ComponentID } from '@teambit/component-id';
import { ComponentIdList } from '@teambit/component-id';
import { BitError } from '@teambit/bit-error';
import type { ModelComponent } from '@teambit/objects';
import { VERSION_ZERO } from '@teambit/objects';
import type { Consumer } from '@teambit/legacy.consumer';
import { ComponentsPendingImport, ComponentOutOfSync } from '@teambit/legacy.consumer';
import { LATEST } from '@teambit/legacy.constants';
import { MissingBitMapComponent } from '@teambit/legacy.bit-map';
import type { ConsumerComponent } from '@teambit/legacy.consumer-component';
import { ComponentNotFoundInPath } from '@teambit/legacy.consumer-component';
import type { Workspace } from '..';

export type ComponentStatusLegacy = {
  modified: boolean;
  newlyCreated: boolean;
  deleted: boolean;
  staged: boolean;
  notExist: boolean;
  missingFromScope: boolean;
};

export type ComponentStatusResult = { id: ComponentID; status: ComponentStatusLegacy };

export class ComponentStatusLoader {
  private _componentsStatusCache: Record<string, any> = {}; // cache loaded components
  constructor(private workspace: Workspace) {}

  get consumer(): Consumer {
    return this.workspace.consumer;
  }

  async getManyComponentsStatuses(ids: ComponentID[]): Promise<ComponentStatusResult[]> {
    const results: ComponentStatusResult[] = [];
    await mapSeries(ids, async (id) => {
      const status = await this.getComponentStatusById(id);
      results.push({ id, status });
    });
    return results;
  }

  /**
   * Get a component status by ID. Return a ComponentStatus object.
   * Keep in mind that a result can be a partial object of ComponentStatus, e.g. { notExist: true }.
   * Each one of the ComponentStatus properties can be undefined, true or false.
   * As a result, in order to check whether a component is not modified use (status.modified === false).
   * Don't use (!status.modified) because a component may not exist and the status.modified will be undefined.
   *
   * The status may have 'true' for several properties. For example, a component can be staged and modified at the
   * same time.
   *
   * The result is cached per ID and can be called several times with no penalties.
   */
  async getComponentStatusById(id: ComponentID): Promise<ComponentStatusLegacy> {
    if (!this._componentsStatusCache[id.toString()]) {
      // don't do this: `this._componentsStatusCache[id.toString()] = await this.getStatus(id);`
      // yes, it doesn't make sense right? turns out that "getStatus" can call `linkIfMissingWorkspaceAspects` which
      // calls `linkToNodeModulesByIds` which deletes this cache. and makes this: `this._componentsStatusCache[id.toString()]` undefined.
      const result = await this.getStatus(id);
      this._componentsStatusCache[id.toString()] = result;
    }
    return this._componentsStatusCache[id.toString()];
  }

  private async getStatus(id: ComponentID) {
    // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const status: ComponentStatusLegacy = {};
    const componentFromModel: ModelComponent | undefined = await this.consumer.scope.getModelComponentIfExist(id);
    let componentFromFileSystem: ConsumerComponent | undefined;
    try {
      // change to 'latest' before loading from FS. don't change to null, otherwise, it'll cause
      // loadOne to not find model component as it assumes there is no version
      // also, don't leave the id as is, otherwise, it'll cause issues with import --merge, when
      // imported version is bigger than .bitmap, it won't find it and will consider as deleted
      const { components, removedComponents } = await this.consumer.loadComponents(
        new ComponentIdList(id.changeVersion(LATEST))
      );
      if (removedComponents.length) {
        status.deleted = true;
        return status;
      }
      componentFromFileSystem = components[0];
    } catch (err: any) {
      if (err instanceof ComponentNotFoundInPath || err instanceof MissingBitMapComponent) {
        // the file/s have been deleted or the component doesn't exist in bit.map file
        if (componentFromModel) status.deleted = true;
        else status.notExist = true;
        return status;
      }
      if (err instanceof ComponentsPendingImport) {
        status.missingFromScope;
        return status;
      }
      throw err;
    }
    if (!componentFromModel) {
      status.newlyCreated = true;
      return status;
    }
    if (componentFromModel.getHeadRegardlessOfLaneAsTagOrHash(true) === VERSION_ZERO) {
      status.newlyCreated = true;
      return status;
    }

    const lane = await this.consumer.getCurrentLaneObject();
    const versionFromFs = componentFromFileSystem.id.version;
    status.staged = await componentFromModel.isLocallyChanged(
      this.consumer.scope.objects,
      lane,
      componentFromFileSystem.id
    );

    const idStr = id.toString();
    if (!componentFromFileSystem.id.hasVersion()) {
      throw new ComponentOutOfSync(idStr);
    }
    // TODO: instead of doing that like this we should use:
    // const versionFromModel = await componentFromModel.loadVersion(versionFromFs, this.consumer.scope.objects);
    // it looks like it's exactly the same code but it's not working from some reason
    const versionRef = componentFromModel.getRef(versionFromFs);
    if (!versionRef) throw new BitError(`version ${versionFromFs} was not found in ${idStr}`);
    const versionFromModel = await this.consumer.scope.getObject(versionRef.hash);
    if (!versionFromModel) {
      throw new BitError(`failed loading version ${versionFromFs} of ${idStr} from the scope`);
    }
    // @ts-expect-error AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    status.modified = await this.consumer.isComponentModified(versionFromModel, componentFromFileSystem);
    return status;
  }

  clearOneComponentCache(id: ComponentID) {
    delete this._componentsStatusCache[id.toString()];
  }

  clearCache() {
    this._componentsStatusCache = {};
  }
}
