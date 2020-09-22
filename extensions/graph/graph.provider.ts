import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';

import { GraphBuilder } from './graph-builder';

export type GraphDeps = [Workspace, ScopeMain];

export async function provide([workspace, scope]: GraphDeps) {
  return new GraphBuilder(workspace, scope);
}
