import { Graph } from 'cleargraph';
import { uniqBy } from 'lodash';
import { BitId } from '@teambit/legacy-bit-id';
import { ObjectList } from '@teambit/legacy/dist/scope/objects/object-list';
import { getAllVersionsInfo } from '@teambit/legacy/dist/scope/component-ops/traverse-versions';
import { Dependency } from './model/dependency';

type Node = { id: string; node: BitId };
type Edge = { sourceId: string; targetId: string; edge: Dependency };

export class IdGraph extends Graph<BitId, Dependency> {
  constructor(nodes: Node[] = [], edges: Edge[] = []) {
    super(nodes, edges);
  }
}

export async function objectListToGraph(objectList: ObjectList): Promise<IdGraph> {
  const bitObjectsList = await objectList.toBitObjects();
  const components = bitObjectsList.getComponents();
  const versions = bitObjectsList.getVersions();
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  await Promise.all(
    components.map(async (component) => {
      const versionsInfo = await getAllVersionsInfo({
        modelComponent: component,
        versionObjects: versions,
        throws: false,
      });
      versionsInfo.forEach((versionInfo) => {
        const id = component.toBitId().changeVersion(versionInfo.tag || versionInfo.ref.toString());
        const idStr = id.toString();
        nodes.push({ id: idStr, node: id });
        if (!versionInfo.version) {
          return;
        }
        const { dependencies, devDependencies, extensionDependencies } = versionInfo.version.depsIdsGroupedByType;
        const addDep = (depId: BitId, edge: Dependency) => {
          const depIdStr = depId.toString();
          nodes.push({ id: depIdStr, node: depId });
          edges.push({ sourceId: idStr, targetId: depIdStr, edge });
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
