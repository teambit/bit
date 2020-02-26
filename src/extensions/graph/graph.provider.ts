import { Workspace } from '../workspace';
import { ComponentGraph } from './component-graph';

export type GraphDeps = [Workspace];

export async function provide(_config: {}, [workspace]: GraphDeps) {
  return ComponentGraph.build(workspace);
}
