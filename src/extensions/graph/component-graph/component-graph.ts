import { Graph } from 'cleargraph';
import Component from '../../component/component';
import { Dependency } from '../index';
import { Consumer } from '../../../consumer';
import ComponentsList from '../../../consumer/component/components-list';
import { ModelComponent } from '../../../scope/models';

export default class ComponentGraph extends Graph<Component, Dependency> {
  static async buildGraphFromWorkspace(consumer: Consumer, onlyLatest = false, reverse = false): Promise<Graph> {
    const componentsList = new ComponentsList(consumer);
    const workspaceComponents: Component[] = await componentsList.getFromFileSystem();
    const graph = new Graph();
    const allModelComponents: ModelComponent[] = await consumer.scope.list();
    const buildGraphP = allModelComponents.map(async modelComponent => {
      const latestVersion = modelComponent.latest();
      const buildVersionP = modelComponent.listVersions().map(async versionNum => {
        if (onlyLatest && latestVersion !== versionNum) return;
        const id = modelComponent.toBitId().changeVersion(versionNum);
        const componentFromWorkspace = workspaceComponents.find(comp => comp.id.isEqual(id));
        // if the same component exists in the workspace, use it as it might be modified
        const version =
          componentFromWorkspace || (await modelComponent.loadVersion(versionNum, consumer.scope.objects));
        if (!version) {
          // a component might be in the scope with only the latest version (happens when it's a nested dep)
          return;
        }
        this._addDependenciesToGraph(id, graph, version, reverse);
      });
      await Promise.all(buildVersionP);
    });
    await Promise.all(buildGraphP);
    workspaceComponents.forEach((component: Component) => {
      const id = component.id;
      this._addDependenciesToGraph(id, graph, component, reverse);
    });
    return graph;
  }
}
