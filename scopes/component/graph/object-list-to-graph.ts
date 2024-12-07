import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { uniqBy } from 'lodash';
import { ComponentID } from '@teambit/component-id';
import type { ObjectList } from '@teambit/scope.objects';
import { BitObjectList } from '@teambit/scope.objects';
import { getAllVersionsInfo } from '@teambit/component.snap-distance';
import { Dependency } from './model/dependency';

type BitIdNode = Node<ComponentID>;
type DependencyEdge = Edge<Dependency>;

export class IdGraph extends Graph<ComponentID, Dependency> {
  constructor(nodes: BitIdNode[] = [], edges: DependencyEdge[] = []) {
    super(nodes, edges);
  }
}

export async function objectListToGraph(objectList: ObjectList): Promise<IdGraph> {
  const bitObjectsList = await objectList.toBitObjects();

  return bitObjectListToGraph(bitObjectsList);
}

export async function bitObjectListToGraph(bitObjectsList: BitObjectList): Promise<IdGraph> {
  const exportMetadata = bitObjectsList.getExportMetadata();
  const components = bitObjectsList.getComponents();
  const versions = bitObjectsList.getVersions();
  const nodes: BitIdNode[] = [];
  const edges: DependencyEdge[] = [];
  await Promise.all(
    components.map(async (component) => {
      const compFromMetadata = exportMetadata?.exportVersions.find((c) =>
        c.id.isEqualWithoutVersion(component.toComponentId())
      );
      const startFrom = compFromMetadata?.head;
      const versionsInfo = await getAllVersionsInfo({
        modelComponent: component,
        versionObjects: versions,
        startFrom,
        throws: false,
      });
      versionsInfo.forEach((versionInfo) => {
        const id = component.toComponentId().changeVersion(versionInfo.tag || versionInfo.ref.toString());
        const idStr = id.toString();
        nodes.push(new Node(idStr, id));
        if (!versionInfo.version) {
          return;
        }
        const { dependencies, devDependencies, peerDependencies, extensionDependencies } =
          versionInfo.version.depsIdsGroupedByType;
        const addDep = (depId: ComponentID, edge: Dependency) => {
          const depIdStr = depId.toString();
          nodes.push(new Node(depIdStr, depId));
          edges.push(new Edge(idStr, depIdStr, edge));
        };
        const runTime = new Dependency('runtime');
        const dev = new Dependency('dev');
        const peer = new Dependency('peer');
        dependencies.forEach((depId) => addDep(depId, runTime));
        [...devDependencies, ...extensionDependencies].forEach((depId) => addDep(depId, dev));
        peerDependencies.forEach((depId) => addDep(depId, peer));
      });
    })
  );
  const uniqNodes = uniqBy(nodes, 'id');
  const idGraph = new IdGraph(uniqNodes, edges);

  return idGraph;
}
