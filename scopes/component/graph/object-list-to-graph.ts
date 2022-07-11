import { Graph, Node, Edge } from '@teambit/graph.cleargraph';
import { uniqBy } from 'lodash';
import { BitId } from '@teambit/legacy-bit-id';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';
import { BitObjectList } from '@teambit/legacy/dist/scope/objects/bit-object-list';
import { getAllVersionsInfo } from '@teambit/legacy/dist/scope/component-ops/traverse-versions';
import { Dependency } from './model/dependency';

type BitIdNode = Node<BitId>;
type DependencyEdge = Edge<Dependency>;

export class IdGraph extends Graph<BitId, Dependency> {
  constructor(nodes: BitIdNode[] = [], edges: DependencyEdge[] = []) {
    super(nodes, edges);
  }
}

export async function objectListToGraph(objectList: ObjectList | BitObjectList): Promise<IdGraph> {
  const bitObjectsList = objectList instanceof BitObjectList ? objectList : await objectList.toBitObjects();
  const exportMetadata = bitObjectsList.getExportMetadata();
  const components = bitObjectsList.getComponents();
  const versions = bitObjectsList.getVersions();
  const nodes: BitIdNode[] = [];
  const edges: DependencyEdge[] = [];
  await Promise.all(
    components.map(async (component) => {
      const compFromMetadata = exportMetadata?.exportVersions.find((c) =>
        c.id.isEqualWithoutVersion(component.toBitId())
      );
      const startFrom = compFromMetadata?.head;
      const versionsInfo = await getAllVersionsInfo({
        modelComponent: component,
        versionObjects: versions,
        startFrom,
        throws: false,
      });
      versionsInfo.forEach((versionInfo) => {
        const id = component.toBitId().changeVersion(versionInfo.tag || versionInfo.ref.toString());
        const idStr = id.toString();
        nodes.push(new Node(idStr, id));
        if (!versionInfo.version) {
          return;
        }
        const { dependencies, devDependencies, extensionDependencies } = versionInfo.version.depsIdsGroupedByType;
        const addDep = (depId: BitId, edge: Dependency) => {
          const depIdStr = depId.toString();
          nodes.push(new Node(depIdStr, depId));
          edges.push(new Edge(idStr, depIdStr, edge));
        };
        const runTime = new Dependency('runtime');
        const dev = new Dependency('dev');
        dependencies.forEach((depId) => addDep(depId, runTime));
        [...devDependencies, ...extensionDependencies].forEach((depId) => addDep(depId, dev));
      });
    })
  );
  const uniqNodes = uniqBy(nodes, 'id');
  const idGraph = new IdGraph(uniqNodes, edges);

  return idGraph;
}
