import { Workspace } from '../workspace';
import { ComponentGraph } from './component-graph';
import { ComponentFactory } from '../component';

export type GraphDeps = [Workspace, ComponentFactory];

export async function provide(_config: {}, [workspace, componentFactory]: GraphDeps) {
  return ComponentGraph.build(workspace, componentFactory);
}
