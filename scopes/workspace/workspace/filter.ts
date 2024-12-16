import { ComponentID, ComponentIdList } from '@teambit/component-id';
import pMapSeries from 'p-map-series';
import { ModelComponent } from '@teambit/scope.objects';
import { compact } from 'lodash';
import { Workspace } from './workspace';

export const statesFilter = [
  'new',
  'modified',
  'deprecated',
  'deleted',
  'snappedOnMain',
  'softTagged',
  'codeModified',
  'localOnly',
] as const;
export type StatesFilter = (typeof statesFilter)[number];

export class Filter {
  constructor(private workspace: Workspace) {}

  async by(criteria: StatesFilter | string, ids: ComponentID[]): Promise<ComponentID[]> {
    return criteria.includes(':') ? this.byMultiParamState(criteria, ids) : this.byState(criteria as StatesFilter, ids);
  }

  async byState(state: StatesFilter, ids: ComponentID[]): Promise<ComponentID[]> {
    const statePerMethod = {
      new: this.byNew,
      modified: this.byModified,
      deprecated: this.byDeprecated,
      deleted: this.byDeleted,
      snappedOnMain: this.bySnappedOnMain,
      softTagged: this.bySoftTagged,
      codeModified: this.byCodeModified,
      localOnly: this.byLocalOnly,
    };
    if (!statePerMethod[state]) {
      throw new Error(`state ${state} is not recognized, possible values: ${statesFilter.join(', ')}`);
    }
    return statePerMethod[state].bind(this)(ids);
  }

  async byMultiParamState(state: string, ids: ComponentID[]): Promise<ComponentID[]> {
    const stateSplit = state.split(':');
    if (stateSplit.length < 2) {
      throw new Error(`byMultiParamState expect the state to have at least one param after the colon, got ${state}`);
    }
    const [stateName, ...stateParams] = stateSplit;
    if (stateName === 'env') {
      return this.byEnv(stateParams[0], ids);
    }
    throw new Error(`byMultiParamState expect the state to be one of the following: ['env'], got ${stateName}`);
  }

  async byEnv(env: string, withinIds?: ComponentID[]): Promise<ComponentID[]> {
    const ids = withinIds || this.workspace.listIds();
    const comps = await this.workspace.getMany(ids);
    const compsUsingEnv = comps.filter((c) => {
      const envId = this.workspace.envs.getEnvId(c);
      if (envId === env) return true;
      // try without version
      const envIdWithoutVer = ComponentID.getStringWithoutVersion(envId);
      return envIdWithoutVer === env;
    });
    return compsUsingEnv.map((c) => c.id);
  }

  async byModified(withinIds?: ComponentID[]): Promise<ComponentID[]> {
    const ids = withinIds || (await this.workspace.listIds());
    const comps = await this.workspace.getMany(ids);
    const modifiedIds = await Promise.all(comps.map(async (comp) => ((await comp.isModified()) ? comp.id : undefined)));
    return compact(modifiedIds);
  }

  async byCodeModified(withinIds?: ComponentID[]): Promise<ComponentID[]> {
    const ids = withinIds || (await this.workspace.listIds());
    const compFiles = await pMapSeries(ids, (id) => this.workspace.getFilesModification(id));
    const modifiedIds = compFiles.filter((c) => c.isModified()).map((c) => c.id);
    return compact(modifiedIds);
  }

  byLocalOnly(withinIds?: ComponentID[]): ComponentID[] {
    const ids = withinIds || this.workspace.listIds();
    return ids.filter((id) => this.workspace.bitMap.getBitmapEntry(id, { ignoreVersion: true }).localOnly);
  }

  async byNew(withinIds?: ComponentID[]): Promise<ComponentID[]> {
    const ids = withinIds || (await this.workspace.listIds());
    return ids.filter((id) => !id.hasVersion());
  }

  async byDeprecated(withinIds?: ComponentID[]) {
    const ids = withinIds || (await this.workspace.listIds());
    const comps = await this.workspace.getMany(ids);
    const results = await Promise.all(
      comps.map(async (c) => {
        const modelComponent = await this.workspace.consumer.scope.getModelComponentIfExist(c.id);
        const deprecated = await modelComponent?.isDeprecated(this.workspace.consumer.scope.objects);
        return deprecated ? c.id : null;
      })
    );
    return compact(results);
  }

  async byDeleted(withinIds?: ComponentID[]) {
    const ids = withinIds || (await this.workspace.listIds());
    const comps = await this.workspace.getMany(ids);
    const deletedIds = comps.filter((c) => c.isDeleted()).map((c) => c.id);
    return compact(deletedIds);
  }

  byDuringMergeState(): ComponentIdList {
    const unmergedComponents = this.workspace.scope.legacyScope.objects.unmergedComponents.getComponents();
    return ComponentIdList.fromArray(unmergedComponents.map((u) => ComponentID.fromObject(u.id)));
  }

  /**
   * list components that their head is a snap, not a tag.
   * this is relevant only when the lane is the default (main), otherwise, the head is always a snap.
   * components that are during-merge are filtered out, we don't want them during tag and don't want
   * to show them in the "snapped" section in bit-status.
   */
  async bySnappedOnMain(withinIds?: ComponentID[]) {
    if (!this.workspace.isOnMain()) {
      return [];
    }
    const ids = withinIds || (await this.workspace.listIds());
    const compIds = ComponentIdList.fromArray(ids);
    const componentsFromModel = await this.getModelComps(ids);
    const compsDuringMerge = this.byDuringMergeState();
    const localOnly = this.workspace.listLocalOnly();
    const comps = componentsFromModel
      .filter((c) => compIds.hasWithoutVersion(c.toComponentId()))
      .filter((c) => !compsDuringMerge.hasWithoutVersion(c.toComponentId()))
      .filter((c) => !localOnly.hasWithoutVersion(c.toComponentId()))
      .filter((c) => c.isHeadSnap());
    return comps.map((c) => c.toComponentIdWithHead());
  }

  bySoftTagged(withinIds?: ComponentID[]): ComponentID[] {
    const withCompIds = ComponentIdList.fromArray(withinIds || []);
    const all = this.workspace.consumer.bitMap.components.filter((c) => c.nextVersion).map((c) => c.id);
    return withinIds ? all.filter((id) => withCompIds.hasWithoutVersion(id)) : all;
  }

  private async getModelComps(ids: ComponentID[]): Promise<ModelComponent[]> {
    const comps = await Promise.all(ids.map((id) => this.workspace.scope.getBitObjectModelComponent(id, false)));
    return compact(comps);
  }
}
