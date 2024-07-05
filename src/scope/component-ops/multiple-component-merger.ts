import { pMapPool } from '@teambit/legacy.utils';
import { concurrentComponentsLimit } from '@teambit/harmony.modules.concurrency';
import { ModelComponent } from '../models';
import { SourceRepository } from '../repositories';
import { ModelComponentMerger } from './model-components-merger';

export type ComponentsPerRemote = { [remoteName: string]: ModelComponent[] };
type ModelComponentPerRemote = { [remoteName: string]: ModelComponent };
type ComponentsPerId = { [id: string]: ModelComponentPerRemote };

export class MultipleComponentMerger {
  private compsPerIds: ComponentsPerId;
  constructor(private componentsPerRemote: ComponentsPerRemote, private sources: SourceRepository) {
    this.compsPerIds = this.convertToCompsPerIds();
  }

  totalComponents(): number {
    return Object.keys(this.compsPerIds).length;
  }

  totalRemotes(): number {
    return Object.keys(this.componentsPerRemote).length;
  }

  async merge(): Promise<ModelComponent[]> {
    const ids = Object.keys(this.compsPerIds);
    const components = await pMapPool(
      ids,
      async (id) => {
        const comps = this.compsPerIds[id];
        return this.mergeModelComponentFromMultipleRemotes(comps);
      },
      { concurrency: concurrentComponentsLimit() }
    );

    return components;
  }

  private convertToCompsPerIds(): ComponentsPerId {
    const compsPerIds: ComponentsPerId = {};
    Object.keys(this.componentsPerRemote).forEach((remoteName) => {
      const components = this.componentsPerRemote[remoteName];
      components.forEach((comp) => {
        const id = comp.id();
        if (!compsPerIds[id]) compsPerIds[id] = {};
        compsPerIds[id][remoteName] = comp;
      });
    });
    return compsPerIds;
  }

  private async mergeModelComponentFromMultipleRemotes(comps: ModelComponentPerRemote): Promise<ModelComponent> {
    const remotes = Object.keys(comps);
    const firstComp = comps[remotes[0]];
    const compFromOrigin = comps[firstComp.scope as string];
    const existingComp = await this.sources._findComponent(firstComp);

    if (compFromOrigin) {
      // if one of the remotes is the origin, ignore the rest. only merge this one.
      return this.mergeOne(compFromOrigin, true, existingComp);
    }

    // this mergedComp gets updates for every remote
    let mergedComp = existingComp;
    for await (const remote of remotes) {
      const comp = comps[remote];
      mergedComp = await this.mergeOne(comp, false, mergedComp);
    }
    return mergedComp as ModelComponent;
  }

  /**
   * merge the imported component with the existing component in the local scope.
   * when importing a component, save the remote head into the remote main ref file.
   * unless this component arrived as a cache of the dependent, which its head might be wrong
   */
  private async mergeOne(
    incomingComp: ModelComponent,
    isIncomingFromOrigin: boolean,
    existingComp?: ModelComponent
  ): Promise<ModelComponent> {
    if (!existingComp || (existingComp && incomingComp.isEqual(existingComp))) {
      if (isIncomingFromOrigin) incomingComp.remoteHead = incomingComp.head;
      return incomingComp;
    }
    const modelComponentMerger = new ModelComponentMerger(existingComp, incomingComp, true, isIncomingFromOrigin);
    const { mergedComponent } = await modelComponentMerger.merge();
    if (isIncomingFromOrigin) mergedComponent.remoteHead = incomingComp.head;
    return mergedComponent;
  }
}
