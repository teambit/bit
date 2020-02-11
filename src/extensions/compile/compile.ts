import { Workspace } from '../workspace';
import ConsumerComponent from '../../consumer/component';
import { BitId } from '../../bit-id';
import { ResolvedComponent } from '../workspace/resolved-component';
import buildComponent from '../../consumer/component-ops/build-component';
import { Component } from '../component';
import { ComponentCapsule } from '../capsule-ext';
import DataToPersist from '../../consumer/component/sources/data-to-persist';

export type ComponentsAndCapsules = {
  consumerComponent: ConsumerComponent;
  component: Component;
  capsule: ComponentCapsule;
};

export class Compile {
  constructor(private workspace: Workspace) {}
  async compile(componentsIds: string[], { verbose, noCache }: { verbose: boolean; noCache: boolean }) {
    const componentsAndCapsules = await this.getComponentsAndCapsules(componentsIds);
    // @todo: how do I know what are my capsule dirs?
    // eslint-disable-next-line no-console
    componentsAndCapsules.map(c => console.log(c.capsule.wrkDir));
    await this.populateDists(componentsAndCapsules, { verbose, noCache });
    const compileResults = await this.buildAll(componentsAndCapsules);
    this.workspace.consumer.onDestroy();
    return { compileResults, componentsAndCapsules };
  }

  private async getComponentsAndCapsules(componentsIds: string[]): Promise<ComponentsAndCapsules[]> {
    const bitIds = this.getBitIds(componentsIds);
    const resolvedComponents: ResolvedComponent[] = await this.workspace.load(bitIds.map(id => id.toString()));
    return Promise.all(
      resolvedComponents.map(async (resolvedComponent: ResolvedComponent) => {
        // @todo: it says id._legacy "do not use this", do I have a better option to get the id?
        const consumerComponent = await this.workspace.consumer.loadComponent(resolvedComponent.component.id._legacy);
        return {
          consumerComponent,
          component: resolvedComponent.component,
          capsule: resolvedComponent.capsule
        };
      })
    );
  }

  private getBitIds(componentsIds: string[]): BitId[] {
    if (componentsIds.length) {
      return componentsIds.map(idStr => this.workspace.consumer.getParsedId(idStr));
    }
    return this.workspace.consumer.bitMap.getAuthoredAndImportedBitIds();
  }

  private async buildAll(componentsAndCapsules: ComponentsAndCapsules[]): Promise<{ [id: string]: string[] }> {
    const buildResults = {};
    await Promise.all(
      componentsAndCapsules.map(async componentAndCapsule => {
        const dataToPersist = new DataToPersist();
        const distsFiles = componentAndCapsule.consumerComponent.dists.get();
        distsFiles.map(d => d.updatePaths({ newBase: 'dist' }));
        dataToPersist.addManyFiles(distsFiles);
        await dataToPersist.persistAllToCapsule(componentAndCapsule.capsule);
        buildResults[componentAndCapsule.consumerComponent.id.toString()] = distsFiles.map(d => d.path);
      })
    );
    return buildResults;
  }

  private async populateDists(
    componentsAndCapsules: ComponentsAndCapsules[],
    { verbose, noCache }: { verbose: boolean; noCache: boolean }
  ) {
    const components = componentsAndCapsules.map(c => c.consumerComponent);
    await Promise.all(
      components.map(component =>
        buildComponent({
          component,
          scope: this.workspace.consumer.scope,
          consumer: this.workspace.consumer,
          verbose,
          noCache
        })
      )
    );
  }
}
