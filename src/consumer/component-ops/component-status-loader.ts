import mapSeries from 'p-map-series';
import { Consumer } from '..';
import { BitId } from '../../bit-id';
import { COMPONENT_ORIGINS, LATEST } from '../../constants';
import ShowDoctorError from '../../error/show-doctor-error';
import { ModelComponent } from '../../scope/models';
import { MissingBitMapComponent } from '../bit-map/exceptions';
import ComponentsPendingImport from '../component-ops/exceptions/components-pending-import';
import ComponentNotFoundInPath from '../component/exceptions/component-not-found-in-path';
import MissingFilesFromComponent from '../component/exceptions/missing-files-from-component';
import ComponentOutOfSync from '../exceptions/component-out-of-sync';

export type ComponentStatus = {
  modified: boolean;
  newlyCreated: boolean;
  deleted: boolean;
  staged: boolean;
  notExist: boolean;
  missingFromScope: boolean;
  nested: boolean; // when a component is nested, it doesn't matter whether it was modified
};

export type ComponentStatusResult = { id: BitId; status: ComponentStatus };

export class ComponentStatusLoader {
  private _componentsStatusCache: Record<string, any> = {}; // cache loaded components
  constructor(private consumer: Consumer) {}

  async getManyComponentsStatuses(ids: BitId[]): Promise<ComponentStatusResult[]> {
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
  async getComponentStatusById(id: BitId): Promise<ComponentStatus> {
    if (!this._componentsStatusCache[id.toString()]) {
      this._componentsStatusCache[id.toString()] = await this.getStatus(id);
    }
    return this._componentsStatusCache[id.toString()];
  }

  private async getStatus(id: BitId) {
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    const status: ComponentStatus = {};
    const componentFromModel: ModelComponent | undefined = await this.consumer.scope.getModelComponentIfExist(id);
    let componentFromFileSystem;
    try {
      // change to 'latest' before loading from FS. don't change to null, otherwise, it'll cause
      // loadOne to not find model component as it assumes there is no version
      // also, don't leave the id as is, otherwise, it'll cause issues with import --merge, when
      // imported version is bigger than .bitmap, it won't find it and will consider as deleted
      componentFromFileSystem = await this.consumer.loadComponent(id.changeVersion(LATEST));
    } catch (err) {
      if (
        err instanceof MissingFilesFromComponent ||
        err instanceof ComponentNotFoundInPath ||
        err instanceof MissingBitMapComponent
      ) {
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

    if (componentFromFileSystem.componentMap.origin === COMPONENT_ORIGINS.NESTED) {
      status.nested = true;
      return status;
    }
    if (!componentFromModel) {
      status.newlyCreated = true;
      return status;
    }

    const lane = await this.consumer.getCurrentLaneObject();
    status.staged = await componentFromModel.isLocallyChanged(lane, this.consumer.scope.objects);
    const versionFromFs = componentFromFileSystem.id.version;
    const idStr = id.toString();
    if (!componentFromFileSystem.id.hasVersion()) {
      throw new ComponentOutOfSync(idStr);
    }
    // TODO: instead of doing that like this we should use:
    // const versionFromModel = await componentFromModel.loadVersion(versionFromFs, this.consumer.scope.objects);
    // it looks like it's exactly the same code but it's not working from some reason
    const versionRef = componentFromModel.getRef(versionFromFs);
    if (!versionRef) throw new ShowDoctorError(`version ${versionFromFs} was not found in ${idStr}`);
    const versionFromModel = await this.consumer.scope.getObject(versionRef.hash);
    if (!versionFromModel) {
      throw new ShowDoctorError(`failed loading version ${versionFromFs} of ${idStr} from the scope`);
    }
    // @ts-ignore AUTO-ADDED-AFTER-MIGRATION-PLEASE-FIX!
    status.modified = await this.consumer.isComponentModified(versionFromModel, componentFromFileSystem);
    return status;
  }
}
