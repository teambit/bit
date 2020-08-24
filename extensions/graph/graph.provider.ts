import { ComponentFactory } from '@teambit/component';
import { ScopeMain } from '@teambit/scope';
import { Workspace } from '@teambit/workspace';

import { GraphBuilder } from './graph-builder';

export type GraphDeps = [Workspace, ScopeMain, ComponentFactory];

export async function provide([workspace, scope, componentFactory]: GraphDeps) {
  return new GraphBuilder(componentFactory, workspace, scope);
}
