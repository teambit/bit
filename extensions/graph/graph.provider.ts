import { Workspace } from '@teambit/workspace';
import { ComponentFactory } from '@teambit/component';
import { GraphBuilder } from './graph-builder';
import { ScopeMain } from '@teambit/scope';

export type GraphDeps = [Workspace, ScopeMain, ComponentFactory];

export async function provide([workspace, scope, componentFactory]: GraphDeps) {
  return new GraphBuilder(componentFactory, workspace, scope);
}
