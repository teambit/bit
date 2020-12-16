import mapSeries from 'p-map-series';
import { Consumer } from '../../consumer';
import BitId from '../../bit-id/bit-id';
import BitIds from '../../bit-id/bit-ids';
import { COMPONENT_ORIGINS } from '../../constants';
import Component from '../../consumer/component/consumer-component';
import Graph from '../../scope/graph/graph';
import logger from '../../logger/logger';

export class GraphFromFsBuilder {
  private graph = new Graph();
  private completed: string[] = [];
  constructor(
    private consumer: Consumer,
    private ignoreIds = new BitIds(),
    private loadComponentsFunc?: (ids: BitId[]) => Promise<Component[]>
  ) {}
  async buildGraph(components: Component[]): Promise<Graph> {
    components.forEach((c) => {
      this.graph.setNode(c.id.toString(), c);
    });
    await mapSeries(components, (component) => this.processOneComponent(component));
    return this.graph;
  }

  private async processOneComponent(component: Component) {
    const compId = component.id;
    if (this.completed.includes(compId.toString())) return;
    const dependencies = await this.loadManyComponents(
      component.dependencies.getAllIds().difference(this.ignoreIds),
      compId
    );
    const devDependencies = await this.loadManyComponents(
      component.devDependencies.getAllIds().difference(this.ignoreIds),
      compId
    );
    const extensionDependencies = await this.loadManyComponents(
      component.extensions.extensionsBitIds.difference(this.ignoreIds),
      compId
    );
    Object.entries(component.depsIdsGroupedByType).forEach(([depType, depIds]) => {
      depIds.forEach((depId) => {
        if (this.ignoreIds.has(depId)) return;
        if (!this.graph.hasNode(depId.toString())) {
          throw new Error(`buildOneComponent: missing node of ${depId.toString()}`);
        }
        this.graph.setEdge(compId.toString(), depId.toString(), depType);
      });
    });
    this.completed.push(compId.toString());
    const allComps = [...dependencies, ...devDependencies, ...extensionDependencies];
    await mapSeries(allComps, (comp) => this.processOneComponent(comp));
  }

  private async loadManyComponents(componentsIds: BitId[], dependenciesOf: BitId): Promise<Component[]> {
    return mapSeries(componentsIds, async (comp: BitId) => {
      const idStr = comp.toString();
      const fromGraph = this.graph.node(idStr);
      if (fromGraph) return fromGraph;
      try {
        const component = await this.loadComponent(comp);
        this.graph.setNode(idStr, component);
        return component;
      } catch (err) {
        logger.error(`failed loading dependencies of ${dependenciesOf.toString()}`);
        throw err;
      }
    });
  }
  private async loadComponent(componentId: BitId): Promise<Component> {
    const idStr = componentId.toString();
    const fromGraph = this.graph.node(idStr);
    if (fromGraph) return fromGraph;
    const componentMap = this.consumer.bitMap.getComponentIfExist(componentId);
    const couldBeModified = componentMap && componentMap.origin !== COMPONENT_ORIGINS.NESTED;
    if (couldBeModified) {
      if (this.loadComponentsFunc) {
        const dependency = await this.loadComponentsFunc([componentId]);
        if (!dependency.length || !dependency[0]) {
          throw new Error(`unable to load ${componentId.toString()} using custom load function`);
        }
        return dependency[0];
      }
      return this.consumer.loadComponentForCapsule(componentId);
    }
    // a dependency might have been installed as a package in the workspace, and as such doesn't
    // have a componentMap.
    const componentFromModel = await this.consumer.loadComponentFromModel(componentId);
    return componentFromModel.clone();
  }
}
